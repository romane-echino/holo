import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EmojiPicker from 'emoji-picker-react'
import { Theme } from 'emoji-picker-react'
import * as prettier from 'prettier/standalone'
import {
  turndownService,
  parseMarkdownToHtml,
  splitMarkdownFrontMatter,
  getEditableMarkdownHeader,
  updateMarkdownHeaderField,
  updateTagsInMarkdown,
  updateMarkdownBooleanHeaderField,
  updateMarkdownBody,
} from './lib/markdown'
import * as prettierPluginBabel from 'prettier/plugins/babel'
import * as prettierPluginEstree from 'prettier/plugins/estree'
import * as prettierPluginTypescript from 'prettier/plugins/typescript'
import * as prettierPluginPostcss from 'prettier/plugins/postcss'
import * as prettierPluginHtml from 'prettier/plugins/html'
import * as prettierPluginMarkdown from 'prettier/plugins/markdown'
import { useTableInteractions } from './components/table/useTableInteractions'
import { AppHeader } from './components/AppHeader'
import { AiDialogModal } from './components/AiDialogModal'
import { AppModals } from './components/AppModals'
import { AppSidebar } from './components/AppSidebar'
import { EditorCanvas } from './components/EditorCanvas'
import { EditorEmptyState } from './components/EditorEmptyState'
import { EditorOverlays } from './components/EditorOverlays'
import { EditorRightToc } from './components/EditorRightToc'
import { EditorTopBar } from './components/EditorTopBar'
import { SettingsModal } from './components/SettingsModal'
import type { EditableMarkdownHeader, FilePathStats, SlashCommand, WysiwygCommand } from './types/editor'
import type {
  NameDialog,
  GitDialog,
  CloneDialog,
  ConfirmDialogState,
  ChangelogEntry,
} from './types/shared'

type NodeType = 'file' | 'directory'

type TreeNode = {
  name: string
  path: string
  type: NodeType
  archivedOriginalPath?: string
  children?: TreeNode[]
}

type OpenFolderResult = {
  rootPath: string
  tree: TreeNode
} | null

type GitState = {
  isRepo: boolean
  branch: string | null
  localChanges: number
  incoming: number
  outgoing: number
  conflictedFiles: string[]
  lastFetchAt: string | null
  error: string | null
}

type SyncFeedback = {
  status: 'idle' | 'success' | 'warning' | 'error'
  message: string | null
  at: string | null
}

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type ContextMenuState = {
  x: number
  y: number
  node: TreeNode
}

type ArchivedFileEntry = {
  archivedPath: string
  originalPath: string
  name: string
}

type SearchResultItem = {
  path: string
  name: string
  excerpt: string
  matchType: 'content' | 'tag' | 'archive'
  isArchived?: boolean
  archivedPath?: string
  originalPath?: string
}

type TocItem = {
  level: number
  text: string
  headingIndex: number
}

type FileMeta = {
  title: string
  description: string
  isTemplate: boolean
}

type ImageStorageMode = 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'

// ChangelogEntry imported from shared types

const DEFAULT_GIT_STATE: GitState = {
  isRepo: false,
  branch: null,
  localChanges: 0,
  incoming: 0,
  outgoing: 0,
  conflictedFiles: [],
  lastFetchAt: null,
  error: null,
}

const DEFAULT_SYNC_FEEDBACK: SyncFeedback = {
  status: 'idle',
  message: null,
  at: null,
}

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.2.8',
    releasedAt: '2026-05-08',
    items: [
      'Export PDF : bouton déplacé à côté de « Copier le lien » sur le fichier actif.',
      'Liens dans l’éditeur : indication « Ctrl+clic » et ouverture via Ctrl/Cmd+clic.',
      'Stabilité édition : correctif du blocage après changement de fichier sans sauvegarde.',
      'Responsive : accès à la table des matières en mode compact via le bouton « Plan ».',
      'Fenêtre desktop : largeur minimale réduite à 400px.',
      'Templates : variables ($DATE, $AUTHOR…) détectées et pré-remplies, saisies dans le dialog de création.',
    ],
  },
  {
    version: '0.2.7',
    releasedAt: '2026-05-07',
    items: [
      'Templates : définir un fichier comme modèle et créer un document depuis un modèle.',
      'Mode lecture seule : switch global près du profil et blocage des actions d’édition.',
      'Recherche : prise en compte du titre, du nom de fichier et de la description.',
      'Récents : correction de l’ouverture du bon fichier.',
      'Navigation fichiers : ouverture plus rapide (suppression du fetch distant bloquant).',
    ],
  },
  {
    version: '0.2.6',
    releasedAt: '2026-05-06',
    items: [
      'Migration de la configuration globale vers ~/.holo/holo-config.json.',
      'Correction du lancement via lien holo:// (plus de re-saisie du profil et des clés).',
      'Améliorations de stabilité sur les actions de fichiers.',
    ],
  },
]

function normalizeGitState(input: Partial<GitState> | null | undefined): GitState {
  return {
    ...DEFAULT_GIT_STATE,
    ...(input ?? {}),
    conflictedFiles: Array.isArray(input?.conflictedFiles) ? input.conflictedFiles : [],
  }
}

function getFriendlyGitErrorMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase()

  if (
    /authentication failed|could not read username|permission denied \(publickey\)|could not read from remote repository|repository not found/.test(
      message,
    )
  ) {
    return 'Échec de connexion Git distante. Holo ne stocke pas tes identifiants : Git utilise ta configuration système (SSH ou gestionnaire d’identifiants). Vérifie cette configuration puis réessaie Synchroniser.'
  }

  if (/could not resolve host|name or service not known|network is unreachable|timed out/.test(message)) {
    return 'Impossible de joindre le dépôt distant (réseau/DNS). Vérifie la connexion Internet puis réessaie.'
  }

  return rawMessage
}

function isLikelyGitAuthError(rawMessage: string | null | undefined): boolean {
  if (!rawMessage) return false
  const message = rawMessage.toLowerCase()
  return /authentication failed|could not read username|permission denied \(publickey\)|could not read from remote repository|repository not found|credentials|identifiants|ssh/.test(message)
}

const MARKDOWN_LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?/

function isMarkdownListItemLine(line: string): boolean {
  return MARKDOWN_LIST_ITEM_PATTERN.test(line)
}

function getMarkdownListOutdentSize(line: string): number {
  if (line.startsWith('\t')) return 1
  if (line.startsWith('  ')) return 2
  if (line.startsWith(' ')) return 1
  return 0
}

function applyMarkdownListTabBehavior(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
): {
  handled: boolean
  nextText: string
  nextSelectionStart: number
  nextSelectionEnd: number
} {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length))
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length))
  const blockStart = text.lastIndexOf('\n', Math.max(0, safeStart - 1)) + 1
  const normalizedEnd = safeEnd > blockStart && text[safeEnd - 1] === '\n' ? safeEnd - 1 : safeEnd
  const nextLineBreakIndex = text.indexOf('\n', normalizedEnd)
  const blockEnd = nextLineBreakIndex === -1 ? text.length : nextLineBreakIndex
  const selectedBlock = text.slice(blockStart, blockEnd)
  const lines = selectedBlock.split('\n')
  const handledLines = lines.map((line) => isMarkdownListItemLine(line))

  if (!handledLines.some(Boolean)) {
    return {
      handled: false,
      nextText: text,
      nextSelectionStart: safeStart,
      nextSelectionEnd: safeEnd,
    }
  }

  const removals: number[] = []
  const nextLines = lines.map((line, index) => {
    if (!handledLines[index]) {
      removals[index] = 0
      return line
    }

    if (!outdent) {
      removals[index] = 0
      return `  ${line}`
    }

    const removal = getMarkdownListOutdentSize(line)
    removals[index] = removal
    return removal > 0 ? line.slice(removal) : line
  })

  const nextBlock = nextLines.join('\n')
  const nextText = `${text.slice(0, blockStart)}${nextBlock}${text.slice(blockEnd)}`
  const deltas = handledLines.map((handled, index) => {
    if (!handled) return 0
    return outdent ? -removals[index] : 2
  })

  const adjustBoundary = (boundary: number) => {
    const relative = boundary - blockStart
    let adjusted = relative
    let lineOffset = 0

    for (let index = 0; index < lines.length; index += 1) {
      if (handledLines[index] && relative >= lineOffset) {
        adjusted += deltas[index]
      }
      lineOffset += lines[index].length + 1
    }

    return Math.max(blockStart, Math.min(blockStart + adjusted, blockStart + nextBlock.length))
  }

  return {
    handled: true,
    nextText,
    nextSelectionStart: adjustBoundary(safeStart),
    nextSelectionEnd: adjustBoundary(safeEnd),
  }
}

const TEMPLATE_VARIABLE_RE = /\$[A-Z][A-Z0-9_]*/g

function extractTemplateVariables(content: string): string[] {
  const matches = content.match(TEMPLATE_VARIABLE_RE)
  return matches ? [...new Set(matches)] : []
}

function applyTemplateVariables(content: string, vars: Record<string, string>): string {
  return content.replace(TEMPLATE_VARIABLE_RE, (match) => vars[match] ?? match)
}

function normalizeVersionLabel(value: string): string {
  return value.trim().replace(/^v/i, '')
}

function getParentPath(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index <= 0) {
    return targetPath
  }

  return normalized.slice(0, index)
}

function getBaseName(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index < 0) {
    return normalized
  }

  return normalized.slice(index + 1)
}

function getDirectoryTarget(rootPath: string | null, selectedPath: string | null, selectedType: NodeType | null) {
  if (!rootPath) {
    return null
  }

  if (!selectedPath || !selectedType) {
    return rootPath
  }

  if (selectedType === 'directory') {
    return selectedPath
  }

  return getParentPath(selectedPath)
}

function isSameOrChildPath(parentPath: string, candidatePath: string): boolean {
  const normalizedParent = parentPath.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedCandidate = candidatePath.replace(/\\/g, '/').replace(/\/$/, '')

  return (
    normalizedCandidate === normalizedParent
    || normalizedCandidate.startsWith(`${normalizedParent}/`)
  )
}

function getCommitTargetPath(rootPath: string | null, targetPath: string): string {
  const normalizedTarget = targetPath.replace(/\\/g, '/')

  if (!rootPath) {
    return normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`
  }

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (normalizedTarget === normalizedRoot) {
    return '/'
  }

  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length)
  }

  return normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`
}

function buildAutoCommitMessage(
  author: string,
  action: string,
  rootPath: string | null,
  targetPath: string,
  details?: string,
): string {
  const normalizedAuthor = (author.trim() || 'USER').replace(/\s+/g, '_').toUpperCase()
  const normalizedAction = action.trim().toUpperCase()
  const commitTargetPath = getCommitTargetPath(rootPath, targetPath)

  if (details && details.trim()) {
    return `${normalizedAuthor}::${normalizedAction}::${commitTargetPath} ${details.trim()}`
  }

  return `${normalizedAuthor}::${normalizedAction}::${commitTargetPath}`
}

function getRepoConfigPath(rootPath: string): string {
  if (rootPath.endsWith('/') || rootPath.endsWith('\\')) {
    return `${rootPath}.holo.json`
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath}${separator}.holo.json`
}

function getRepoRelativeFolderPath(rootPath: string, folderPath: string): string {
  const normalizedRoot = rootPath.replace(/[/\\]+$/, '')
  const normalizedFolder = folderPath.replace(/[/\\]+$/, '')
  if (normalizedFolder === normalizedRoot) {
    return '.'
  }
  const rel = getCommitTargetPath(rootPath, folderPath).replace(/^[/\\]/, '')
  return rel || '.'
}

function resolveRepoRelativePath(rootPath: string, relPath: string): string {
  if (!relPath || relPath === '.') return rootPath
  const base = rootPath.replace(/[/\\]+$/, '')
  return base + '/' + relPath.replace(/\\/g, '/')
}

function buildHoloFileLink(rootPath: string | null, filePath: string): string {
  if (!rootPath) {
    return ''
  }

  const repoName = getBaseName(rootPath)
  const repoRelativePath = getCommitTargetPath(rootPath, filePath).replace(/^\//, '')

  if (!repoName || !repoRelativePath) {
    return ''
  }

  const encodedRepoName = encodeURIComponent(repoName)
  const encodedPath = repoRelativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `holo://${encodedRepoName}/${encodedPath}`
}

function buildShareableHoloLink(rootPath: string | null, filePath: string, gatewayBaseUrl: string): string {
  const holoLink = buildHoloFileLink(rootPath, filePath)

  if (!holoLink) {
    return ''
  }

  const base = gatewayBaseUrl.trim().replace(/\/+$/, '')

  if (!base) {
    return holoLink
  }

  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return holoLink
    }
  } catch {
    return holoLink
  }

  return `${base}/open?h=${encodeURIComponent(holoLink)}`
}

function getRelativeLinkPath(fromFilePath: string | null, targetFilePath: string, rootPath: string | null): string {
  if (!fromFilePath) {
    const repoRelative = getCommitTargetPath(rootPath, targetFilePath).replace(/^\//, '')
    return repoRelative || getBaseName(targetFilePath)
  }

  const fromDirParts = getParentPath(fromFilePath).replace(/\\/g, '/').split('/').filter(Boolean)
  const targetParts = targetFilePath.replace(/\\/g, '/').split('/').filter(Boolean)

  let commonIndex = 0
  while (
    commonIndex < fromDirParts.length
    && commonIndex < targetParts.length
    && fromDirParts[commonIndex] === targetParts[commonIndex]
  ) {
    commonIndex += 1
  }

  const upSegments = new Array(fromDirParts.length - commonIndex).fill('..')
  const downSegments = targetParts.slice(commonIndex)
  const relativePath = [...upSegments, ...downSegments].join('/')

  return relativePath || getBaseName(targetFilePath)
}

function flatTreeFiles(node: TreeNode): string[] {
  if (node.type === 'file') return [node.path]
  return (node.children ?? []).flatMap(flatTreeFiles)
}

function TreeItem({
  node,
  selectedPath,
  fileIconByPath,
  folderIconByPath,
  fileMetaByPath,
  onSelect,
  onContextMenu,
  expandedDirectories,
  onToggleDirectory,
  draggedPath,
  dropTargetPath,
  onDragStart,
  onDragEnd,
  onDragOverDirectory,
  onDragLeaveDirectory,
  onDropOnDirectory,
  level = 0,
}: {
  node: TreeNode
  selectedPath: string | null
  fileIconByPath: Record<string, string>
  folderIconByPath: Record<string, string>
  fileMetaByPath: Record<string, FileMeta>
  onSelect: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, position: { x: number; y: number }) => void
  expandedDirectories: Set<string>
  onToggleDirectory: (directoryPath: string) => void
  draggedPath: string | null
  dropTargetPath: string | null
  onDragStart: (node: TreeNode) => void
  onDragEnd: () => void
  onDragOverDirectory: (node: TreeNode) => void
  onDragLeaveDirectory: (node: TreeNode) => void
  onDropOnDirectory: (node: TreeNode) => void
  level?: number
}) {
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const isExpanded = isDirectory ? expandedDirectories.has(node.path) : false
  const isDragged = draggedPath === node.path
  const isDropTarget = dropTargetPath === node.path
  const fileMeta = node.type === 'file' ? fileMetaByPath[node.path] : null

  return (
    <li>
      <button
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
          isSelected
            ? 'bg-[#7B61FF]/20 border border-[#7B61FF]/50 text-[#7B61FF]'
            : isDropTarget
              ? 'border border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
            : 'text-white/60 hover:text-white/90 hover:bg-white/5'
        }`}
        draggable={node.path.length > 0}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            onToggleDirectory(node.path)
          } else {
            onSelect(node)
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onContextMenu(node, { x: event.clientX, y: event.clientY })
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', node.path)
          onDragStart(node)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!isDirectory) {
            return
          }

          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          onDragOverDirectory(node)
        }}
        onDragLeave={() => {
          if (isDirectory) {
            onDragLeaveDirectory(node)
          }
        }}
        onDrop={(event) => {
          if (!isDirectory) {
            return
          }

          event.preventDefault()
          onDropOnDirectory(node)
        }}
        aria-grabbed={isDragged}
      >
        <span className="w-5 text-center text-[10px] text-white/55">
          {isDirectory ? (
            <i className={`fa-solid ${isExpanded ? 'fa-chevron-down' : 'fa-chevron-right'}`} />
          ) : (
            <span />
          )}
        </span>
        <span className="w-5 text-center text-sm text-white/70">
          {node.type === 'directory' ? (
            folderIconByPath[node.path] ? (
              <span>{folderIconByPath[node.path]}</span>
            ) : (
              <i className={`fa-regular ${isExpanded ? 'fa-folder-open' : 'fa-folder'}`} />
            )
          ) : (
            fileIconByPath[node.path] ? <span>{fileIconByPath[node.path]}</span> : <i className="fa-regular fa-file-lines" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="block min-w-0 flex-1 truncate text-xs">
              {node.type === 'file'
                ? (fileMeta?.title?.trim() || node.name.replace(/\.md$/i, ''))
                : node.name}
            </span>
            {node.type === 'file' && fileMeta?.isTemplate && (
              <span className="shrink-0 rounded-full border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-violet-200">
                Modèle
              </span>
            )}
          </span>
          {node.type === 'file' && fileMeta?.description?.trim() && (
            <span className="block truncate text-[10px] text-white/35">{fileMeta.description.trim()}</span>
          )}
        </span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
        <ul className="mt-0.5">
          {node.children.map((childNode) => (
            <TreeItem
              key={childNode.path}
              node={childNode}
              selectedPath={selectedPath}
              fileIconByPath={fileIconByPath}
              folderIconByPath={folderIconByPath}
              fileMetaByPath={fileMetaByPath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              expandedDirectories={expandedDirectories}
              onToggleDirectory={onToggleDirectory}
              draggedPath={draggedPath}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverDirectory={onDragOverDirectory}
              onDragLeaveDirectory={onDragLeaveDirectory}
              onDropOnDirectory={onDropOnDirectory}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

const matchesSlashQuery = (cmd: SlashCommand, query: string) => {
  if (!query) return true
  const q = normalize(query)
  return (
    normalize(cmd.label).includes(q) ||
    normalize(cmd.id).includes(q) ||
    (cmd.keywords ?? []).some((k) => normalize(k).includes(q))
  )
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', icon: 'fa-solid fa-1', label: 'Titre 1', hint: 'Grand titre' },
  { id: 'h2', icon: 'fa-solid fa-2', label: 'Titre 2', hint: 'Titre moyen' },
  { id: 'h3', icon: 'fa-solid fa-3', label: 'Titre 3', hint: 'Petit titre' },
  { id: 'h4', icon: 'fa-solid fa-4', label: 'Titre 4', hint: 'Sous-titre' },
  { id: 'bullet', icon: 'fa-solid fa-list-ul', label: 'Liste à puces', hint: '—' },
  { id: 'ordered', icon: 'fa-solid fa-list-ol', label: 'Liste numérotée', hint: '1. 2. 3.' },
  { id: 'quote', icon: 'fa-solid fa-quote-left', label: 'Citation', hint: 'Bloc citation' },
  { id: 'code', icon: 'fa-solid fa-code', label: 'Bloc code', hint: 'Monospace' },
  { id: 'table', icon: 'fa-solid fa-table', label: 'Tableau', hint: 'Grille' },
  { id: 'kanban', icon: 'fa-solid fa-table-columns', label: 'Kanban', hint: 'Tableau tickets', keywords: ['board', 'tickets', 'todo', 'workflow'] },
  { id: 'todo', icon: 'fa-solid fa-square-check', label: 'Tâches', hint: 'Checklist', keywords: ['tache', 'todo', 'task', 'checklist'] },
  { id: 'separator', icon: 'fa-solid fa-minus', label: 'Séparateur', hint: 'Ligne horizontale' },
  { id: 'link', icon: 'fa-solid fa-link', label: 'Lien', hint: 'Insérer un lien' },
  { id: 'image', icon: 'fa-solid fa-image', label: 'Image', hint: 'Depuis le disque' },
  { id: 'ai', icon: 'fa-solid fa-wand-magic-sparkles', label: 'Demander à l\'IA', hint: 'Générer du contenu', keywords: ['ia', 'ai', 'gpt', 'chatgpt', 'intelligence', 'artificielle'], requiresApiKey: true },
]

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [activeTab, setActiveTab] = useState<OpenTab | null>(null)
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [pathStatsByPath, setPathStatsByPath] = useState<Record<string, FilePathStats>>({})
  const [recentFolders, setRecentFolders] = useState<string[]>([])
  const [recentFolderIconByPath, setRecentFolderIconByPath] = useState<Record<string, string>>({})
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [gitState, setGitState] = useState<GitState>(DEFAULT_GIT_STATE)
  const [gitDialog, setGitDialog] = useState<GitDialog | null>(null)
  const [cloneDialog, setCloneDialog] = useState<CloneDialog | null>(null)
  const [linkDialog, setLinkDialog] = useState<{ text: string; url: string; pageQuery?: string } | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [isGitBusy, setIsGitBusy] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>(DEFAULT_SYNC_FEEDBACK)
  const [showGitAuthHelp, setShowGitAuthHelp] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'synced' | 'local'>('idle')
  const [copyLinkStatus, setCopyLinkStatus] = useState<'idle' | 'copied'>('idle')
  const [remoteEditBlock, setRemoteEditBlock] = useState<{ isBlocked: boolean; message: string }>({
    isBlocked: false,
    message: '',
  })
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git' | 'search'>('files')
  const [appVersion, setAppVersion] = useState('')
  const [showChangelogModal, setShowChangelogModal] = useState(false)
  const [seenChangelogVersion, setSeenChangelogVersion] = useState('')
  const [selectedChangelogVersion, setSelectedChangelogVersion] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [pendingFileSwitchPath, setPendingFileSwitchPath] = useState<string | null>(null)
  const [globalConfigReady, setGlobalConfigReady] = useState(false)
  const [shareGatewayBaseUrl, setShareGatewayBaseUrl] = useState('https://holo-link-gateway-git-main-romanedonnet-8817s-projects.vercel.app')
  const [filesSection, setFilesSection] = useState<'explorer' | 'mine' | 'recent'>('explorer')
  const [appAuthor, setAppAuthor] = useState('')
  const [showAuthorModal, setShowAuthorModal] = useState(false)
  const [authorModalMode, setAuthorModalMode] = useState<'startup' | 'edit'>('startup')
  const [authorModalValue, setAuthorModalValue] = useState('')
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [readOnlyMode, setReadOnlyMode] = useState(false)
  const [gitEmail, setGitEmail] = useState('')
  const [repoImageModeReady, setRepoImageModeReady] = useState(false)
  const [repoImageStorageMode, setRepoImageStorageMode] = useState<ImageStorageMode>('local')
  const [azureBlobContainerUrl, setAzureBlobContainerUrl] = useState('')
  const [azureBlobSasToken, setAzureBlobSasToken] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3AccessKeyId, setS3AccessKeyId] = useState('')
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('')
  const [s3Endpoint, setS3Endpoint] = useState('')
  const [s3PublicBaseUrl, setS3PublicBaseUrl] = useState('')
  const [dropboxAccessToken, setDropboxAccessToken] = useState('')
  const [dropboxFolderPath, setDropboxFolderPath] = useState('/holo-images')
  const [gdriveAccessToken, setGdriveAccessToken] = useState('')
  const [gdriveFolderId, setGdriveFolderId] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'auto' | 'openai' | 'gemini'>('auto')
  const [openaiPrompt, setOpenaiPrompt] = useState('Tu es un assistant qui aide à rédiger de la documentation technique en Markdown. Réponds toujours en Markdown bien structuré, avec des titres, listes et code blocks si nécessaire.')
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [archivedFiles, setArchivedFiles] = useState<ArchivedFileEntry[]>([])
  const [recentFilePaths, setRecentFilePaths] = useState<string[]>([])
  const [fileIconByPath, setFileIconByPath] = useState<Record<string, string>>({})
  const [fileMetaByPath, setFileMetaByPath] = useState<Record<string, FileMeta>>({})
  const [folderIconByPath, setFolderIconByPath] = useState<Record<string, string>>({})
  const [showFolderIconPicker, setShowFolderIconPicker] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<'raw' | 'wysiwyg'>('wysiwyg')
  const [isImageDragOverEditor, setIsImageDragOverEditor] = useState(false)
  const imageDragDepthRef = useRef(0)
  const tableDndCounterRef = useRef(1)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const wysiwygEditorRef = useRef<HTMLDivElement | null>(null)
  const rawEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const codeBlockLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingWysiwygRef = useRef(false)
  const lastWysiwygSyncedTabRef = useRef<string | null>(null)
  const [hoveredCodeBlock, setHoveredCodeBlock] = useState<{ x: number; y: number; codeEl: HTMLElement } | null>(null)
  const [pendingTitleFocusPath, setPendingTitleFocusPath] = useState<string | null>(null)
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number } | null>(null)
  const [tablePopup, setTablePopup] = useState<{ x: number; y: number } | null>(null)
  const [codeBlockPopup, setCodeBlockPopup] = useState<{ x: number; y: number; codeEl: HTMLElement } | null>(null)
  const [showCompactToc, setShowCompactToc] = useState(false)
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const slashMenuListRef = useRef<HTMLDivElement | null>(null)
  const compactTocRef = useRef<HTMLDivElement | null>(null)
  const confirmDialogResolverRef = useRef<((value: boolean) => void) | null>(null)
  const [aiDialog, setAiDialog] = useState<{ mode: 'generate' | 'transform'; prompt: string; isLoading: boolean; selectedText: string; error?: string } | null>(null)
  const aiSavedRangeRef = useRef<Range | null>(null)
  const linkSavedRangeRef = useRef<Range | null>(null)
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [columnTypePopup, setColumnTypePopup] = useState<{ x: number; y: number; thEl: HTMLElement } | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [windowPlatform, setWindowPlatform] = useState('')
  const [isCompactLayout, setIsCompactLayout] = useState(typeof window !== 'undefined' ? window.innerWidth < 1180 : false)
  const [isSidebarOpenOnCompact, setIsSidebarOpenOnCompact] = useState(false)
  const startupNavigationDoneRef = useRef(false)
  const headerRef = useRef<HTMLElement | null>(null)
  const headerDragStateRef = useRef<{
    startClientX: number
    startClientY: number
    pointerOffsetRatioX: number
    restored: boolean
  } | null>(null)


  const templateOptions = useMemo(
    () => Object.entries(fileMetaByPath)
      .filter(([, meta]) => meta.isTemplate)
      .map(([path, meta]) => ({
        path,
        label: meta.title.trim() || getBaseName(path).replace(/\.md$/i, ''),
        description: meta.description.trim(),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })),
    [fileMetaByPath],
  )

  useEffect(() => {
    if (!slashMenu) return
    const listEl = slashMenuListRef.current
    if (!listEl) return
    const activeItem = listEl.querySelector<HTMLButtonElement>(`[data-slash-index="${slashMenuIndex}"]`)
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [slashMenu, slashMenuIndex])

  const showTypeRBadge = appAuthor.trim().toLowerCase() === 'virgile'
  const desktopApiAvailable = typeof window.holo !== 'undefined'
  const isEditorReadOnly = readOnlyMode || remoteEditBlock.isBlocked
  const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode
  const selectedChangelogEntry = useMemo(
    () => CHANGELOG_ENTRIES.find((entry) => entry.version === selectedChangelogVersion) ?? null,
    [selectedChangelogVersion],
  )
  const currentVersionChangelog = useMemo(
    () => CHANGELOG_ENTRIES.find((entry) => entry.version === appVersion) ?? null,
    [appVersion],
  )
  const hasAiProviderConfigured = openaiApiKey.trim().length > 0 || geminiApiKey.trim().length > 0

  const focusActiveEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      if (effectiveEditorMode === 'raw') {
        rawEditorRef.current?.focus()
        return
      }

      if (!isEditorReadOnly) {
        wysiwygEditorRef.current?.focus()
      }
    }, 0)
  }, [effectiveEditorMode, isEditorReadOnly])

  const ensureWritableMode = useCallback(() => {
    if (!readOnlyMode) {
      return true
    }

    window.alert('Le mode lecture seule est activé. Désactive-le pour modifier ce contenu.')
    return false
  }, [readOnlyMode])

  const requestConfirmation = useCallback((dialog: ConfirmDialogState): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmDialogResolverRef.current = resolve
      setConfirmDialog(dialog)
    })
  }, [])

  const resolveConfirmationDialog = useCallback((value: boolean) => {
    const resolver = confirmDialogResolverRef.current
    confirmDialogResolverRef.current = null
    setConfirmDialog(null)
    resolver?.(value)
  }, [])

  const markCurrentVersionChangelogAsSeen = useCallback(() => {
    const normalized = normalizeVersionLabel(appVersion)
    if (!normalized) {
      return
    }
    setSeenChangelogVersion(normalized)
    window.localStorage.setItem('holo-seen-changelog-version', normalized)
    if (globalConfigReady) {
      void window.holo?.setHoloConfigValue('seen-changelog-version', normalized)
    }
  }, [appVersion, globalConfigReady])

  const discardTransientEditorState = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    wysiwygEditorRef.current?.blur()
    rawEditorRef.current?.blur()
    setActiveTab((prev) => (prev ? { ...prev, isDirty: false } : prev))
    setActiveTab(null)
    setActiveTabPath(null)
    lastWysiwygSyncedTabRef.current = null
    isSyncingWysiwygRef.current = false
    aiSavedRangeRef.current = null
    linkSavedRangeRef.current = null
    setSelectionPopup(null)
    setTablePopup(null)
    setCodeBlockPopup(null)
    setColumnTypePopup(null)
    setHoveredCodeBlock(null)
    setShowCompactToc(false)
    setSlashMenu(null)
  }, [])

  useEffect(() => {
    if (readOnlyMode) {
      setEditorMode('wysiwyg')
    }
  }, [readOnlyMode])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onResize = () => {
      setIsCompactLayout(window.innerWidth < 1180)
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isCompactLayout) {
      setIsSidebarOpenOnCompact(false)
    }
  }, [isCompactLayout])

  useEffect(() => {
    if (isCompactLayout && activeTabPath) {
      setIsSidebarOpenOnCompact(false)
    }
  }, [activeTabPath, isCompactLayout])

  const selectSidebar = useCallback((sidebar: 'files' | 'git' | 'search') => {
    setActiveSidebar(sidebar)
    if (isCompactLayout) {
      setIsSidebarOpenOnCompact(true)
    }
  }, [isCompactLayout])

  useEffect(() => {
    if (!globalConfigReady || !appVersion || !currentVersionChangelog || showChangelogModal) {
      return
    }

    if (seenChangelogVersion === appVersion) {
      return
    }

    setSelectedChangelogVersion(appVersion)
    setShowChangelogModal(true)
  }, [appVersion, currentVersionChangelog, globalConfigReady, seenChangelogVersion, showChangelogModal])

  const editableHeader = useMemo(
    () => getEditableMarkdownHeader(activeTab?.content ?? ''),
    [activeTab?.content],
  )

  const activeTabBody = useMemo(
    () => splitMarkdownFrontMatter(activeTab?.content ?? '').body,
    [activeTab?.content],
  )

  const tocItems = useMemo<TocItem[]>(() => {
    const lines = activeTabBody.split('\n')
    const items: TocItem[] = []
    let inCodeFence = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (/^(```|~~~)/.test(trimmed)) {
        inCodeFence = !inCodeFence
        continue
      }

      if (inCodeFence) {
        continue
      }

      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) {
        continue
      }

      const level = match[1].length
      const text = match[2]
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim()

      if (!text) {
        continue
      }

      items.push({
        level,
        text,
        headingIndex: items.length,
      })
    }

    return items
  }, [activeTabBody])

  const activePathStats = useMemo(
    () => (activeTabPath ? pathStatsByPath[activeTabPath] ?? null : null),
    [activeTabPath, pathStatsByPath],
  )

  const getHoloApi = useCallback(() => {
    if (!window.holo) {
      window.alert(
        "L'API Electron n'est pas disponible. Lance l'application avec `npm run dev` (Electron), pas uniquement Vite dans le navigateur.",
      )
      return null
    }

    return window.holo
  }, [])

  const refreshTree = useCallback(async () => {
    const holo = window.holo

    if (!holo) {
      return
    }

    const result = (await holo.refreshTree()) as OpenFolderResult

    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
  }, [getHoloApi])

  const applyOpenedFolder = useCallback(async (result: OpenFolderResult) => {
    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
    setSelectedPath(result.rootPath)
    setSelectedType('directory')
    setExpandedDirectories(new Set([result.rootPath]))
    setArchivedFiles([])
    setFolderIconByPath({})
    setActiveTab(null)
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)
    
    // Charger la config du repo (.holo.json) pour les paramètres par repo
    const holo = window.holo
    if (holo) {
      try {
        const repoConfig = await holo.readRepoConfig() as {
          imageStorageMode?: ImageStorageMode
        } | null
        if (repoConfig?.imageStorageMode) {
          setRepoImageStorageMode(repoConfig.imageStorageMode)
          setRepoImageModeReady(true)
        } else {
          setRepoImageStorageMode('local')
          setRepoImageModeReady(false)
        }
      } catch {
        setRepoImageStorageMode('local')
        setRepoImageModeReady(false)
      }
    }
  }, [])

  const refreshRecentFolders = useCallback(async () => {
    if (!window.holo) {
      setRecentFolders([])
      return
    }

    const recent = await window.holo.getRecentFolders()
    setRecentFolders(Array.isArray(recent) ? recent : [])
  }, [])

  const refreshArchivedFiles = useCallback(async () => {
    if (!window.holo) {
      setArchivedFiles([])
      return
    }

    const archived = await window.holo.listArchivedFiles().catch(() => [])
    setArchivedFiles(Array.isArray(archived) ? archived : [])
  }, [])

  const openFolder = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = (await holo.openFolder()) as OpenFolderResult

    if (!result) {
      return
    }

    applyOpenedFolder(result)
    await refreshRecentFolders()
    await refreshArchivedFiles()

    const nextGitState = await holo.gitGetState(true)
    setGitState(normalizeGitState(nextGitState))

    // Pull silencieux au démarrage
    if (nextGitState?.isRepo) {
      try { await holo.gitPull() } catch { /* silent */ }
      await refreshTree()
      const afterPull = await holo.gitGetState(false).catch(() => null)
      if (afterPull) setGitState(normalizeGitState(afterPull))
    }
  }, [applyOpenedFolder, getHoloApi, refreshArchivedFiles, refreshRecentFolders, refreshTree])

  const openRecentFolder = useCallback(
    async (folderPath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        const result = (await holo.openRecentFolder(folderPath)) as OpenFolderResult

        if (!result) {
          return
        }

        applyOpenedFolder(result)
        await refreshRecentFolders()
        await refreshArchivedFiles()

        const nextGitState = await holo.gitGetState(true)
        setGitState(normalizeGitState(nextGitState))

        // Pull silencieux au démarrage
        if (nextGitState?.isRepo) {
          try { await holo.gitPull() } catch { /* silent */ }
          await refreshTree()
          const afterPull = await holo.gitGetState(false).catch(() => null)
          if (afterPull) setGitState(normalizeGitState(afterPull))
        }
      } catch (error) {
        window.alert((error as Error).message)
        await refreshRecentFolders()
      }
    },
    [applyOpenedFolder, getHoloApi, refreshArchivedFiles, refreshRecentFolders, refreshTree],
  )

  const removeRecentFolder = useCallback(
    async (folderPath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        await holo.removeRecentFolder(folderPath)
        await refreshRecentFolders()
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, refreshRecentFolders],
  )

  const refreshGitState = useCallback(
    async (fetchRemote = false) => {
      if (!rootPath) {
        setGitState(DEFAULT_GIT_STATE)
        return
      }

      const holo = getHoloApi()

      if (!holo) {
        return
      }

      const nextGitState = await holo.gitGetState(fetchRemote)
      setGitState(normalizeGitState(nextGitState))
    },
    [getHoloApi, rootPath],
  )

  const applyRemoteEditBlockFromGitState = useCallback((nextGitState: GitState) => {
    if (nextGitState.error) {
      setRemoteEditBlock({ isBlocked: false, message: '' })
      return
    }

    if ((nextGitState.conflictedFiles?.length ?? 0) > 0) {
      setRemoteEditBlock({
        isBlocked: true,
        message: 'Conflits Git détectés. Résous-les depuis le panneau Git (garder local / prendre serveur) pour reprendre l’édition.',
      })
      return
    }

    if (nextGitState.incoming > 0) {
      setRemoteEditBlock({
        isBlocked: true,
        message: 'Une version plus récente existe sur le dépôt distant. Fais un pull pour reprendre l’édition.',
      })
      return
    }

    setRemoteEditBlock({ isBlocked: false, message: '' })
  }, [])

  const checkRemoteFreshnessAndGuardEditing = useCallback(
    async (promptPull: boolean, autoPullIfSafe = false) => {
      if (!rootPath || !gitState.isRepo) {
        setRemoteEditBlock({ isBlocked: false, message: '' })
        return true
      }

      const holo = getHoloApi()

      if (!holo) {
        return true
      }

      let nextState: GitState
      try {
        nextState = normalizeGitState(await holo.gitGetState(true))
      } catch (error) {
        setRemoteEditBlock({ isBlocked: false, message: '' })
        if (promptPull) {
          setSyncFeedback({
            status: 'warning',
            message: getFriendlyGitErrorMessage((error as Error).message),
            at: new Date().toISOString(),
          })
        }
        return true
      }

      setGitState(nextState)
      applyRemoteEditBlockFromGitState(nextState)

      if (nextState.incoming <= 0) {
        return true
      }

      const canAutoPullSafely =
        autoPullIfSafe
        && !isGitBusy
        && !(activeTab?.isDirty ?? false)
        && nextState.localChanges === 0
        && nextState.outgoing === 0

      if (canAutoPullSafely) {
        try {
          await holo.gitPull()
          await refreshTree()

          if (activeTabPath) {
            const refreshedContent = await holo.readFile(activeTabPath).catch(() => null)

            if (typeof refreshedContent === 'string') {
              setActiveTab((prev) =>
                prev && prev.path === activeTabPath
                  ? { ...prev, content: refreshedContent, isDirty: false }
                  : prev,
              )
            }
          }

          const refreshedState = normalizeGitState(await holo.gitGetState(true))
          setGitState(refreshedState)
          applyRemoteEditBlockFromGitState(refreshedState)
          return refreshedState.incoming <= 0
        } catch {
          return false
        }
      }

      if (!promptPull) {
        return false
      }

      const shouldPullNow = await requestConfirmation({
        title: 'Mise à jour distante disponible',
        message: 'Une version plus récente de ce dépôt est disponible sur le remote.\n\nPull maintenant pour débloquer l’édition ?',
        confirmLabel: 'Pull maintenant',
        cancelLabel: 'Plus tard',
      })

      if (!shouldPullNow) {
        return false
      }

      setIsGitBusy(true)

      try {
        await holo.gitPull()
        await refreshTree()
        const refreshedState = normalizeGitState(await holo.gitGetState(true))
        setGitState(refreshedState)
        applyRemoteEditBlockFromGitState(refreshedState)
        return refreshedState.incoming <= 0
      } catch (error) {
        window.alert((error as Error).message)
        return false
      } finally {
        setIsGitBusy(false)
      }
    },
    [activeTab?.isDirty, activeTabPath, applyRemoteEditBlockFromGitState, getHoloApi, gitState.isRepo, isGitBusy, refreshTree, requestConfirmation, rootPath],
  )

  useEffect(() => {
    if (!rootPath) {
      setGitState(DEFAULT_GIT_STATE)
      return
    }

    void refreshGitState(true)
  }, [refreshGitState, rootPath])

  useEffect(() => {
    void refreshRecentFolders()
  }, [refreshRecentFolders])

  useEffect(() => {
    if (recentFolders.length === 0) {
      setRecentFolderIconByPath({})
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      return
    }

    let cancelled = false

    const loadRecentFolderIcons = async () => {
      const pairs = await Promise.all(
        recentFolders.map(async (folderPath) => {
          try {
            const icon = await holo.getRecentFolderIcon(folderPath)
            return [folderPath, typeof icon === 'string' ? icon.trim() : ''] as const
          } catch {
            return [folderPath, ''] as const
          }
        }),
      )

      if (cancelled) {
        return
      }

      const next: Record<string, string> = {}
      for (const [folderPath, icon] of pairs) {
        if (icon) {
          next[folderPath] = icon
        }
      }

      setRecentFolderIconByPath(next)
    }

    void loadRecentFolderIcons()

    return () => {
      cancelled = true
    }
  }, [getHoloApi, recentFolders])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    let cancelled = false

    const loadGlobalConfig = async () => {
      const holo = getHoloApi()
      const cfg = await holo?.getHoloConfig?.().catch(() => ({} as Record<string, unknown>))
      const config = cfg && typeof cfg === 'object' ? cfg : {}

      const fromConfigOrLocal = (configKey: string, localKey: string, fallback = '') => {
        const cfgValue = config[configKey]
        if (typeof cfgValue === 'string' && cfgValue.trim().length > 0) {
          return cfgValue
        }
        const localValue = window.localStorage.getItem(localKey)
        if (localValue && localValue.trim().length > 0) {
          void holo?.setHoloConfigValue?.(configKey, localValue)
          return localValue
        }
        return fallback
      }

      const fromConfigOrLocalBoolean = (configKey: string, localKey: string, fallback = false) => {
        const cfgValue = config[configKey]
        if (typeof cfgValue === 'boolean') {
          return cfgValue
        }
        const localValue = window.localStorage.getItem(localKey)
        if (localValue === 'true' || localValue === 'false') {
          const parsed = localValue === 'true'
          void holo?.setHoloConfigValue?.(configKey, parsed)
          return parsed
        }
        return fallback
      }

      const author = fromConfigOrLocal('app-author', 'holo-author', '')
      const readOnly = fromConfigOrLocalBoolean('app-read-only', 'holo-read-only', false)
      const seenVersion = fromConfigOrLocal('seen-changelog-version', 'holo-seen-changelog-version', '')
      const email = fromConfigOrLocal('git-email', 'holo-git-email', '')
      const azureContainerUrl = fromConfigOrLocal('azure-container-url', 'holo-azure-container-url', '')
      const azureSasToken = fromConfigOrLocal('azure-sas-token', 'holo-azure-sas-token', '')
      const s3RegionValue = fromConfigOrLocal('s3-region', 'holo-s3-region', '')
      const s3BucketValue = fromConfigOrLocal('s3-bucket', 'holo-s3-bucket', '')
      const s3AccessKeyIdValue = fromConfigOrLocal('s3-access-key-id', 'holo-s3-access-key-id', '')
      const s3SecretAccessKeyValue = fromConfigOrLocal('s3-secret-access-key', 'holo-s3-secret-access-key', '')
      const s3EndpointValue = fromConfigOrLocal('s3-endpoint', 'holo-s3-endpoint', '')
      const s3PublicBaseUrlValue = fromConfigOrLocal('s3-public-base-url', 'holo-s3-public-base-url', '')
      const dropboxAccessTokenValue = fromConfigOrLocal('dropbox-access-token', 'holo-dropbox-access-token', '')
      const dropboxFolderPathValue = fromConfigOrLocal('dropbox-folder-path', 'holo-dropbox-folder-path', '/holo-images')
      const gdriveAccessTokenValue = fromConfigOrLocal('gdrive-access-token', 'holo-gdrive-access-token', '')
      const gdriveFolderIdValue = fromConfigOrLocal('gdrive-folder-id', 'holo-gdrive-folder-id', '')
      const openaiKey = fromConfigOrLocal('openai-api-key', 'holo-openai-key', '')
      const geminiKey = fromConfigOrLocal('gemini-api-key', 'holo-gemini-key', '')
      const providerRaw = fromConfigOrLocal('ai-provider', 'holo-ai-provider', 'auto')
      const prompt = fromConfigOrLocal('openai-prompt', 'holo-openai-prompt', openaiPrompt)
      const gatewayBaseUrl = fromConfigOrLocal('share-gateway-base-url', 'holo-share-gateway-url', shareGatewayBaseUrl)

      if (cancelled) {
        return
      }

      if (author) {
        setAppAuthor(author)
      } else {
        setAuthorModalMode('startup')
        setAuthorModalValue('')
        setShowAuthorModal(true)
      }

        setReadOnlyMode(readOnly)
        setSeenChangelogVersion(normalizeVersionLabel(seenVersion))
      if (email) setGitEmail(email)
      if (azureContainerUrl) setAzureBlobContainerUrl(azureContainerUrl)
      if (azureSasToken) setAzureBlobSasToken(azureSasToken)
      if (s3RegionValue) setS3Region(s3RegionValue)
      if (s3BucketValue) setS3Bucket(s3BucketValue)
      if (s3AccessKeyIdValue) setS3AccessKeyId(s3AccessKeyIdValue)
      if (s3SecretAccessKeyValue) setS3SecretAccessKey(s3SecretAccessKeyValue)
      if (s3EndpointValue) setS3Endpoint(s3EndpointValue)
      if (s3PublicBaseUrlValue) setS3PublicBaseUrl(s3PublicBaseUrlValue)
      if (dropboxAccessTokenValue) setDropboxAccessToken(dropboxAccessTokenValue)
      if (dropboxFolderPathValue) setDropboxFolderPath(dropboxFolderPathValue)
      if (gdriveAccessTokenValue) setGdriveAccessToken(gdriveAccessTokenValue)
      if (gdriveFolderIdValue) setGdriveFolderId(gdriveFolderIdValue)
      if (openaiKey) setOpenaiApiKey(openaiKey)
      if (geminiKey) setGeminiApiKey(geminiKey)
      if (providerRaw === 'auto' || providerRaw === 'openai' || providerRaw === 'gemini') {
        setAiProvider(providerRaw)
      }
      if (prompt) setOpenaiPrompt(prompt)
      if (gatewayBaseUrl) setShareGatewayBaseUrl(gatewayBaseUrl)

      setGlobalConfigReady(true)
    }

    void loadGlobalConfig()

    return () => {
      cancelled = true
    }
  }, [getHoloApi, openaiPrompt, shareGatewayBaseUrl])

  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('app-author', appAuthor) }, [appAuthor, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('app-read-only', readOnlyMode) }, [readOnlyMode, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('seen-changelog-version', seenChangelogVersion) }, [seenChangelogVersion, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('git-email', gitEmail) }, [gitEmail, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('azure-container-url', azureBlobContainerUrl) }, [azureBlobContainerUrl, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('azure-sas-token', azureBlobSasToken) }, [azureBlobSasToken, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-region', s3Region) }, [s3Region, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-bucket', s3Bucket) }, [s3Bucket, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-access-key-id', s3AccessKeyId) }, [s3AccessKeyId, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-secret-access-key', s3SecretAccessKey) }, [s3SecretAccessKey, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-endpoint', s3Endpoint) }, [s3Endpoint, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('s3-public-base-url', s3PublicBaseUrl) }, [s3PublicBaseUrl, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('dropbox-access-token', dropboxAccessToken) }, [dropboxAccessToken, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('dropbox-folder-path', dropboxFolderPath) }, [dropboxFolderPath, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('gdrive-access-token', gdriveAccessToken) }, [gdriveAccessToken, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('gdrive-folder-id', gdriveFolderId) }, [gdriveFolderId, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('openai-api-key', openaiApiKey) }, [openaiApiKey, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('gemini-api-key', geminiApiKey) }, [geminiApiKey, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('ai-provider', aiProvider) }, [aiProvider, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('openai-prompt', openaiPrompt) }, [openaiPrompt, globalConfigReady])
  useEffect(() => { if (globalConfigReady) void window.holo?.setHoloConfigValue('share-gateway-base-url', shareGatewayBaseUrl) }, [shareGatewayBaseUrl, globalConfigReady])

  useEffect(() => {
    if (!rootPath) {
      setRepoImageModeReady(false)
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      setRepoImageModeReady(false)
      return
    }

    let cancelled = false

    const loadRepoImageStorageMode = async () => {
      setRepoImageModeReady(false)
      try {
        const repoConfig = await holo.readRepoConfig().catch(() => null) as {
          imageStorageMode?: ImageStorageMode
          imageStorage?: { mode?: ImageStorageMode }
          folderIcons?: Record<string, string>
        } | null
        const legacyMode = repoConfig?.imageStorage?.mode
        const mode = repoConfig?.imageStorageMode ?? legacyMode

        if (!cancelled && (mode === 'local' || mode === 'azure' || mode === 's3' || mode === 'dropbox' || mode === 'gdrive')) {
          setRepoImageStorageMode(mode)
        }

        // Alert if image storage credentials are missing on this machine
        if (!cancelled && globalConfigReady && mode && mode !== 'local') {
          const hasAzure = !!(azureBlobContainerUrl.trim() && azureBlobSasToken.trim())
          const hasS3 = !!(s3Region.trim() && s3Bucket.trim() && s3AccessKeyId.trim() && s3SecretAccessKey.trim())
          const hasDropbox = !!dropboxAccessToken.trim()
          const hasGdrive = !!gdriveAccessToken.trim()
          const credOk = (mode === 'azure' && hasAzure) || (mode === 's3' && hasS3) || (mode === 'dropbox' && hasDropbox) || (mode === 'gdrive' && hasGdrive)
          if (!credOk) {
            window.alert(`Ce dépôt utilise le stockage d'images « ${mode} » mais les clés d'authentification ne sont pas configurées sur cette machine.\n\nVa dans Paramètres › Stockage d'images pour les saisir.`)
            setShowSettings(true)
          }
        }

        // Load folder icons from repo config (keys may be relative or legacy absolute paths)
        if (!cancelled) {
          if (repoConfig?.folderIcons && typeof repoConfig.folderIcons === 'object') {
            const rawIcons = repoConfig.folderIcons as Record<string, string>
            const absIcons: Record<string, string> = {}
            for (const [k, icon] of Object.entries(rawIcons)) {
              // backward compat: if key looks like absolute path, use as-is
              const isAbsPath = k.startsWith('/') || /^[A-Za-z]:[/\\]/.test(k) || k.startsWith('~')
              const absKey = isAbsPath ? k : resolveRepoRelativePath(rootPath, k)
              absIcons[absKey] = icon
            }
            setFolderIconByPath(absIcons)
          } else {
            setFolderIconByPath({})
          }
        }
      } catch {
        // no repo config yet
      } finally {
        if (!cancelled) {
          setRepoImageModeReady(true)
        }
      }
    }

    void loadRepoImageStorageMode()

    return () => {
      cancelled = true
    }
  }, [getHoloApi, rootPath])

  useEffect(() => {
    const filePaths = tree ? flatTreeFiles(tree) : []

    if (filePaths.length === 0) {
      setFileIconByPath({})
      setFileMetaByPath({})
      return
    }

    if (!window.holo) {
      return
    }

    let cancelled = false

    const loadIcons = async () => {
      const pairs = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            const content = await window.holo!.readFile(filePath)
            const header = getEditableMarkdownHeader(content)
            return {
              filePath,
              icon: header.icon.trim(),
              title: header.title.trim(),
              description: header.description.trim(),
              isTemplate: header.isTemplate,
            }
          } catch {
            return {
              filePath,
              icon: '',
              title: '',
              description: '',
              isTemplate: false,
            }
          }
        }),
      )

      if (cancelled) {
        return
      }

      const next: Record<string, string> = {}
      const nextMeta: Record<string, FileMeta> = {}
      for (const entry of pairs) {
        if (entry.icon) {
          next[entry.filePath] = entry.icon
        }

        if (entry.title || entry.description || entry.isTemplate) {
          nextMeta[entry.filePath] = {
            title: entry.title,
            description: entry.description,
            isTemplate: entry.isTemplate,
          }
        }
      }

      setFileIconByPath(next)
      setFileMetaByPath(nextMeta)
    }

    void loadIcons()

    return () => {
      cancelled = true
    }
  }, [tree])

  useEffect(() => {
    if (!activeTabPath || !activeTab) {
      return
    }

    const icon = getEditableMarkdownHeader(activeTab.content).icon.trim()

    setFileIconByPath((previous) => {
      if (!icon && !(activeTabPath in previous)) {
        return previous
      }

      const next = { ...previous }

      if (icon) {
        next[activeTabPath] = icon
      } else {
        delete next[activeTabPath]
      }

      return next
    })
  }, [activeTab, activeTabPath])

  useEffect(() => {
    const loadAppVersion = async () => {
      if (!window.holo) {
        return
      }

      const version = await window.holo.getAppVersion().catch(() => '')
      if (version) {
        setAppVersion(normalizeVersionLabel(version))
      }
    }

    void loadAppVersion()
  }, [])

  useEffect(() => {
    const loadWindowState = async () => {
      const holo = window.holo
      if (!holo) {
        return
      }

      try {
        const state = await holo.getWindowState()
        setWindowIsMaximized(Boolean(state?.isMaximized))
        setWindowPlatform(typeof state?.platform === 'string' ? state.platform : '')
      } catch {
        // ignore state loading errors
      }
    }

    void loadWindowState()
  }, [])

  const allFilePaths = useMemo(() => (tree ? flatTreeFiles(tree) : []), [tree])
  const [myFilePaths, setMyFilePaths] = useState<string[]>([])

  useEffect(() => {
    const authorNeedle = appAuthor.trim().toLowerCase()

    if (!authorNeedle || allFilePaths.length === 0) {
      setMyFilePaths([])
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      setMyFilePaths([])
      return
    }

    let cancelled = false

    const scan = async () => {
      const mine: string[] = []

      for (const filePath of allFilePaths) {
        try {
          const content = await holo.readFile(filePath)
          const header = getEditableMarkdownHeader(content)
          if (header.author.trim().toLowerCase() === authorNeedle) {
            mine.push(filePath)
          }
        } catch {
          // ignore unreadable files
        }
      }

      if (!cancelled) {
        setMyFilePaths(mine)
      }
    }

    void scan()

    return () => {
      cancelled = true
    }
  }, [allFilePaths, appAuthor])

  const visibleRecentFilePaths = useMemo(
    () => recentFilePaths.filter((filePath) => allFilePaths.includes(filePath)).slice(0, 5),
    [allFilePaths, recentFilePaths],
  )

  const linkPageSuggestions = useMemo(() => {
    const pageFiles = allFilePaths.filter((filePath) => filePath.toLowerCase().endsWith('.md'))
    const query = linkDialog?.pageQuery?.trim().toLowerCase() ?? ''

    const candidates = pageFiles.filter((filePath) => filePath !== activeTabPath)
    if (!query) {
      return candidates.slice(0, 8)
    }

    return candidates
      .filter((filePath) => filePath.toLowerCase().includes(query) || getBaseName(filePath).toLowerCase().includes(query))
      .slice(0, 8)
  }, [activeTabPath, allFilePaths, linkDialog?.pageQuery])

  useEffect(() => {
    if (!rootPath || !gitState.isRepo) {
      return
    }

    const interval = window.setInterval(() => {
      void checkRemoteFreshnessAndGuardEditing(false, true)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [checkRemoteFreshnessAndGuardEditing, gitState.isRepo, rootPath])

  useEffect(() => {
    if (!activeTabPath) {
      setRemoteEditBlock({ isBlocked: false, message: '' })
    }
  }, [activeTabPath])

  useEffect(() => {
    if (!showCompactToc) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (compactTocRef.current?.contains(event.target as Node)) {
        return
      }

      setShowCompactToc(false)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCompactToc(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [showCompactToc])

  useEffect(() => {
    if (!isCompactLayout || tocItems.length === 0) {
      setShowCompactToc(false)
    }
  }, [isCompactLayout, tocItems.length])

  // When a template is selected in the name dialog, load its variables
  useEffect(() => {
    if (!nameDialog || nameDialog.mode !== 'create-file' || !nameDialog.selectedTemplatePath) {
      if (nameDialog && nameDialog.mode === 'create-file' && !nameDialog.selectedTemplatePath) {
        setNameDialog((prev) =>
          prev && prev.mode === 'create-file' ? { ...prev, templateVariables: undefined } : prev,
        )
      }
      return
    }

    const holo = getHoloApi()
    if (!holo) return

    const templatePath = nameDialog.selectedTemplatePath
    void holo.readFile(templatePath).then((content: string) => {
      const variables = extractTemplateVariables(content)
      if (variables.length === 0) {
        setNameDialog((prev) =>
          prev && prev.mode === 'create-file' ? { ...prev, templateVariables: undefined } : prev,
        )
        return
      }
      const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit' })
      const autoValues: Record<string, string> = {}
      for (const v of variables) {
        if (v === '$DATE') autoValues[v] = today
        else if (v === '$AUTHOR' || v === '$AUTEUR') autoValues[v] = appAuthor ?? ''
        else autoValues[v] = ''
      }
      setNameDialog((prev) =>
        prev && prev.mode === 'create-file' ? { ...prev, templateVariables: autoValues } : prev,
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(nameDialog as { selectedTemplatePath?: string | null } | null)?.selectedTemplatePath])

  // Listen for update notifications from Electron
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const holo = window.holo

    if (!holo) {
      return
    }

    let unsubUpdateAvailable: (() => void) | undefined
    let unsubUpdateReady: (() => void) | undefined
    let unsubUpdateProgress: (() => void) | undefined

    try {
      unsubUpdateAvailable = holo.onUpdateAvailable?.(() => {
        setUpdateAvailable(true)
      })

      unsubUpdateReady = holo.onUpdateReady?.(() => {
        setUpdateReady(true)
        setUpdateProgress(100)
      })

      unsubUpdateProgress = holo.onUpdateProgress?.((data: { percent: number }) => {
        setUpdateProgress(Math.round(data.percent))
      })
    } catch (error) {
      console.error('Failed to setup update listeners:', error)
    }

    return () => {
      unsubUpdateAvailable?.()
      unsubUpdateReady?.()
      unsubUpdateProgress?.()
    }
  }, [])

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(directoryPath)) {
        next.delete(directoryPath)
      } else {
        next.add(directoryPath)
      }

      return next
    })
  }, [])

  const openFile = useCallback(
    async (filePath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        // Open the file immediately using cached git state — no blocking network fetch
        if (rootPath && gitState.isRepo && gitState.incoming > 0) {
          applyRemoteEditBlockFromGitState(gitState)
        } else {
          setRemoteEditBlock({ isBlocked: false, message: '' })
        }

        const nextContent = await holo.readFile(filePath)
        const stats = await holo.getPathStats(filePath).catch(() => null)
        const nextFile: OpenTab = {
          path: filePath,
          name: getBaseName(filePath),
          content: nextContent,
          isDirty: false,
        }
        setActiveTab(nextFile)

        if (stats) {
          setPathStatsByPath((prev) => ({
            ...prev,
            [filePath]: stats,
          }))
        }

        setActiveTabPath(filePath)
        setRecentFilePaths((prev) => [filePath, ...prev.filter((path) => path !== filePath)].slice(0, 20))
        setShowCompactToc(false)
        focusActiveEditorSoon()
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [applyRemoteEditBlockFromGitState, focusActiveEditorSoon, getHoloApi, gitState],
  )

  const openEditorLink = useCallback(
    async (href: string) => {
      const trimmedHref = href.trim()
      if (!trimmedHref) {
        return
      }

      const holo = getHoloApi()

      if (/^(https?:|mailto:|holo:)/i.test(trimmedHref)) {
        if (holo) {
          await holo.openExternalUrl(trimmedHref)
        }
        return
      }

      const cleanHref = trimmedHref.split('#')[0]?.split('?')[0]?.trim() ?? ''
      if (!cleanHref) {
        return
      }

      let targetPath: string | null = null

      if (cleanHref.startsWith('/')) {
        if (rootPath) {
          targetPath = resolveRepoRelativePath(rootPath, cleanHref.replace(/^\/+/, ''))
        }
      } else if (activeTabPath) {
        const normalizedBaseDir = getParentPath(activeTabPath).replace(/\\/g, '/')
        const baseParts = normalizedBaseDir.split('/').filter(Boolean)
        const hrefParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean)
        const resolvedParts = [...baseParts]

        for (const part of hrefParts) {
          if (part === '.') {
            continue
          }

          if (part === '..') {
            if (resolvedParts.length > 0) {
              resolvedParts.pop()
            }
            continue
          }

          resolvedParts.push(part)
        }

        targetPath = `${activeTabPath.replace(/\\/g, '/').startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`
      }

      if (targetPath?.toLowerCase().endsWith('.md')) {
        await openFile(targetPath)
        return
      }

      if (holo) {
        await holo.openExternalUrl(trimmedHref)
      }
    },
    [activeTabPath, getHoloApi, openFile, rootPath],
  )

  useEffect(() => {
    if (startupNavigationDoneRef.current) {
      return
    }

    const params = new URLSearchParams(window.location.search)
    const rootPathParam = params.get('rootPath')?.trim()
    const filePathParam = params.get('filePath')?.trim()
    const startupErrorParam = params.get('startupError')?.trim()

    startupNavigationDoneRef.current = true

    if (startupErrorParam) {
      window.alert(startupErrorParam)
    }

    if (!rootPathParam) {
      return
    }

    void (async () => {
      try {
        await openRecentFolder(rootPathParam)
        if (filePathParam) {
          await openFile(filePathParam)
        }
      } catch (error) {
        console.error('Failed startup navigation:', error)
      }
    })()
  }, [openFile, openRecentFolder])

  const onSelectNode = useCallback(
    async (node: TreeNode) => {
      setSelectedPath(node.path)
      setSelectedType(node.type)

      if (node.type === 'file') {
        const isDirty = activeTab?.isDirty ?? false
        if (isDirty && activeTabPath && activeTabPath !== node.path) {
          setPendingFileSwitchPath(node.path)
          setShowUnsavedChangesModal(true)
          return
        }

        await openFile(node.path)
      }
    },
    [activeTab, activeTabPath, openFile],
  )

  const confirmDiscardAndSwitchFile = useCallback(async () => {
    if (!pendingFileSwitchPath) {
      setShowUnsavedChangesModal(false)
      return
    }

    setShowUnsavedChangesModal(false)
    discardTransientEditorState()
    const nextPath = pendingFileSwitchPath
    setPendingFileSwitchPath(null)
    await openFile(nextPath)
  }, [discardTransientEditorState, openFile, pendingFileSwitchPath])

  const cancelDiscardAndSwitchFile = useCallback(() => {
    setShowUnsavedChangesModal(false)
    setPendingFileSwitchPath(null)
  }, [])

  const saveCurrentFile = useCallback(async () => {
    if (!activeTab) {
      return
    }

    if (!ensureWritableMode()) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.writeFile(activeTab.path, activeTab.content)
    const stats = await holo.getPathStats(activeTab.path).catch(() => null)
    setActiveTab((prev) => (prev ? { ...prev, isDirty: false } : prev))

    if (stats) {
      setPathStatsByPath((prev) => ({
        ...prev,
        [activeTab.path]: stats,
      }))
    }

    await refreshTree()
    await refreshGitState(false)

    // Auto-commit + push if in a Git repository
    if (gitState.isRepo) {
      setSaveStatus('saving')
      try {
        const commitMessage = buildAutoCommitMessage(appAuthor, 'UPDATE', rootPath, activeTab.path)
        const result = await holo.gitCommit(commitMessage)
        setSaveStatus(result.pushed ? 'synced' : 'local')
      } catch (error) {
        // Silent fail - file was saved successfully, commit is just a bonus
        setSaveStatus('local')
        console.error('Auto-commit failed:', error)
      } finally {
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }
  }, [activeTab, appAuthor, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, gitState.isRepo, rootPath])

  const updateActiveTabContent = useCallback(
    (nextContent: string) => {
      if (isEditorReadOnly) {
        return
      }

      setActiveTab((prev) => (prev ? { ...prev, content: nextContent, isDirty: true } : prev))
    },
    [isEditorReadOnly],
  )

  const updateEditableHeader = useCallback(
    (field: keyof EditableMarkdownHeader, value: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownHeaderField(activeTab.content, field, value)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!activeTab) return
      const nextMarkdown = updateTagsInMarkdown(activeTab.content, tags)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const runSearch = useCallback(async (query: string) => {
    const holo = getHoloApi()
    if (!holo || !query.trim()) {
      setSearchResults([])
      return
    }

    if (allFilePaths.length === 0 && archivedFiles.length === 0) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    const needle = query.trim().toLowerCase()
    const isTagSearch = needle.startsWith('#')
    const tagNeedle = isTagSearch ? needle.slice(1) : needle
    const results: SearchResultItem[] = []

    // Read files in parallel batches of 10
    const BATCH = 10
    for (let i = 0; i < allFilePaths.length; i += BATCH) {
      const batch = allFilePaths.slice(i, i + BATCH)
      await Promise.all(batch.map(async (filePath) => {
        try {
          const content: string = await holo.readFile(filePath)
          const header = getEditableMarkdownHeader(content)
          const name = getBaseName(filePath).replace(/\.md$/i, '')

          // Tag match
          const tagMatch = header.tags.some((t) => t.toLowerCase().includes(tagNeedle))
          if (tagMatch) {
            results.push({ path: filePath, name, excerpt: header.tags.map((t) => `#${t}`).join(' '), matchType: 'tag' })
            return
          }

          // Name / title / description match
          if (!isTagSearch) {
            const nameLower = name.toLowerCase()
            const titleLower = header.title.toLowerCase()
            const descLower = header.description.toLowerCase()
            if (nameLower.includes(needle) || titleLower.includes(needle) || descLower.includes(needle)) {
              const label = header.title || name
              const excerpt = header.description ? `${label} — ${header.description}` : label
              results.push({ path: filePath, name, excerpt, matchType: 'content' })
              return
            }
          }

          // Content match (skip if tag-only search)
          if (!isTagSearch) {
            const body = splitMarkdownFrontMatter(content).body
            const idx = body.toLowerCase().indexOf(needle)
            if (idx >= 0) {
              const start = Math.max(0, idx - 40)
              const end = Math.min(body.length, idx + needle.length + 80)
              const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
              const excerpt = (start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')
              results.push({ path: filePath, name, excerpt, matchType: 'content' })
            }
          }
        } catch { /* ignore unreadable files */ }
      }))
    }

    for (const archivedFile of archivedFiles) {
      try {
        const content: string = await holo.readFile(archivedFile.archivedPath)
        const header = getEditableMarkdownHeader(content)
        const name = getBaseName(archivedFile.originalPath).replace(/\.md$/i, '')
        const archiveLabel = `📦 Archivé (${getCommitTargetPath(rootPath, archivedFile.originalPath)})`

        const tagMatch = header.tags.some((t) => t.toLowerCase().includes(tagNeedle))

        if (tagMatch) {
          results.push({
            path: archivedFile.archivedPath,
            name,
            excerpt: `${archiveLabel} · ${header.tags.map((t) => `#${t}`).join(' ')}`,
            matchType: 'archive',
            isArchived: true,
            archivedPath: archivedFile.archivedPath,
            originalPath: archivedFile.originalPath,
          })
          continue
        }

        if (!isTagSearch) {
          const body = splitMarkdownFrontMatter(content).body
          const idx = body.toLowerCase().indexOf(needle)

          if (idx >= 0) {
            const start = Math.max(0, idx - 40)
            const end = Math.min(body.length, idx + needle.length + 80)
            const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
            const excerpt = `${archiveLabel} · ${(start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')}`

            results.push({
              path: archivedFile.archivedPath,
              name,
              excerpt,
              matchType: 'archive',
              isArchived: true,
              archivedPath: archivedFile.archivedPath,
              originalPath: archivedFile.originalPath,
            })
          }
        }
      } catch {
        // ignore unreadable archived files
      }
    }

    setSearchResults(results)
    setIsSearching(false)
  }, [allFilePaths, archivedFiles, getHoloApi, rootPath])

  const updateActiveTabBody = useCallback(
    (nextBody: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownBody(activeTab.content, nextBody)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const getNextTableDndId = useCallback(() => {
    const next = tableDndCounterRef.current
    tableDndCounterRef.current += 1
    return `table-dnd-${next}`
  }, [])

  const markdownToHtml = useCallback(
    (markdown: string) => parseMarkdownToHtml(markdown, getNextTableDndId),
    [getNextTableDndId],
  )

  const exportActiveFileToPdf = useCallback(async () => {
    if (!activeTab) {
      window.alert('Aucun fichier actif à exporter.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const header = getEditableMarkdownHeader(activeTab.content)
      const title = (header.title.trim() || activeTab.name.replace(/\.md$/i, '') || 'Document').trim()
      const bodyHtml = markdownToHtml(splitMarkdownFrontMatter(activeTab.content).body)

      const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #1a1a1a; line-height: 1.55; }
    h1, h2, h3, h4 { margin: 1.2em 0 0.5em; line-height: 1.25; }
    p, ul, ol, blockquote, pre, table { margin: 0.55em 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #f4f4f5; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
    blockquote { border-left: 3px solid #8b5cf6; padding-left: 12px; color: #444; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d4d4d8; padding: 8px; text-align: left; vertical-align: top; }
    img { max-width: 100%; height: auto; }
    a { color: #5b46d9; text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`

      const result = await holo.exportPdf({
        html,
        suggestedName: `${title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'}.pdf`,
      })

      if (!result.ok) {
        if (!result.canceled) {
          window.alert(result.error || 'Export PDF annulé.')
        }
        return
      }

      window.alert(`PDF exporté :\n${result.filePath}`)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTab, getHoloApi, markdownToHtml])

  const syncWysiwygFromMarkdown = useCallback(
    (markdown: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      isSyncingWysiwygRef.current = true
      editor.innerHTML = markdownToHtml(markdown)
      isSyncingWysiwygRef.current = false
    },
    [markdownToHtml],
  )

  useEffect(() => {
    if (editorMode !== 'wysiwyg' || !activeTabPath || !activeTab) {
      lastWysiwygSyncedTabRef.current = null
      return
    }

    if (lastWysiwygSyncedTabRef.current !== activeTabPath) {
      syncWysiwygFromMarkdown(splitMarkdownFrontMatter(activeTab.content).body)
      lastWysiwygSyncedTabRef.current = activeTabPath
    }
  }, [activeTab, activeTabPath, editorMode, syncWysiwygFromMarkdown])

  useEffect(() => {
    if (!pendingTitleFocusPath || activeTabPath !== pendingTitleFocusPath) {
      return
    }

    const timer = window.setTimeout(() => {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
      setPendingTitleFocusPath(null)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeTabPath, pendingTitleFocusPath])

  // Load images with data-src via IPC
  useEffect(() => {
    if (!desktopApiAvailable) return

    const loadImagesInEditor = async () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const images = editor.querySelectorAll('img[data-src]')
      for (const img of images) {
        if (img.getAttribute('data-loaded') === 'true') {
          continue
        }

        const relativePath = img.getAttribute('data-src')
        if (!relativePath) continue

        try {
          const holo = getHoloApi()
          if (!holo) continue
          
          const result = await holo.loadImage(relativePath)
          if (result.ok) {
            img.setAttribute('src', result.dataUrl)
            img.setAttribute('data-loaded', 'true')
          }
        } catch (error) {
          console.error(`Failed to load image ${relativePath}:`, error)
        }
      }
    }

    loadImagesInEditor()
  }, [editorMode, activeTabPath, desktopApiAvailable, getHoloApi])

  const findCurrentEditorBlockNode = useCallback((selection: Selection, editor: HTMLDivElement): Node | null => {
    const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']

    let node: Node | null = selection.anchorNode
    if (!node) return null

    // Caret can be anchored directly on the editor root. In that case, derive
    // the active line/block from the anchor offset.
    if (node === editor) {
      const offset = Math.max(0, Math.min(selection.anchorOffset, editor.childNodes.length))
      node = editor.childNodes[offset] ?? editor.childNodes[offset - 1] ?? null
      if (!node) return null
    }

    while (node && node !== editor) {
      if (node instanceof Element && BLOCK_TAGS.includes(node.tagName)) {
        return node
      }
      if (node.parentNode === editor) {
        return node
      }
      node = node.parentNode
    }

    return null
  }, [])

  // Helpers for getting text context in the contentEditable editor
  const getBlockTextBeforeCursor = useCallback((): { text: string; block: Element | null } => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return { text: '', block: null }
    const editor = wysiwygEditorRef.current
    if (!editor) return { text: '', block: null }

    const node = findCurrentEditorBlockNode(sel, editor)
    if (!node) return { text: '', block: null }

    const blockRange = document.createRange()
    blockRange.setStart(node, 0)
    if (node.contains(sel.anchorNode)) {
      blockRange.setEnd(sel.anchorNode!, sel.anchorOffset)
    } else if (sel.anchorNode === editor) {
      blockRange.setEnd(editor, sel.anchorOffset)
    } else {
      blockRange.selectNodeContents(node)
    }

    return { text: blockRange.toString(), block: (node instanceof Element ? node : null) }
  }, [findCurrentEditorBlockNode])

  const deleteCurrentBlockContents = useCallback(() => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const editor = wysiwygEditorRef.current
    if (!editor) return

    const node = findCurrentEditorBlockNode(sel, editor)
    if (!node) return

    const range = document.createRange()
    range.setStart(node, 0)

    // Only extend to cursor position if it's within this block (prevents cross-block deletion)
    if (node.contains(sel.anchorNode)) {
      range.setEnd(sel.anchorNode!, sel.anchorOffset)
    } else if (sel.anchorNode === editor) {
      range.setEnd(editor, sel.anchorOffset)
    } else {
      range.selectNodeContents(node)
    }
    range.deleteContents()
  }, [findCurrentEditorBlockNode])

  const askOpenAI = useCallback(async (userMessage: string): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: openaiPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2048,
      }),
    })
    if (!response.ok) throw new Error(`OpenAI ${response.status}`)
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content ?? ''
  }, [openaiApiKey, openaiPrompt])

  const askGemini = useCallback(async (userMessage: string): Promise<string> => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(geminiApiKey)}`
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: openaiPrompt }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ],
      }),
    })

    if (!response.ok) throw new Error(`Gemini ${response.status}`)

    const data = await response.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>
        }
      }>
    }

    const firstCandidateParts = data.candidates?.[0]?.content?.parts ?? []
    return firstCandidateParts.map((part) => part.text ?? '').join('').trim()
  }, [geminiApiKey, openaiPrompt])

  const askAi = useCallback(async (userMessage: string): Promise<string> => {
    const hasOpenAi = openaiApiKey.trim().length > 0
    const hasGemini = geminiApiKey.trim().length > 0

    if (!hasOpenAi && !hasGemini) {
      throw new Error('NO_PROVIDER')
    }

    if (aiProvider === 'openai') {
      if (!hasOpenAi) throw new Error('OPENAI_KEY_MISSING')
      return askOpenAI(userMessage)
    }

    if (aiProvider === 'gemini') {
      if (!hasGemini) throw new Error('GEMINI_KEY_MISSING')
      return askGemini(userMessage)
    }

    if (hasGemini) {
      return askGemini(userMessage)
    }

    return askOpenAI(userMessage)
  }, [aiProvider, askGemini, askOpenAI, geminiApiKey, openaiApiKey])

  const submitAiDialog = useCallback(async () => {
    if (!aiDialog) return
    setAiDialog((prev) => prev ? { ...prev, isLoading: true } : null)
    const userMessage = aiDialog.mode === 'transform' && aiDialog.selectedText
      ? `Texte sélectionné :\n${aiDialog.selectedText}\n\nInstruction : ${aiDialog.prompt}`
      : aiDialog.prompt
    try {
      const result = await askAi(userMessage)
      const html = markdownToHtml(result)
      const editor = wysiwygEditorRef.current
      if (!editor) return
      const savedRange = aiSavedRangeRef.current
      if (savedRange) {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(savedRange)
        if (aiDialog.mode === 'transform') savedRange.deleteContents()
      } else {
        editor.focus()
      }
      document.execCommand('insertHTML', false, html)
      const md = turndownService.turndown(editor.innerHTML)
      updateActiveTabBody(md)
      setAiDialog(null)
      aiSavedRangeRef.current = null
    } catch (err) {
      console.error('AI error', err)
      const normalizedError = err instanceof Error ? err.message : String(err)
      if (normalizedError === 'NO_PROVIDER') {
        setAiDialog((prev) => prev ? { ...prev, isLoading: false, error: 'Ajoute une clé OpenAI ou Gemini dans les Paramètres.' } : null)
        return
      }
      if (normalizedError === 'OPENAI_KEY_MISSING') {
        setAiDialog((prev) => prev ? { ...prev, isLoading: false, error: 'Le provider sélectionné est OpenAI mais la clé est vide.' } : null)
        return
      }
      if (normalizedError === 'GEMINI_KEY_MISSING') {
        setAiDialog((prev) => prev ? { ...prev, isLoading: false, error: 'Le provider sélectionné est Gemini mais la clé est vide.' } : null)
        return
      }
      const status = err instanceof Error ? (err.message.match(/\d+/)?.[0] ?? '') : ''
      const msg = status === '429'
        ? 'Quota d\'API dépassé (429). Vérifie ta limite OpenAI/Gemini.'
        : status === '401'
        ? 'Clé API invalide (401). Vérifie les Paramètres IA.'
        : `Erreur IA${status ? ` (${status})` : ''}`
      setAiDialog((prev) => prev ? { ...prev, isLoading: false, error: msg } : null)
    }
  }, [aiDialog, askAi, markdownToHtml, turndownService, updateActiveTabBody])

  const insertLinkIntoEditor = useCallback((text: string, url: string) => {
    const editor = wysiwygEditorRef.current

    if (!editor) {
      return
    }

    const trimmedUrl = url.trim()

    if (!trimmedUrl) {
      linkSavedRangeRef.current = null
      return
    }

    const trimmedText = text.trim() || trimmedUrl
    const sel = window.getSelection()
    const savedRange = linkSavedRangeRef.current

    editor.focus()

    if (savedRange && sel) {
      sel.removeAllRanges()
      sel.addRange(savedRange)
    }

    const activeRange = sel?.rangeCount ? sel.getRangeAt(0) : null

    if (activeRange) {
      activeRange.deleteContents()
      const anchor = document.createElement('a')
      anchor.setAttribute('href', trimmedUrl)
      anchor.textContent = trimmedText
      activeRange.insertNode(anchor)
      activeRange.setStartAfter(anchor)
      activeRange.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(activeRange)
    } else {
      document.execCommand('insertHTML', false, `<a href="${trimmedUrl}">${trimmedText}</a>`)
    }

    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
    linkSavedRangeRef.current = null
  }, [turndownService, updateActiveTabBody])

  const executeSlashCommand = useCallback((cmd: SlashCommand) => {
    const editor = wysiwygEditorRef.current
    if (!editor) return

    // Save the block reference BEFORE deletion so we can re-anchor the cursor
    const { block: targetBlock } = getBlockTextBeforeCursor()

    // Delete the slash + query text
    deleteCurrentBlockContents()

    // Detect if we're on the first line (bare text node, no proper block element wrapper)
    const isProperBlock = targetBlock instanceof Element &&
      ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'].includes(targetBlock.tagName)

    // Re-place cursor explicitly into targetBlock to avoid browser moving it to the block above
    if (isProperBlock && editor.contains(targetBlock)) {
      const sel = window.getSelection()
      const r = document.createRange()
      r.selectNodeContents(targetBlock)
      r.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(r)
    }

    // Helper: apply block format — uses formatBlock when in a proper block element,
    // falls back to insertHTML for first-line bare text nodes (formatBlock is a no-op on empty text nodes)
    const applyBlockFormat = (tag: string) => {
      if (isProperBlock) {
        document.execCommand('formatBlock', false, `<${tag}>`)
      } else {
        document.execCommand('insertHTML', false, `<${tag}><br></${tag}>`)
      }
    }

    switch (cmd.id) {
      case 'h1': applyBlockFormat('h1'); break
      case 'h2': applyBlockFormat('h2'); break
      case 'h3': applyBlockFormat('h3'); break
      case 'h4': applyBlockFormat('h4'); break
      case 'bullet': document.execCommand('insertUnorderedList'); break
      case 'ordered': document.execCommand('insertOrderedList'); break
      case 'quote': applyBlockFormat('blockquote'); break
      case 'code': {
        const pre = document.createElement('pre')
        const code = document.createElement('code')
        code.className = 'language-plaintext'
        code.innerHTML = '\u200B'
        pre.appendChild(code)
        const pAfter = document.createElement('p')
        pAfter.innerHTML = '<br>'
        if (isProperBlock && editor.contains(targetBlock as Element)) {
          ;(targetBlock as Element).replaceWith(pre, pAfter)
        } else {
          editor.appendChild(pre)
          editor.appendChild(pAfter)
        }
        const sel2 = window.getSelection()
        const r2 = document.createRange()
        r2.selectNodeContents(code)
        r2.collapse(true)
        sel2?.removeAllRanges()
        sel2?.addRange(r2)
        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
        break
      }
      case 'table': {
        const html = '<table><thead><tr><th>Col A</th><th>Col B</th></tr></thead><tbody><tr><td>\u200B</td><td></td></tr><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table><p><br></p>'
        document.execCommand('insertHTML', false, html)
        // Focus first body cell after insertion
        setTimeout(() => {
          const firstCell = editor.querySelector('tbody td') as HTMLTableCellElement | null
          if (firstCell) {
            const sel = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(firstCell)
            range.collapse(true)
            sel?.removeAllRanges()
            sel?.addRange(range)
          }
        }, 0)
        break
      }
      case 'kanban': {
        const html = '<table><thead><tr><th>📝 À faire</th><th>🚧 En cours</th><th>✅ Terminé</th></tr></thead><tbody><tr><td>Ticket 1</td><td></td><td></td></tr><tr><td>Ticket 2</td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table><p><br></p>'
        document.execCommand('insertHTML', false, html)
        setTimeout(() => {
          const firstCell = editor.querySelector('tbody td') as HTMLTableCellElement | null
          if (firstCell) {
            const sel = window.getSelection()
            const range = document.createRange()
            range.selectNodeContents(firstCell)
            range.collapse(true)
            sel?.removeAllRanges()
            sel?.addRange(range)
          }
        }, 0)
        break
      }
      case 'todo': {
        const html = '<ul class="task-list"><li class="task-item"><input class="task-checkbox" type="checkbox"><span class="task-label">Tâche</span></li></ul><p><br></p>'
        document.execCommand('insertHTML', false, html)
        break
      }
      case 'separator': {
        document.execCommand('insertHTML', false, '<hr class="holo-hr"><p><br></p>')
        break
      }
      case 'link': {
        const sel = window.getSelection()
        const selectedText = sel?.toString() ?? ''
        linkSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
        setSlashMenu(null)
        setSlashMenuIndex(0)
        setLinkDialog({ text: selectedText, url: '', pageQuery: '' })
        return
      }
      case 'image': {
        setSlashMenu(null)
        setSlashMenuIndex(0)

        if (repoImageStorageMode === 'azure' && (!azureBlobContainerUrl.trim() || !azureBlobSasToken.trim())) {
          window.alert('Configuration Azure incomplète (container URL + SAS token).')
          setShowSettings(true)
          return
        }

        if (
          repoImageStorageMode === 's3'
          && (!s3Region.trim() || !s3Bucket.trim() || !s3AccessKeyId.trim() || !s3SecretAccessKey.trim())
        ) {
          window.alert('Configuration S3 incomplète (region, bucket, access key, secret key).')
          setShowSettings(true)
          return
        }

        if (repoImageStorageMode === 'dropbox' && !dropboxAccessToken.trim()) {
          window.alert('Configuration Dropbox incomplète (access token).')
          setShowSettings(true)
          return
        }

        if (repoImageStorageMode === 'gdrive' && !gdriveAccessToken.trim()) {
          window.alert('Configuration Google Drive incomplète (access token).')
          setShowSettings(true)
          return
        }

        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return
          const holo = getHoloApi()
          if (!holo) return
          const reader = new FileReader()
          reader.onload = async (e) => {
            const dataUrl = e.target?.result as string
            if (!dataUrl) return
            const base64 = dataUrl.split(',')[1]
            if (!base64) return
            try {
              const result = await holo.saveImage(file.name, base64, {
                mode: repoImageStorageMode,
                azure: repoImageStorageMode === 'azure'
                  ? {
                    containerUrl: azureBlobContainerUrl,
                    sasToken: azureBlobSasToken,
                  }
                  : undefined,
                s3: repoImageStorageMode === 's3'
                  ? {
                    region: s3Region,
                    bucket: s3Bucket,
                    accessKeyId: s3AccessKeyId,
                    secretAccessKey: s3SecretAccessKey,
                    endpoint: s3Endpoint,
                    publicBaseUrl: s3PublicBaseUrl,
                  }
                  : undefined,
                dropbox: repoImageStorageMode === 'dropbox'
                  ? {
                    accessToken: dropboxAccessToken,
                    folderPath: dropboxFolderPath,
                  }
                  : undefined,
                gdrive: repoImageStorageMode === 'gdrive'
                  ? {
                    accessToken: gdriveAccessToken,
                    folderId: gdriveFolderId,
                  }
                  : undefined,
              })
              const ed = wysiwygEditorRef.current
              if (!ed) return
              ed.focus()
              const isExternal = /^https?:\/\//i.test(result.relativePath)
              const safePath = result.relativePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
              const imageHtml = isExternal
                ? `<img src="${safePath}" alt="${file.name}"><p><br></p>`
                : `<img src="${dataUrl}" data-src="${safePath}" alt="${file.name}"><p><br></p>`
              document.execCommand('insertHTML', false, imageHtml)
              const md = turndownService.turndown(ed.innerHTML)
              updateActiveTabBody(md)
            } catch (err) {
              console.error('saveImage error', err)
              window.alert((err as Error).message)
            }
          }
          reader.readAsDataURL(file)
        }
        input.click()
        return
      }
      case 'ai': {
        setSlashMenu(null)
        setSlashMenuIndex(0)
        const sel = window.getSelection()
        aiSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
        setAiDialog({ mode: 'generate', prompt: '', isLoading: false, selectedText: '' })
        return
      }
      default: break
    }
    
    setSlashMenu(null)
    setSlashMenuIndex(0)
    editor.focus()
    
    // Sync markdown
    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
  }, [deleteCurrentBlockContents, turndownService, updateActiveTabBody])

  // ── Image drag & drop helpers ────────────────────────────────────────

  const isImageFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      return true
    }

    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name)
  }, [])

  const hasImageInDragEvent = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (Array.from(event.dataTransfer.files).some(isImageFile)) {
        return true
      }

      return Array.from(event.dataTransfer.items).some(
        (item) => item.kind === 'file' && (item.type.startsWith('image/') || item.type === ''),
      )
    },
    [isImageFile],
  )

  const onEditorDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (isEditorReadOnly) return
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent, isEditorReadOnly],
  )

  const onEditorDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (isEditorReadOnly) return
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      imageDragDepthRef.current += 1
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent, isEditorReadOnly],
  )

  const onEditorDragLeave = useCallback(() => {
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1)
    if (imageDragDepthRef.current === 0) {
      setIsImageDragOverEditor(false)
    }
  }, [])

  const formatCodeBlock = useCallback(
    async (codeEl: HTMLElement) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const currentLang = Array.from(codeEl.classList)
        .find((c) => c.startsWith('language-'))
        ?.replace('language-', '') ?? 'plaintext'

      const parserByLang: Record<string, 'babel' | 'typescript' | 'json' | 'css' | 'html' | 'markdown'> = {
        javascript: 'babel',
        typescript: 'typescript',
        json: 'json',
        css: 'css',
        html: 'html',
        markdown: 'markdown',
      }

      const parser = parserByLang[currentLang]

      if (!parser) {
        window.alert(`Formatage non disponible pour le langage: ${currentLang}`)
        return
      }

      const raw = (codeEl.textContent ?? '').replace(/\u200B/g, '')

      try {
        const formatted = await prettier.format(raw, {
          parser,
          plugins: [
            prettierPluginBabel,
            prettierPluginEstree,
            prettierPluginTypescript,
            prettierPluginPostcss,
            prettierPluginHtml,
            prettierPluginMarkdown,
          ],
          tabWidth: 2,
          printWidth: 100,
          semi: true,
          singleQuote: false,
        })

        codeEl.textContent = formatted.replace(/\n$/, '')

        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
        syncWysiwygFromMarkdown(md)
      } catch (error) {
        window.alert(`Échec du formatage: ${(error as Error).message}`)
      }
    },
    [syncWysiwygFromMarkdown, turndownService, updateActiveTabBody],
  )

  const ensureImageProviderReady = useCallback(() => {
    if (repoImageStorageMode === 'local') {
      return true
    }

    if (repoImageStorageMode === 'azure' && (!azureBlobContainerUrl.trim() || !azureBlobSasToken.trim())) {
      window.alert('Configuration Azure incomplète (container URL + SAS token).')
      setShowSettings(true)
      return false
    }

    if (
      repoImageStorageMode === 's3'
      && (!s3Region.trim() || !s3Bucket.trim() || !s3AccessKeyId.trim() || !s3SecretAccessKey.trim())
    ) {
      window.alert('Configuration S3 incomplète (region, bucket, access key, secret key).')
      setShowSettings(true)
      return false
    }

    if (repoImageStorageMode === 'dropbox' && !dropboxAccessToken.trim()) {
      window.alert('Configuration Dropbox incomplète (access token).')
      setShowSettings(true)
      return false
    }

    if (repoImageStorageMode === 'gdrive' && !gdriveAccessToken.trim()) {
      window.alert('Configuration Google Drive incomplète (access token).')
      setShowSettings(true)
      return false
    }

    return true
  }, [
    azureBlobContainerUrl,
    azureBlobSasToken,
    dropboxAccessToken,
    gdriveAccessToken,
    repoImageStorageMode,
    s3AccessKeyId,
    s3Bucket,
    s3Region,
    s3SecretAccessKey,
  ])

  const handleImageFiles = useCallback(
    async (
      files: File[],
      insertFn: (mdImage: string, relativePath: string, previewDataUrl: string) => void,
    ) => {
      const holo = getHoloApi()
      if (!holo) return

      if (!ensureImageProviderReady()) {
        return
      }

      for (const file of files) {
        const reader = new FileReader()
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          if (typeof dataUrl !== 'string') return
          const base64 = dataUrl.split(',')[1]
          if (!base64) return
          try {
            const result = await holo.saveImage(file.name, base64, {
              mode: repoImageStorageMode,
              azure: repoImageStorageMode === 'azure'
                ? {
                  containerUrl: azureBlobContainerUrl,
                  sasToken: azureBlobSasToken,
                }
                : undefined,
              s3: repoImageStorageMode === 's3'
                ? {
                  region: s3Region,
                  bucket: s3Bucket,
                  accessKeyId: s3AccessKeyId,
                  secretAccessKey: s3SecretAccessKey,
                  endpoint: s3Endpoint,
                  publicBaseUrl: s3PublicBaseUrl,
                }
                : undefined,
              dropbox: repoImageStorageMode === 'dropbox'
                ? {
                  accessToken: dropboxAccessToken,
                  folderPath: dropboxFolderPath,
                }
                : undefined,
              gdrive: repoImageStorageMode === 'gdrive'
                ? {
                  accessToken: gdriveAccessToken,
                  folderId: gdriveFolderId,
                }
                : undefined,
            })
            insertFn(`![${file.name}](${result.relativePath})`, result.relativePath, dataUrl)
          } catch (err) {
            console.error('saveImage error', err)
          }
        }
        reader.readAsDataURL(file)
      }
    },
    [
      azureBlobContainerUrl,
      azureBlobSasToken,
      ensureImageProviderReady,
      getHoloApi,
      repoImageStorageMode,
      s3AccessKeyId,
      s3Bucket,
      s3Endpoint,
      s3PublicBaseUrl,
      s3Region,
      s3SecretAccessKey,
      dropboxAccessToken,
      dropboxFolderPath,
      gdriveAccessToken,
      gdriveFolderId,
    ],
  )

  const {
    refreshTableSummaries,
    onWysiwygDragStart,
    onWysiwygDragOver,
    onWysiwygDrop,
    onWysiwygDragEnd,
    insertTableRow,
    insertTableColumn,
    deleteTableRow,
    deleteTableColumn,
    sortTableByCurrentColumn,
    setCurrentColumnType,
    openCurrentColumnTypePicker,
  } = useTableInteractions({
    wysiwygEditorRef,
    getNextTableDndId,
    imageDragDepthRef,
    setIsImageDragOverEditor,
    onEditorDragOver,
    handleImageFiles,
    isImageFile,
    turndownService,
    updateActiveTabBody,
    syncWysiwygFromMarkdown,
    setColumnTypePopup,
  })

  const onRawDrop = useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
      if (isEditorReadOnly) {
        return
      }

      imageDragDepthRef.current = 0
      setIsImageDragOverEditor(false)
      const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile)
      if (imageFiles.length === 0) return
      event.preventDefault()
      const target = event.currentTarget
      const cursor = target.selectionStart ?? target.value.length
      void handleImageFiles(imageFiles, (mdImage) => {
        const next = target.value.slice(0, cursor) + mdImage + '\n' + target.value.slice(cursor)
        updateActiveTabBody(next)
      })
    },
    [handleImageFiles, isEditorReadOnly, isImageFile, updateActiveTabBody],
  )

  const onRawKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Tab' || isEditorReadOnly) {
        return
      }

      const target = event.currentTarget
      const result = applyMarkdownListTabBehavior(
        target.value,
        target.selectionStart ?? 0,
        target.selectionEnd ?? 0,
        event.shiftKey,
      )

      if (!result.handled) {
        return
      }

      event.preventDefault()

      if (result.nextText !== target.value) {
        updateActiveTabBody(result.nextText)
      }

      requestAnimationFrame(() => {
        const textarea = rawEditorRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd)
      })
    },
    [isEditorReadOnly, updateActiveTabBody],
  )

  const onWysiwygInput = useCallback(() => {
    const editor = wysiwygEditorRef.current

    if (!editor || isSyncingWysiwygRef.current || isEditorReadOnly) {
      return
    }

    // Update slash menu query
    const { text } = getBlockTextBeforeCursor()
    if (slashMenu && text.startsWith('/')) {
      setSlashMenu((prev) => prev ? { ...prev, query: text.slice(1).toLowerCase() } : null)
      return // don't convert to markdown while slash menu is open
    }

    const markdown = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(markdown)
    refreshTableSummaries()
  }, [getBlockTextBeforeCursor, isEditorReadOnly, refreshTableSummaries, slashMenu, turndownService, updateActiveTabBody])
  const onWysiwygKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      if (isEditorReadOnly) {
        const allowedShortcut = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase())

        if (!allowedShortcut) {
          event.preventDefault()
        }

        return
      }

      // Ne traiter que les événements venant du contentEditable WYSIWYG lui-même
      // Ignorer ceux qui viennent des inputs ou autres éléments
      if (event.currentTarget !== editor || !editor.contains(event.target as Node)) {
        return
      }

      // ── CTRL+A in code block → select only code content ───────────────
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        const sel = window.getSelection()
        const anchorNode = sel?.anchorNode
        const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
        const anchorEl = anchorElement?.closest('pre')
        if (anchorEl && editor.contains(anchorEl)) {
          event.preventDefault()
          const range = document.createRange()
          range.selectNodeContents(anchorEl)
          sel?.removeAllRanges()
          sel?.addRange(range)
          return
        }
      }

      // ── Slash menu navigation ──────────────────────────────────────────
      if (slashMenu) {
        const filtered = SLASH_COMMANDS.filter((c) => matchesSlashQuery(c, slashMenu.query))
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashMenuIndex((i) => Math.min(i + 1, filtered.length - 1))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashMenuIndex((i) => Math.max(i - 1, 0))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const target = filtered[slashMenuIndex]
          if (target) executeSlashCommand(target)
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashMenu(null)
          setSlashMenuIndex(0)
          // Remove the "/" typed by pressing backspace
          document.execCommand('delete', false)
          return
        }
        if (event.key === ' ') {
          setSlashMenu(null)
          setSlashMenuIndex(0)
          return
        }
        if (event.key === 'Backspace') {
          const { text } = getBlockTextBeforeCursor()
          if (text === '/') {
            setSlashMenu(null)
            setSlashMenuIndex(0)
          }
        }
        return
      }

      // ── Slash trigger ──────────────────────────────────────────────────
      if (event.key === '/') {
        const { text } = getBlockTextBeforeCursor()
        if (text.trim() === '') {
          // Show slash menu at cursor position
          const sel = window.getSelection()
          if (sel?.rangeCount) {
            const range = sel.getRangeAt(0)
            // Create a temporary span to measure cursor position
            const tmpSpan = document.createElement('span')
            tmpSpan.textContent = '|'
            range.insertNode(tmpSpan)
            const rect = tmpSpan.getBoundingClientRect()
            tmpSpan.parentNode?.removeChild(tmpSpan)
            const editorRect = editor.getBoundingClientRect()
            const isInBottomHalf = rect.top > editorRect.top + editorRect.height / 2
            const menuHeightEstimate = 260
            const menuWidthEstimate = 260

            let x = rect.left
            let y = isInBottomHalf
              ? rect.top - menuHeightEstimate - 6
              : rect.top + rect.height + 6

            const minX = 8
            const maxX = Math.max(minX, window.innerWidth - menuWidthEstimate - 8)
            x = Math.max(minX, Math.min(x, maxX))

            const minY = Math.max(8, editorRect.top + 8)
            const maxY = Math.min(window.innerHeight - 8, editorRect.bottom - 8)
            y = Math.max(minY, Math.min(y, maxY))

            setSlashMenu({ x, y, query: '' })
            setSlashMenuIndex(0)
          }
        }
        return
      }

      // ── Tab navigation in tables ──────────────────────────────────────
      if (event.key === 'Tab') {
        const sel = window.getSelection()
        const anchor = sel?.anchorNode ?? null
        const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement ?? null
        const currentListItem = anchorEl?.closest('li') as HTMLLIElement | null

        if (currentListItem && editor.contains(currentListItem)) {
          event.preventDefault()
          document.execCommand(event.shiftKey ? 'outdent' : 'indent', false)
          const md = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(md)
          return
        }

        const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null
        const table = currentCell?.closest('table') as HTMLTableElement | null

        if (currentCell && table) {
          event.preventDefault()

          const allCells = Array.from(table.querySelectorAll('td, th')) as HTMLTableCellElement[]
          const currentIndex = allCells.indexOf(currentCell)

          if (!event.shiftKey) {
            // Tab → cellule suivante
            const nextCell = allCells[currentIndex + 1]
            if (nextCell) {
              const range = document.createRange()
              range.selectNodeContents(nextCell)
              range.collapse(false)
              sel?.removeAllRanges()
              sel?.addRange(range)
            } else {
              // Dernière cellule → créer une nouvelle ligne
              const lastRow = table.querySelector('tbody tr:last-child') as HTMLTableRowElement | null
              if (lastRow) {
                const colCount = Math.max(...Array.from(table.rows).map((r) => r.cells.length), 1)
                const newRow = document.createElement('tr')
                for (let i = 0; i < colCount; i++) {
                  const td = document.createElement('td')
                  td.innerHTML = i === 0 ? '\u200B' : ''
                  newRow.appendChild(td)
                }
                lastRow.parentNode?.insertBefore(newRow, lastRow.nextSibling)
                const firstCell = newRow.cells[0]
                if (firstCell) {
                  const range = document.createRange()
                  range.selectNodeContents(firstCell)
                  range.collapse(true)
                  sel?.removeAllRanges()
                  sel?.addRange(range)
                }
                const md = turndownService.turndown(editor.innerHTML)
                updateActiveTabBody(md)
              }
            }
          } else {
            // Shift+Tab → cellule précédente
            const prevCell = allCells[currentIndex - 1]
            if (prevCell) {
              const range = document.createRange()
              range.selectNodeContents(prevCell)
              range.collapse(false)
              sel?.removeAllRanges()
              sel?.addRange(range)
            }
          }
          return
        }
      }

      if (event.key === 'Enter') {
        const sel = window.getSelection()
        const anchor = sel?.anchorNode ?? null

        // ── Code block Enter/Shift+Enter ──────────────────────────────────
        const anchorEl = anchor instanceof Element ? anchor : anchor?.parentElement
        const pre = editor.contains(anchorEl ?? null)
          ? anchorEl?.closest('pre') ?? null
          : null
        if (pre) {
          event.preventDefault()
          if (event.shiftKey) {
            // Shift+Enter = newline inside code block
            document.execCommand('insertText', false, '\n')
          } else {
            // Enter = exit code block, create paragraph after
            const p = document.createElement('p')
            p.innerHTML = '<br>'
            pre.parentNode?.insertBefore(p, pre.nextSibling)
            const r = document.createRange()
            r.selectNodeContents(p)
            r.collapse(true)
            sel?.removeAllRanges()
            sel?.addRange(r)
            const md = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(md)
          }
          return
        }

        // ── Exit blockquote on Enter ──────────────────────────────────────
        const bq = anchor instanceof Element ? anchor.closest('blockquote') : anchor?.parentElement?.closest('blockquote')
        if (bq) {
          event.preventDefault()
          const p = document.createElement('p')
          p.innerHTML = '<br>'
          bq.parentNode?.insertBefore(p, bq.nextSibling)
          const r = document.createRange()
          r.selectNodeContents(p)
          r.collapse(true)
          sel?.removeAllRanges()
          sel?.addRange(r)
          const md = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(md)
          return
        }

        const currentLi = anchor instanceof Element ? anchor.closest('li') : anchor?.parentElement?.closest('li')
        const currentCheckbox = currentLi?.querySelector('input[type="checkbox"]')

        if (currentLi && currentCheckbox) {
          event.preventDefault()

          if (event.shiftKey) {
            document.execCommand('insertLineBreak')
            const markdown = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(markdown)
            return
          }

          const currentList = currentLi.parentElement
          const currentLabel = currentLi.querySelector('.task-label')
          const currentText = currentLabel?.textContent?.replace(/\u200B/g, '').trim() ?? ''

          if (!currentText) {
            const paragraph = document.createElement('p')
            paragraph.innerHTML = '<br>'

            if (currentList?.parentNode) {
              currentList.parentNode.insertBefore(paragraph, currentList.nextSibling)
            }

            currentLi.remove()

            if (currentList && currentList.children.length === 0) {
              currentList.remove()
            }

            const range = document.createRange()
            range.selectNodeContents(paragraph)
            range.collapse(true)
            sel?.removeAllRanges()
            sel?.addRange(range)

            const markdown = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(markdown)
            return
          }

          const nextLi = document.createElement('li')
          nextLi.className = 'task-item'
          nextLi.innerHTML = '<input class="task-checkbox" type="checkbox"><span class="task-label"><br></span>'

          if (currentLi.nextSibling) {
            currentLi.parentNode?.insertBefore(nextLi, currentLi.nextSibling)
          } else {
            currentLi.parentNode?.appendChild(nextLi)
          }

          const label = nextLi.querySelector('.task-label')
          const range = document.createRange()
          if (label) {
            range.selectNodeContents(label)
            range.collapse(true)
          } else {
            range.selectNodeContents(nextLi)
            range.collapse(false)
          }
          sel?.removeAllRanges()
          sel?.addRange(range)

          const markdown = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(markdown)
          return
        }
      }

      if (event.key === 'Backspace') {
        const sel = window.getSelection()
        const anchor = sel?.anchorNode ?? null
        const currentLi = anchor instanceof Element ? anchor.closest('li') : anchor?.parentElement?.closest('li')
        const currentCheckbox = currentLi?.querySelector('input[type="checkbox"]')

        if (currentLi && currentCheckbox) {
          const currentLabel = currentLi.querySelector('.task-label')
          const currentText = currentLabel?.textContent?.replace(/\u200B/g, '').trim() ?? ''

          if (!currentText) {
            event.preventDefault()

            const currentList = currentLi.parentElement
            const previousLi = currentLi.previousElementSibling as HTMLElement | null
            const nextLi = currentLi.nextElementSibling as HTMLElement | null

            currentLi.remove()

            let focusTarget: HTMLElement | null = previousLi?.querySelector('.task-label') as HTMLElement | null
            if (!focusTarget) {
              focusTarget = nextLi?.querySelector('.task-label') as HTMLElement | null
            }

            if (currentList && currentList.children.length === 0) {
              const paragraph = document.createElement('p')
              paragraph.innerHTML = '<br>'
              currentList.parentNode?.insertBefore(paragraph, currentList.nextSibling)
              currentList.remove()
              focusTarget = paragraph
            }

            if (focusTarget) {
              const range = document.createRange()
              range.selectNodeContents(focusTarget)
              range.collapse(false)
              sel?.removeAllRanges()
              sel?.addRange(range)
            }

            const markdown = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(markdown)
            return
          }
        }
      }

      // ── Markdown space shortcuts ───────────────────────────────────────
      if (event.key === ' ') {
        const { text, block } = getBlockTextBeforeCursor()
        if (!block) return

        const patterns: Array<[RegExp, () => void]> = [
          [/^#{4}$/, () => { deleteCurrentBlockContents(); document.execCommand('formatBlock', false, '<h4>') }],
          [/^#{3}$/, () => { deleteCurrentBlockContents(); document.execCommand('formatBlock', false, '<h3>') }],
          [/^#{2}$/, () => { deleteCurrentBlockContents(); document.execCommand('formatBlock', false, '<h2>') }],
          [/^#$/, () => { deleteCurrentBlockContents(); document.execCommand('formatBlock', false, '<h1>') }],
          [/^-$/, () => { deleteCurrentBlockContents(); document.execCommand('insertUnorderedList') }],
          [/^\*$/, () => { deleteCurrentBlockContents(); document.execCommand('insertUnorderedList') }],
          [/^1\.$/, () => { deleteCurrentBlockContents(); document.execCommand('insertOrderedList') }],
          [/^>$/, () => { deleteCurrentBlockContents(); document.execCommand('formatBlock', false, '<blockquote>') }],
        ]

        for (const [re, action] of patterns) {
          if (re.test(text)) {
            event.preventDefault()
            action()
            const md = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(md)
            return
          }
        }
      }
    },
    [deleteCurrentBlockContents, executeSlashCommand, getBlockTextBeforeCursor, isEditorReadOnly, slashMenu, slashMenuIndex, turndownService, updateActiveTabBody],
  )

  // Selection change → show/hide floating popup
  useEffect(() => {
    const onSelectionChange = () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      const sel = window.getSelection()
      if (!sel || !editor.contains(sel.anchorNode)) {
        setSelectionPopup(null)
        setTablePopup(null)
        setCodeBlockPopup(null)
        return
      }

      const anchorElement = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement ?? null
      const currentTable = anchorElement?.closest('table')

      if (currentTable) {
        const rect = currentTable.getBoundingClientRect()
        setTablePopup({ x: rect.right - 8, y: rect.top - 10 })
      } else {
        setTablePopup(null)
      }

      const currentPre = anchorElement?.closest('pre')
      if (!currentPre) {
        // Don't clear hoveredCodeBlock here — handled by onMouseLeave
      }

      if (sel.isCollapsed) {
        setSelectionPopup(null)
        return
      }

      if (sel.rangeCount) {
        const rect = sel.getRangeAt(0).getBoundingClientRect()
        setSelectionPopup({ x: rect.left + rect.width / 2, y: rect.top - 8 })
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  // Focus aiDialog textarea when dialog opens
  useEffect(() => {
    if (aiDialog && !aiDialog.isLoading) {
      requestAnimationFrame(() => aiTextareaRef.current?.focus())
    }
  }, [aiDialog])

  // Hide code block popup when clicking outside editor and popup
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (
        !target.closest('.wysiwyg-editor') &&
        !target.closest('.code-block-popup')
      ) {
        setCodeBlockPopup(null)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const formatReadonlyDate = useCallback((value?: string | null) => {
    if (!value) {
      return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return date.toLocaleString()
  }, [])

  const runWysiwygCommand = useCallback(
    (command: WysiwygCommand, value?: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      editor.focus()
      document.execCommand(command, false, value)
      onWysiwygInput()
    },
    [onWysiwygInput],
  )

  const autoCommitStructuralChange = useCallback(async (commitMessage: string) => {
    if (!gitState.isRepo || !window.holo) {
      return
    }

    try {
      await window.holo.gitCommit(commitMessage)
    } catch (error) {
      console.error('Auto-commit (structure) failed:', error)
    }
  }, [gitState.isRepo])

  const saveRepoImageConfig = useCallback(async () => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const existing = await holo.readRepoConfig().catch(() => null)
      const nextConfig = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), imageStorageMode: repoImageStorageMode }
        : { imageStorageMode: repoImageStorageMode }

      await holo.writeRepoConfig(nextConfig)
      setRepoImageModeReady(true)
      await refreshGitState(false)
      await autoCommitStructuralChange(
        buildAutoCommitMessage(appAuthor, 'UPDATE', rootPath, getRepoConfigPath(rootPath)),
      )
      window.alert('Configuration du dépôt sauvegardée.')
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshGitState, repoImageStorageMode, rootPath])

  const saveFolderIconConfig = useCallback(async (folderPath: string, icon: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const existing = await holo.readRepoConfig().catch(() => null)
      const folderIcons = (
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>).folderIcons as Record<string, string> | undefined
          : undefined
      ) || {}

      const relKey = getRepoRelativeFolderPath(rootPath, folderPath)

      // Also remove any legacy absolute-path key for this folder
      const legacyKeys = Object.keys(folderIcons).filter(k => k.startsWith('/') || /^[A-Za-z]:[/\\]/.test(k) || k.startsWith('~'))
      for (const lk of legacyKeys) {
        const normalized = lk.replace(/[/\\]+$/, '')
        const fp = folderPath.replace(/[/\\]+$/, '')
        if (normalized === fp) {
          delete folderIcons[lk]
        }
      }

      const nextFolderIcons = icon
        ? { ...folderIcons, [relKey]: icon }
        : { ...folderIcons }

      if (!icon && relKey in nextFolderIcons) {
        delete nextFolderIcons[relKey]
      }

      const nextConfig = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), folderIcons: nextFolderIcons }
        : { folderIcons: nextFolderIcons }

      await holo.writeRepoConfig(nextConfig)
      setFolderIconByPath((prev) => {
        if (icon) {
          return { ...prev, [folderPath]: icon }
        }

        if (!(folderPath in prev)) {
          return prev
        }

        const next = { ...prev }
        delete next[folderPath]
        return next
      })
      await refreshGitState(false)
      await autoCommitStructuralChange(
        buildAutoCommitMessage(appAuthor, 'UPDATE', rootPath, getRepoConfigPath(rootPath)),
      )
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshGitState, rootPath])

  const moveNode = useCallback(
    async (sourcePath: string, targetDirectoryPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      const holo = getHoloApi()

      if (!holo || sourcePath === targetDirectoryPath || isSameOrChildPath(sourcePath, targetDirectoryPath)) {
        return
      }

      try {
        const result = await holo.movePath(sourcePath, targetDirectoryPath)
        const nextPath = result.newPath

        setActiveTab((prev) =>
          prev && isSameOrChildPath(sourcePath, prev.path)
            ? { ...prev, path: prev.path.replace(sourcePath, nextPath) }
            : prev,
        )

        if (selectedPath && isSameOrChildPath(sourcePath, selectedPath)) {
          setSelectedPath(selectedPath.replace(sourcePath, nextPath))
        }

        if (activeTabPath && isSameOrChildPath(sourcePath, activeTabPath)) {
          setActiveTabPath(activeTabPath.replace(sourcePath, nextPath))
        }

        await refreshTree()
        await refreshGitState(false)
        await autoCommitStructuralChange(
          buildAutoCommitMessage(appAuthor, 'MOVE', rootPath, nextPath, `FROM ${getCommitTargetPath(rootPath, sourcePath)}`),
        )
      } catch (error) {
        window.alert((error as Error).message)
      } finally {
        setDraggedPath(null)
        setDropTargetPath(null)
      }
    },
    [activeTabPath, appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, rootPath, selectedPath],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'

      if (!isSaveKey) {
        return
      }

      event.preventDefault()
      if (activeTab && !readOnlyMode) {
        void saveCurrentFile()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrentFile, activeTab, readOnlyMode])

  useEffect(() => {
    if (!contextMenu) {
      return
    }

    const closeContextMenu = () => setContextMenu(null)
    const onWindowBlur = () => setContextMenu(null)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('resize', closeContextMenu)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('resize', closeContextMenu)
      window.removeEventListener('blur', onWindowBlur)
      window.removeEventListener('keydown', onEscape)
    }
  }, [contextMenu])

  const scrollToHeading = useCallback((headingIndex: number) => {
    const editor = wysiwygEditorRef.current
    if (!editor) {
      return
    }

    const headings = Array.from(editor.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    const target = headings[headingIndex] as HTMLElement | undefined

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const onTocItemClick = useCallback(
    (headingIndex: number) => {
      if (editorMode === 'wysiwyg') {
        scrollToHeading(headingIndex)
        return
      }

      setEditorMode('wysiwyg')
      window.setTimeout(() => {
        scrollToHeading(headingIndex)
      }, 60)
    },
    [editorMode, scrollToHeading],
  )

  const openCreateFileDialog = useCallback((targetPath?: string | null, targetType?: NodeType | null) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    const targetDirectory = getDirectoryTarget(
      rootPath,
      targetPath ?? selectedPath,
      targetType ?? selectedType,
    )

    setNameDialog({
      mode: 'create-file',
      value: '',
      targetDirectoryPath: targetDirectory ?? rootPath,
      selectedTemplatePath: null,
    })
  }, [ensureWritableMode, rootPath, selectedPath, selectedType])

  const openCreateDirectoryDialog = useCallback((targetPath?: string | null, targetType?: NodeType | null) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    const targetDirectory = getDirectoryTarget(
      rootPath,
      targetPath ?? selectedPath,
      targetType ?? selectedType,
    )

    setNameDialog({
      mode: 'create-directory',
      value: '',
      targetDirectoryPath: targetDirectory ?? rootPath,
    })
  }, [ensureWritableMode, rootPath, selectedPath, selectedType])

  const openRenameDialog = useCallback((targetPathOverride?: string | null) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    const targetPath = targetPathOverride ?? selectedPath

    if (!targetPath) {
      window.alert('Sélectionne un fichier ou un dossier à renommer.')
      return
    }

    if (targetPath === rootPath) {
      window.alert('Le dossier racine ne peut pas être renommé.')
      return
    }

    setNameDialog({
      mode: 'rename',
      value: getBaseName(targetPath),
      targetPath,
    })
  }, [ensureWritableMode, rootPath, selectedPath])

  const submitNameDialog = useCallback(async () => {
    if (!nameDialog || !rootPath) {
      return
    }

    if (!ensureWritableMode()) {
      return
    }

    const value = nameDialog.value.trim()

    if (!value) {
      window.alert('Le nom ne peut pas être vide.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      let commitMessage: string | null = null

      if (nameDialog.mode === 'create-file') {
        // Auto-append .md extension if not provided
        const filename = value.endsWith('.md') ? value : `${value}.md`
        const newFilePath = `${nameDialog.targetDirectoryPath}/${filename}`
        await holo.createFile(nameDialog.targetDirectoryPath, filename)

        if (nameDialog.selectedTemplatePath) {
          const templateContent = await holo.readFile(nameDialog.selectedTemplatePath)
          let contentFromTemplate = updateMarkdownBooleanHeaderField(templateContent, 'template', false)
          if (nameDialog.templateVariables && Object.keys(nameDialog.templateVariables).length > 0) {
            contentFromTemplate = applyTemplateVariables(contentFromTemplate, nameDialog.templateVariables)
          }
          await holo.writeFile(newFilePath, contentFromTemplate)
        }

        commitMessage = buildAutoCommitMessage(appAuthor, 'ADD', rootPath, newFilePath)
        
        // Auto-open the created file
        const content = await holo.readFile(newFilePath)
        setActiveTab({
          path: newFilePath,
          name: filename.replace(/\.md$/, ''),
          content,
          isDirty: false,
        })
        setActiveTabPath(newFilePath)
        setPendingTitleFocusPath(newFilePath)
      } else if (nameDialog.mode === 'create-directory') {
        const newDirectoryPath = `${nameDialog.targetDirectoryPath}/${value}`
        await holo.createDirectory(nameDialog.targetDirectoryPath, value)
        commitMessage = buildAutoCommitMessage(appAuthor, 'ADD_DIR', rootPath, newDirectoryPath)
      } else if (nameDialog.mode === 'rename') {
        const renameTargetPath = nameDialog.targetPath
        const result = await holo.renamePath(renameTargetPath, value)
        commitMessage = buildAutoCommitMessage(
          appAuthor,
          'RENAME',
          rootPath,
          result.newPath,
          `FROM ${getCommitTargetPath(rootPath, renameTargetPath)}`,
        )

        setActiveTab((prev) =>
          prev && isSameOrChildPath(renameTargetPath, prev.path)
            ? {
              ...prev,
              path: prev.path.replace(renameTargetPath, result.newPath),
              name: getBaseName(prev.path.replace(renameTargetPath, result.newPath)),
            }
            : prev,
        )

        if (selectedPath && isSameOrChildPath(renameTargetPath, selectedPath)) {
          setSelectedPath(selectedPath.replace(renameTargetPath, result.newPath))
        }

        if (activeTabPath && isSameOrChildPath(renameTargetPath, activeTabPath)) {
          setActiveTabPath(activeTabPath.replace(renameTargetPath, result.newPath))
        }
      }

      setNameDialog(null)
      await refreshTree()
      await refreshGitState(false)
      if (commitMessage) {
        await autoCommitStructuralChange(commitMessage)
      }
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [ensureWritableMode, getHoloApi, nameDialog, activeTabPath, refreshGitState, refreshTree, rootPath, selectedPath, autoCommitStructuralChange, appAuthor])

  const toggleTemplateStatus = useCallback(async (targetPath: string, nextValue: boolean) => {
    if (!ensureWritableMode()) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const currentContent = await holo.readFile(targetPath)
      const nextContent = updateMarkdownBooleanHeaderField(currentContent, 'template', nextValue)

      await holo.writeFile(targetPath, nextContent)

      if (activeTab?.path === targetPath) {
        setActiveTab((prev) => (prev ? { ...prev, content: nextContent, isDirty: false } : prev))
      }

      setFileMetaByPath((prev) => {
        const currentMeta = prev[targetPath] ?? { title: '', description: '', isTemplate: false }

        if (!currentMeta.title && !currentMeta.description && !nextValue) {
          const next = { ...prev }
          delete next[targetPath]
          return next
        }

        return {
          ...prev,
          [targetPath]: {
            ...currentMeta,
            isTemplate: nextValue,
          },
        }
      })

      const stats = await holo.getPathStats(targetPath).catch(() => null)
      if (stats) {
        setPathStatsByPath((prev) => ({
          ...prev,
          [targetPath]: stats,
        }))
      }

      await refreshTree()
      await refreshGitState(false)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTab?.path, ensureWritableMode, getHoloApi, refreshGitState, refreshTree])

  const archivePathTarget = useCallback(async (targetPath: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const confirmed = await requestConfirmation({
      title: 'Archiver le fichier',
      message: 'Archiver ce fichier ?',
      confirmLabel: 'Archiver',
      cancelLabel: 'Annuler',
      intent: 'danger',
    })

    if (!confirmed) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      const result = await holo.archivePath(targetPath)

      if (activeTabPath && isSameOrChildPath(targetPath, activeTabPath)) {
        setActiveTab(null)
        setActiveTabPath(null)
      }

      await refreshTree()
      await refreshArchivedFiles()
      await refreshGitState(false)
      await autoCommitStructuralChange(
        buildAutoCommitMessage(
          appAuthor,
          'ARCHIVE',
          rootPath,
          result.archivedPath,
          `FROM ${getCommitTargetPath(rootPath, targetPath)}`,
        ),
      )
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTabPath, appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshArchivedFiles, refreshGitState, refreshTree, requestConfirmation, rootPath])

  const restoreArchivedPathTarget = useCallback(async (archivedPath: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const confirmed = await requestConfirmation({
      title: 'Récupérer le fichier',
      message: 'Récupérer ce fichier archivé ?',
      confirmLabel: 'Récupérer',
      cancelLabel: 'Annuler',
    })

    if (!confirmed) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      const result = await holo.restoreArchivedPath(archivedPath)
      await refreshTree()
      await refreshArchivedFiles()
      await refreshGitState(false)
      await autoCommitStructuralChange(
        buildAutoCommitMessage(
          appAuthor,
          'RESTORE',
          rootPath,
          result.restoredPath,
          `FROM ${getCommitTargetPath(rootPath, archivedPath)}`,
        ),
      )
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshArchivedFiles, refreshGitState, refreshTree, requestConfirmation, rootPath])

  const deletePathTarget = useCallback(async (targetPath: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath || targetPath === rootPath) {
      return
    }

    const confirmed = await requestConfirmation({
      title: 'Supprimer',
      message: 'Confirmer la suppression ?',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      intent: 'danger',
    })

    if (!confirmed) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      await holo.deletePath(targetPath)
      if (activeTabPath && isSameOrChildPath(targetPath, activeTabPath)) {
        setActiveTab(null)
        setActiveTabPath(null)
      }

      setSelectedPath(rootPath)
      setSelectedType('directory')
      await refreshTree()
      await refreshGitState(false)
      await autoCommitStructuralChange(buildAutoCommitMessage(appAuthor, 'DELETE', rootPath, targetPath))
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTabPath, appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, requestConfirmation, rootPath])

  const copyPathTarget = useCallback(async (targetPath: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      // Extraire le répertoire parent du chemin
      const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || rootPath
      const result = await holo.copyFile(targetPath, parentPath)
      
      setSelectedPath(result.newPath)
      setSelectedType('file')
      await refreshTree()
      await refreshGitState(false)
      await autoCommitStructuralChange(buildAutoCommitMessage(appAuthor, 'CREATE', rootPath, result.newPath))
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [appAuthor, autoCommitStructuralChange, ensureWritableMode, getHoloApi, refreshGitState, refreshTree, rootPath])

  const openTreeContextMenu = useCallback((node: TreeNode, position: { x: number; y: number }) => {
    setSelectedPath(node.path)
    setSelectedType(node.type)
    setContextMenu({ x: position.x, y: position.y, node })
  }, [])

  const runContextAction = useCallback((action: () => void) => {
    setContextMenu(null)
    action()
  }, [])

  const openCommitDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n’est pas un dépôt Git.')
      return
    }

    setGitDialog({ mode: 'commit', value: '' })
  }, [gitState.isRepo])

  const openMergeDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n’est pas un dépôt Git.')
      return
    }

    setGitDialog({ mode: 'merge', value: '' })
  }, [gitState.isRepo])

  const submitGitDialog = useCallback(async () => {
    if (!gitDialog) {
      return
    }

    const value = gitDialog.value.trim()

    if (!value) {
      window.alert(gitDialog.mode === 'commit' ? 'Message de commit requis.' : 'Nom de branche requis.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      if (gitDialog.mode === 'commit') {
        const commitResult = await holo.gitCommit(value)

        if (commitResult.pushed) {
          window.alert('Commit créé et envoyé automatiquement.')
        } else {
          window.alert(
            `Commit créé localement, mais l’envoi automatique a échoué.\n\n${commitResult.pushError ?? 'Fais un pull ou résous les conflits avant de réessayer.'}`,
          )
        }
      } else {
        await holo.gitMerge(value)
      }

      setGitDialog(null)
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, gitDialog, refreshGitState])

  const pullChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitPull()
      await refreshGitState(true)
      await checkRemoteFreshnessAndGuardEditing(false)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [checkRemoteFreshnessAndGuardEditing, getHoloApi, refreshGitState])

  const fetchChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitFetch()
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

  const syncRepository = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      const syncResult = await holo.gitSync()
      await refreshGitState(true)

      if (syncResult.hadConflicts) {
        const message = `Conflits détectés pendant la synchronisation. ${syncResult.error ?? ''}`.trim()
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(`${message}\n\nOuvre les fichiers listés ci-dessous pour les résoudre.`)
        return
      }

      if (syncResult.error) {
        const message = `Synchronisation partielle : ${getFriendlyGitErrorMessage(syncResult.error)}`
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(message)
        return
      }

      const commitInfo = syncResult.committed
        ? '\n- Commit automatique créé.'
        : '\n- Aucun commit nécessaire.'

      const pushInfo = syncResult.pushed
        ? '\n- Push effectué.'
        : '\n- Aucun push nécessaire.'

      const successMessage = `Synchronisation terminée.${commitInfo}${pushInfo}`
      setSyncFeedback({
        status: 'success',
        message: successMessage,
        at: new Date().toISOString(),
      })
      window.alert(successMessage)
    } catch (error) {
      const friendlyMessage = getFriendlyGitErrorMessage((error as Error).message)
      setSyncFeedback({
        status: 'error',
        message: friendlyMessage,
        at: new Date().toISOString(),
      })
      window.alert(friendlyMessage)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

  const conflictedFiles = normalizeGitState(gitState).conflictedFiles
  const gitAuthErrorActive = isLikelyGitAuthError(gitState.error)
    || (syncFeedback.status === 'error' && isLikelyGitAuthError(syncFeedback.message))
    || (syncFeedback.status === 'warning' && isLikelyGitAuthError(syncFeedback.message))

  const openConflictedFile = useCallback(
    async (filePath: string) => {
      try {
        setSelectedPath(filePath)
        setSelectedType('file')
        await openFile(filePath)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [openFile],
  )

  const resolveConflictChoice = useCallback(
    async (filePath: string, strategy: 'ours' | 'theirs') => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      setIsGitBusy(true)

      try {
        await holo.gitResolveConflict(filePath, strategy)
        await refreshGitState(false)
        await checkRemoteFreshnessAndGuardEditing(false)
        setSyncFeedback({
          status: 'success',
          message: strategy === 'ours'
            ? `Conflit résolu avec la version locale: ${getBaseName(filePath)}`
            : `Conflit résolu avec la version serveur: ${getBaseName(filePath)}`,
          at: new Date().toISOString(),
        })
      } catch (error) {
        window.alert((error as Error).message)
      } finally {
        setIsGitBusy(false)
      }
    },
    [checkRemoteFreshnessAndGuardEditing, getHoloApi, refreshGitState],
  )

  const minimizeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.minimizeWindow()
  }, [getHoloApi])

  const toggleDevTools = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.toggleDevTools()
  }, [getHoloApi])

  const toggleMaximizeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = await holo.toggleMaximizeWindow()
    setWindowIsMaximized(Boolean(result?.isMaximized))
  }, [getHoloApi])

  const closeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.closeWindow()
  }, [getHoloApi])

  const copyHoloLink = useCallback(async (filePath: string) => {
    const holo = getHoloApi()

    if (!holo || !rootPath) {
      return
    }

    const link = buildShareableHoloLink(rootPath, filePath, shareGatewayBaseUrl)

    if (!link) {
      return
    }

    try {
      await holo.writeClipboardText(link)
      setCopyLinkStatus('copied')
      window.setTimeout(() => setCopyLinkStatus('idle'), 2500)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [getHoloApi, rootPath, shareGatewayBaseUrl])

  // ── Editor callback helpers (used in JSX, extracted for stable references) ──

  const onPullNow = useCallback(() => { void pullChanges() }, [pullChanges])

  const onOpenLinkFromSelection = useCallback(() => {
    const sel = window.getSelection()
    const selectedText = sel?.toString() ?? ''
    linkSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setSelectionPopup(null)
    setLinkDialog({ text: selectedText, url: 'https://', pageQuery: '' })
  }, [setSelectionPopup, setLinkDialog])

  const onOpenAiTransformFromSelection = useCallback(() => {
    const sel = window.getSelection()
    const selectedText = sel?.toString() ?? ''
    aiSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setSelectionPopup(null)
    wysiwygEditorRef.current?.blur()
    setAiDialog({ mode: 'transform', prompt: '', isLoading: false, selectedText })
  }, [setSelectionPopup, setAiDialog])

  const onCloseColumnTypePopup = useCallback(() => setColumnTypePopup(null), [setColumnTypePopup])

  const onApplyCodeLanguage = useCallback((lang: string, codeEl: HTMLElement) => {
    const toRemove = Array.from(codeEl.classList).filter((c) => c.startsWith('language-') || c === 'hljs')
    toRemove.forEach((c) => codeEl.classList.remove(c))
    codeEl.className = `language-${lang}`
    setCodeBlockPopup(null)
    setHoveredCodeBlock(null)
    const editor = wysiwygEditorRef.current
    if (editor) {
      const md = turndownService.turndown(editor.innerHTML)
      updateActiveTabBody(md)
      syncWysiwygFromMarkdown(md)
    }
  }, [setCodeBlockPopup, setHoveredCodeBlock, turndownService, updateActiveTabBody, syncWysiwygFromMarkdown])

  const onToggleCompactToc = useCallback(() => setShowCompactToc((prev) => !prev), [setShowCompactToc])

  const onCompactTocItemClick = useCallback((headingIndex: number) => {
    onTocItemClick(headingIndex)
    setShowCompactToc(false)
  }, [onTocItemClick, setShowCompactToc])

  const onEditorSwitchRaw = useCallback(() => {
    if (!readOnlyMode) setEditorMode('raw')
  }, [readOnlyMode, setEditorMode])

  const onEditorSwitchWysiwyg = useCallback(() => setEditorMode('wysiwyg'), [setEditorMode])

  const onEditorExportPdf = useCallback(() => { void exportActiveFileToPdf() }, [exportActiveFileToPdf])

  const onEditorSave = useCallback(() => { void saveCurrentFile() }, [saveCurrentFile])

  const onHeaderMouseDown = useCallback(async (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return
    }

    if ((event.target as HTMLElement | null)?.closest('.no-drag')) {
      return
    }

    const holo = window.holo

    if (!holo) {
      return
    }

    let isWindows = windowPlatform === 'win32'
    let isMaximized = windowIsMaximized

    if (!isWindows || !isMaximized) {
      try {
        const state = await holo.getWindowState()
        isWindows = state?.platform === 'win32'
        isMaximized = Boolean(state?.isMaximized)
        setWindowPlatform(typeof state?.platform === 'string' ? state.platform : '')
        setWindowIsMaximized(Boolean(state?.isMaximized))
      } catch {
        return
      }
    }

    if (!isWindows || !isMaximized) {
      return
    }

    headerDragStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      pointerOffsetRatioX: window.innerWidth > 0 ? event.clientX / window.innerWidth : 0.5,
      restored: false,
    }

    const handleMouseMove = async (moveEvent: MouseEvent) => {
      const dragState = headerDragStateRef.current

      if (!dragState) {
        return
      }

      const deltaX = Math.abs(moveEvent.clientX - dragState.startClientX)
      const deltaY = Math.abs(moveEvent.clientY - dragState.startClientY)

      if (!dragState.restored) {
        if (deltaX < 6 && deltaY < 6) {
          return
        }

        dragState.restored = true

        try {
          await holo.dragWindowFromMaximized({
            pointerScreenX: moveEvent.screenX,
            pointerScreenY: moveEvent.screenY,
            pointerOffsetRatioX: dragState.pointerOffsetRatioX,
            headerHeight: headerRef.current?.offsetHeight ?? 64,
          })
          setWindowIsMaximized(false)
        } catch {
          cleanup()
        }

        return
      }

      try {
        const headerHeight = headerRef.current?.offsetHeight ?? 64
        await holo.setWindowPosition({
          x: Math.round(moveEvent.screenX - window.innerWidth * dragState.pointerOffsetRatioX),
          y: Math.max(0, Math.round(moveEvent.screenY - Math.min(headerHeight / 2, 24))),
        })
      } catch {
        cleanup()
      }
    }

    const cleanup = () => {
      headerDragStateRef.current = null
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', cleanup)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', cleanup)
  }, [windowIsMaximized, windowPlatform])

  const openFileInNewWindow = useCallback(async (filePath: string) => {
    if (!rootPath) {
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      return
    }

    try {
      await holo.openFileInNewWindow({ rootPath, filePath })
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [getHoloApi, rootPath])

  const openCloneDialog = useCallback(() => {
    setCloneDialog({
      repoUrl: '',
      destinationPath: '',
      username: '',
      password: '',
      isSubmitting: false,
    })
  }, [])

  const pickCloneDirectory = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo || !cloneDialog) {
      return
    }

    try {
      const selectedPath = await holo.gitPickCloneDirectory()

      if (!selectedPath) {
        return
      }

      setCloneDialog((previous) =>
        previous
          ? {
            ...previous,
            destinationPath: selectedPath,
          }
          : previous,
      )
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [cloneDialog, getHoloApi])

  const submitCloneDialog = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo || !cloneDialog) {
      return
    }

    const repoUrl = cloneDialog.repoUrl.trim()
    const destinationPath = cloneDialog.destinationPath.trim()
    const username = cloneDialog.username.trim()
    const password = cloneDialog.password.trim()

    if (!repoUrl) {
      window.alert('Le lien du dépôt est requis.')
      return
    }

    if (!destinationPath) {
      window.alert('Choisis un dossier de destination.')
      return
    }

    setCloneDialog((previous) =>
      previous
        ? {
          ...previous,
          isSubmitting: true,
        }
        : previous,
    )

    try {
      const result = await holo.gitCloneRepository({
        repoUrl,
        destinationPath,
        username: username || undefined,
        password: password || undefined,
      })

      applyOpenedFolder(result)
      setCloneDialog(null)
      await refreshRecentFolders()
      const nextGitState = await holo.gitGetState(true)
      setGitState(normalizeGitState(nextGitState))
    } catch (error) {
      window.alert((error as Error).message)
      setCloneDialog((previous) =>
        previous
          ? {
            ...previous,
            isSubmitting: false,
          }
          : previous,
      )
    }
  }, [applyOpenedFolder, cloneDialog, getHoloApi, refreshRecentFolders])

  const closeOpenedFolder = useCallback(() => {
    setRootPath(null)
    setTree(null)
    setSelectedPath(null)
    setSelectedType(null)
    setExpandedDirectories(new Set())
    setArchivedFiles([])
    setActiveTab(null)
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)
    setSyncFeedback(DEFAULT_SYNC_FEEDBACK)
    setContextMenu(null)
    setRepoImageStorageMode('local')
    setRepoImageModeReady(false)
    setFolderIconByPath({})
  }, [])

  const submitAuthorProfile = useCallback(() => {
    const nextAuthor = authorModalValue.trim()
    if (!nextAuthor) {
      return
    }

    setAppAuthor(nextAuthor)
    setShowAuthorModal(false)
    setShowUserMenu(false)
  }, [authorModalValue])

  const logoutAuthorProfile = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('holo-author')
    }

    setAppAuthor('')
    setShowUserMenu(false)
    setAuthorModalMode('startup')
    setAuthorModalValue('')
    setShowAuthorModal(true)
  }, [])


  return (
    <main
      className={`h-screen bg-[#242527] text-white rounded-lg font-sans ${isCompactLayout ? 'grid grid-cols-1 grid-rows-[64px_1fr]' : 'gap-x-2 grid grid-cols-[auto_1fr] grid-rows-[64px_1fr]'} overflow-hidden select-none`}
      style={{ gridTemplateAreas: isCompactLayout ? `'appbar' 'content'` : `'appbar appbar' 'sidebar content'` }}
    >

      {/* App header */}
      <AppHeader
        headerRef={headerRef}
        isCompactLayout={isCompactLayout}
        appVersion={appVersion}
        showTypeRBadge={showTypeRBadge}
        readOnlyMode={readOnlyMode}
        appAuthor={appAuthor}
        showUserMenu={showUserMenu}
        isSidebarOpenOnCompact={isSidebarOpenOnCompact}
        onHeaderMouseDown={onHeaderMouseDown}
        onToggleSidebar={() => setIsSidebarOpenOnCompact((previous) => !previous)}
        onToggleReadOnly={() => setReadOnlyMode((previous) => !previous)}
        onToggleUserMenu={() => setShowUserMenu((previous) => !previous)}
        onEditAuthor={() => {
          setAuthorModalMode('edit')
          setAuthorModalValue(appAuthor)
          setShowAuthorModal(true)
          setShowUserMenu(false)
        }}
        onLogout={logoutAuthorProfile}
        onDevTools={toggleDevTools}
        onMinimize={minimizeWindow}
        onMaximize={toggleMaximizeWindow}
        onClose={closeWindow}
        onCloseUserMenuBackdrop={() => setShowUserMenu(false)}
      />

      {isCompactLayout && isSidebarOpenOnCompact && (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px]"
          onClick={() => setIsSidebarOpenOnCompact(false)}
        />
      )}

      <AppSidebar
        isCompactLayout={isCompactLayout}
        isSidebarOpenOnCompact={isSidebarOpenOnCompact}
        activeSidebar={activeSidebar}
        showSettings={showSettings}
        hasActiveTab={Boolean(activeTab)}
        gitIncoming={gitState.incoming}
        gitOutgoing={gitState.outgoing}
        onSelectSidebar={selectSidebar}
        onToggleSearch={() => selectSidebar(activeSidebar === 'search' ? 'files' : 'search')}
        onToggleSettings={() => setShowSettings((v) => !v)}
      >

        {/* Panel Fichiers */}
        {activeSidebar === 'files' && (
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            
            {/* Titre du dossier */}
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-white/80 truncate">
                {rootPath ? `Dossier ${getBaseName(rootPath)}` : 'Aucun dossier'}
              </h2>
              {rootPath && (
                <button
                  className="size-6 shrink-0 rounded border border-white/10 text-white/55 hover:text-white hover:border-white/30 flex items-center justify-center"
                  onClick={closeOpenedFolder}
                  title="Fermer le dossier"
                >
                  <i className="fa-solid fa-xmark text-[10px]" />
                </button>
              )}
            </div>

            {rootPath && (
              <div className="space-y-2">
                <div className="flex items-center rounded border border-white/10 bg-[#242527] p-0.5">
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'explorer' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('explorer')}
                  >
                    Explorer
                  </button>
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'mine' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('mine')}
                  >
                    Mes fichiers
                  </button>
                  <button
                    className={`flex-1 rounded px-2 py-1 text-[10px] font-medium ${filesSection === 'recent' ? 'bg-[#7B61FF] text-white' : 'text-white/65 hover:text-white'}`}
                    onClick={() => setFilesSection('recent')}
                  >
                    Récents
                  </button>
                </div>

                {filesSection === 'mine' && (
                  <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-white/40">Auteur</p>
                    <input
                      className="w-full rounded bg-transparent px-1 py-0.5 text-xs text-white/80 outline-none placeholder:text-white/25"
                      value={appAuthor}
                      onChange={(event) => setAppAuthor(event.target.value)}
                      placeholder="Nom de l'auteur"
                    />
                  </div>
                )}
              </div>
            )}

            {!rootPath && (
              <div className="rounded-2xl border border-[#7B61FF]/30 bg-gradient-to-b from-[#2b2450]/35 to-[#1f2021] p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9d8bff]">Démarrer</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded px-2.5 py-1.5 text-xs font-medium bg-[#7B61FF] text-white hover:bg-[#6D4FD8]"
                    onClick={() => void openFolder()}
                    title="Ouvrir un dossier"
                  >
                    <i className="fa-solid fa-folder-open mr-1" />
                    Ouvrir un dossier
                  </button>
                  <button
                    className="rounded px-2.5 py-1.5 text-xs font-medium border border-white/15 text-white/85 hover:bg-white/10"
                    onClick={() => {
                      openCloneDialog()
                    }}
                    title="Cloner un dépôt Git"
                  >
                    <i className="fa-solid fa-code-branch mr-1" />
                    Cloner un dépôt
                  </button>
                </div>
              </div>
            )}

            {!rootPath && recentFolders.length > 0 && (
              <div className="rounded border border-white/10 bg-white/5 p-2 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Récents</p>
                <ul className="space-y-1">
                  {recentFolders.map((folderPath) => {
                    const isActive = rootPath === folderPath

                    return (
                      <li key={folderPath}>
                        <div className={`flex items-center gap-1 rounded ${isActive ? 'bg-[#7B61FF]/20' : 'hover:bg-white/8'}`}>
                          <button
                            className={`min-w-0 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-xs ${isActive ? 'text-[#7B61FF]' : 'text-white/70 hover:text-white'}`}
                            onClick={() => {
                              void openRecentFolder(folderPath)
                            }}
                            title={folderPath}
                          >
                            <span className="w-4 shrink-0 text-center text-sm leading-none">
                              {recentFolderIconByPath[folderPath] ? (
                                <span>{recentFolderIconByPath[folderPath]}</span>
                              ) : (
                                <i className="fa-regular fa-folder" />
                              )}
                            </span>
                            <span className="truncate">{getBaseName(folderPath)}</span>
                          </button>

                          <button
                            className="mr-1 size-5 shrink-0 rounded text-white/45 hover:text-red-300 hover:bg-red-500/10 flex items-center justify-center"
                            onClick={(event) => {
                              event.stopPropagation()
                              void removeRecentFolder(folderPath)
                            }}
                            title="Retirer des récents"
                          >
                            <i className="fa-solid fa-xmark text-[9px]" />
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Contenu section Explorer */}
            {filesSection === 'explorer' && tree ? (
              <ul className="space-y-0.5 flex-1 overflow-auto">
                <TreeItem
                  node={tree!}
                  selectedPath={selectedPath}
                  fileIconByPath={fileIconByPath}
                  folderIconByPath={folderIconByPath}
                  fileMetaByPath={fileMetaByPath}
                  onSelect={onSelectNode}
                  onContextMenu={openTreeContextMenu}
                  expandedDirectories={expandedDirectories}
                  onToggleDirectory={toggleDirectory}
                  draggedPath={draggedPath}
                  dropTargetPath={dropTargetPath}
                  onDragStart={(node) => setDraggedPath(node.path)}
                  onDragEnd={() => {
                    setDraggedPath(null)
                    setDropTargetPath(null)
                  }}
                  onDragOverDirectory={(node) => {
                    if (!draggedPath || draggedPath === node.path || isSameOrChildPath(draggedPath, node.path)) {
                      return
                    }

                    setDropTargetPath(node.path)
                  }}
                  onDragLeaveDirectory={(node) => {
                    if (dropTargetPath === node.path) {
                      setDropTargetPath(null)
                    }
                  }}
                  onDropOnDirectory={(node) => {
                    if (!draggedPath) {
                      return
                    }

                    void moveNode(draggedPath, node.path)
                  }}
                />
              </ul>
            ) : filesSection === 'mine' && rootPath ? (
              <div className="flex-1 overflow-auto">
                {!appAuthor.trim() ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Renseigne un auteur pour afficher Mes fichiers.
                  </p>
                ) : myFilePaths.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Aucun fichier trouvé pour l'auteur “{appAuthor}”.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {myFilePaths.map((filePath) => (
                      <li key={filePath}>
                        <button
                          className={`w-full truncate rounded px-2 py-1 text-left text-xs ${selectedPath === filePath ? 'bg-[#7B61FF]/20 text-[#9d8bff]' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                          onClick={() => {
                            void openFile(filePath)
                          }}
                          title={filePath}
                        >
                          {getBaseName(filePath).replace(/\.md$/i, '')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : filesSection === 'recent' && rootPath ? (
              <div className="flex-1 overflow-auto">
                {visibleRecentFilePaths.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-8">
                    Aucun fichier récent.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {visibleRecentFilePaths.map((filePath) => (
                      <li key={filePath}>
                        <button
                          className={`w-full truncate rounded px-2 py-1 text-left text-xs ${selectedPath === filePath ? 'bg-[#7B61FF]/20 text-[#9d8bff]' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                          onClick={() => {
                            setSelectedPath(filePath)
                            setSelectedType('file')
                            void openFile(filePath)
                          }}
                          title={filePath}
                        >
                          {getBaseName(filePath).replace(/\.md$/i, '')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : !rootPath && recentFolders.length > 0 ? null : (
              <p className="text-xs text-white/40 text-center py-8">
                {desktopApiAvailable ? 'Ouvre un dossier pour commencer' : 'API Electron indisponible'}
              </p>
            )}
          </nav>
        )}

        {/* Panel Recherche */}
        {activeSidebar === 'search' && (
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            <h2 className="text-sm font-semibold text-white/80">🔍 Recherche</h2>

            {/* Input */}
            <div className="relative">
              <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none" />
              <input
                autoFocus
                className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/25"
                placeholder="Rechercher… ou #tag"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  void runSearch(e.target.value)
                }}
              />
              {searchQuery && (
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
                  onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                >
                  <i className="fa-solid fa-xmark text-xs" />
                </button>
              )}
            </div>

            {/* Hint */}
            {!searchQuery && (
              <p className="text-xs text-white/25 leading-relaxed">
                Tape du texte pour chercher dans le contenu, ou <span className="text-[#9d8bff]">#tag</span> pour filtrer par étiquette.
              </p>
            )}

            {/* Loading */}
            {isSearching && (
              <p className="text-xs text-white/35 animate-pulse">Recherche en cours…</p>
            )}

            {/* No results */}
            {!isSearching && searchQuery && searchResults.length === 0 && (
              <p className="text-xs text-white/30">Aucun résultat pour « {searchQuery} »</p>
            )}

            {/* Results */}
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">{searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}</p>
                {searchResults.map((result) => (
                  <button
                    key={result.path}
                    className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors border border-transparent hover:border-white/8"
                    onClick={() => {
                      if (result.isArchived) {
                        window.alert('Ce fichier est archivé. Fais un clic droit puis “Récupérer depuis archive”.')
                        return
                      }

                      const node: TreeNode = { name: getBaseName(result.path), path: result.path, type: 'file' }
                      onSelectNode(node)
                      setActiveSidebar('files')
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      openTreeContextMenu(
                        {
                          name: getBaseName(result.path),
                          path: result.path,
                          type: 'file',
                          archivedOriginalPath: result.isArchived ? result.originalPath : undefined,
                        },
                        { x: event.clientX, y: event.clientY },
                      )
                    }}
                  >
                    <span className="text-sm font-medium text-white truncate">
                      {result.name}
                      {result.isArchived && <span className="ml-2 text-[10px] text-amber-300">ARCHIVE</span>}
                    </span>
                    <span className={`text-xs truncate ${result.matchType === 'tag' ? 'text-[#9d8bff]' : result.matchType === 'archive' ? 'text-amber-200/80' : 'text-white/40'}`}>
                      {result.excerpt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </nav>
        )}

        {/* Panel Git */}
        {activeSidebar === 'git' && (
          <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
            
            {/* Titre */}
            <div>
              <h2 className="text-sm font-semibold text-white/80">
                🌿 Git
              </h2>
            </div>

            {/* Contenu selon état du repo */}
            {!rootPath ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ouvre un dossier pour utiliser Git
              </p>
            ) : !gitState.isRepo ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ce dossier n'est pas un dépôt Git
              </p>
            ) : (
              <>
                {/* Branche et indicateurs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Branche</span>
                    <span className="text-xs font-semibold text-[#7B61FF]">{gitState.branch ?? '?'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Local</div>
                      <div className="text-xs font-bold text-white/80">✏️ {gitState.localChanges}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Sortants</div>
                      <div className="text-xs font-bold text-white/80">⬆️ {gitState.outgoing}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Entrants</div>
                      <div className="text-xs font-bold text-white/80">⬇️ {gitState.incoming}</div>
                    </div>
                  </div>
                </div>

                {/* Bouton Synchroniser */}
                <button
                  className="px-3 py-2 rounded text-xs font-bold bg-[#7B61FF] text-white hover:bg-[#6D4FD8] disabled:opacity-50 disabled:bg-[#7B61FF]/50 flex items-center justify-center gap-2"
                  onClick={() => void syncRepository()}
                  disabled={isGitBusy}
                  title="Synchroniser avec le dépôt distant"
                >
                  {isGitBusy ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-xs" />
                      Synchro...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-arrows-rotate text-xs" />
                      Synchroniser
                    </>
                  )}
                </button>

                {/* Boutons secondaires */}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openCommitDialog}
                    disabled={isGitBusy || gitState.localChanges === 0}
                    title="Créer un commit"
                  >
                    <i className="fa-solid fa-check mr-1" />
                    Commit
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void pullChanges()}
                    disabled={isGitBusy}
                    title="Tirer les changements"
                  >
                    <i className="fa-solid fa-arrow-down mr-1" />
                    Pull
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openMergeDialog}
                    disabled={isGitBusy}
                    title="Fusionner une branche"
                  >
                    <i className="fa-solid fa-code-merge mr-1" />
                    Merge
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void fetchChanges()}
                    disabled={isGitBusy}
                    title="Récupérer les changements distants"
                  >
                    <i className="fa-solid fa-download mr-1" />
                    Fetch
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void refreshGitState(false)}
                    disabled={isGitBusy}
                    title="Rafraîchir l'état Git"
                  >
                    <i className="fa-solid fa-arrow-rotate-right mr-1" />
                    Raf.
                  </button>
                </div>

                {/* Feedback de synchro */}
                {syncFeedback.message && (
                  <div
                    className={`rounded px-3 py-2 text-xs space-y-1 ${
                      syncFeedback.status === 'success'
                        ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-200'
                        : syncFeedback.status === 'warning'
                          ? 'bg-amber-900/30 border border-amber-700/50 text-amber-200'
                          : 'bg-red-900/30 border border-red-700/50 text-red-200'
                    }`}
                  >
                    <p className="font-medium text-[10px] leading-tight">{syncFeedback.message}</p>
                    {syncFeedback.at && (
                      <p className="text-[9px] opacity-60">
                        {new Date(syncFeedback.at!).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Erreur Git */}
                {gitState.error && (
                  <div className="rounded px-3 py-2 text-xs bg-red-900/30 border border-red-700/50 text-red-200">
                    <p className="font-medium text-[10px]">{gitState.error}</p>
                  </div>
                )}

                {gitAuthErrorActive && (
                  <div className="rounded px-3 py-2 text-xs border border-amber-700/50 bg-amber-900/20 text-amber-100">
                    <p className="font-medium text-[10px]">
                      Problème d’authentification détecté.
                    </p>
                    <p className="mt-1 text-[10px] text-amber-200/85">
                      Les identifiants Git ne sont pas saisis dans Holo : ils sont gérés par Git (SSH / Credential Manager du système).
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-400/15"
                        onClick={() => setShowGitAuthHelp(true)}
                      >
                        Aide connexion
                      </button>
                      <button
                        className="rounded border border-white/20 px-2 py-1 text-[10px] text-white/85 hover:bg-white/10"
                        onClick={() => setShowSettings(true)}
                      >
                        Ouvrir paramètres
                      </button>
                    </div>
                  </div>
                )}

                {/* Last fetch */}
                {gitState.lastFetchAt && (
                  <p className="text-[10px] text-white/40 text-center">
                    Fetch: {new Date(gitState.lastFetchAt).toLocaleTimeString()}
                  </p>
                )}

                {/* Conflicted files */}
                {conflictedFiles.length > 0 && (
                  <div className="rounded px-3 py-2 border border-amber-700/50 bg-amber-900/20 space-y-2">
                    <p className="text-[10px] font-bold text-amber-200">
                      ⚠️ {conflictedFiles.length} conflit(s)
                    </p>
                    <ul className="space-y-1">
                      {conflictedFiles.map((filePath) => (
                        <li key={filePath}>
                          <div className="rounded border border-amber-700/30 bg-white/5 p-1.5">
                            <button
                              className="mb-1 w-full truncate rounded px-1.5 py-1 text-left text-[9px] text-amber-100 hover:bg-amber-900/20"
                              onClick={() => void openConflictedFile(filePath)}
                              title={filePath}
                            >
                              {getBaseName(filePath)}
                            </button>
                            <div className="grid grid-cols-2 gap-1">
                              <button
                                className="rounded border border-emerald-600/40 bg-emerald-900/20 px-1.5 py-1 text-[9px] text-emerald-100 hover:bg-emerald-800/30 disabled:opacity-50"
                                onClick={() => void resolveConflictChoice(filePath, 'ours')}
                                disabled={isGitBusy}
                                title="Garder ta version locale"
                              >
                                Garder local
                              </button>
                              <button
                                className="rounded border border-sky-600/40 bg-sky-900/20 px-1.5 py-1 text-[9px] text-sky-100 hover:bg-sky-800/30 disabled:opacity-50"
                                onClick={() => void resolveConflictChoice(filePath, 'theirs')}
                                disabled={isGitBusy}
                                title="Prendre la version du serveur"
                              >
                                Prendre serveur
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </nav>
        )}

      </AppSidebar>

      {/* Zone d'édition principale */}
      <section className="flex min-w-0 min-h-0 flex-col bg-[#292929]" style={{ gridArea: 'content' }}>
          {/* Éditeur */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col">
            {activeTab ? (
              <>
                <EditorTopBar
                  isCompactLayout={isCompactLayout}
                  activeTabIsDirty={activeTab.isDirty}
                  readOnlyMode={readOnlyMode}
                  effectiveEditorMode={effectiveEditorMode}
                  saveStatus={saveStatus}
                  copyLinkStatus={copyLinkStatus}
                  tocItems={tocItems}
                  showCompactToc={showCompactToc}
                  compactTocRef={compactTocRef}
                  onToggleCompactToc={onToggleCompactToc}
                  onCompactTocItemClick={onCompactTocItemClick}
                  onSwitchRaw={onEditorSwitchRaw}
                  onSwitchWysiwyg={onEditorSwitchWysiwyg}
                  onExportPdf={onEditorExportPdf}
                  onCopyLink={() => { void copyHoloLink(activeTab.path) }}
                  onSave={onEditorSave}
                />

                <EditorCanvas
                  isCompactLayout={isCompactLayout}
                  effectiveEditorMode={effectiveEditorMode}
                  isEditorReadOnly={isEditorReadOnly}
                  activeTabBody={activeTabBody}
                  rawEditorRef={rawEditorRef}
                  wysiwygEditorRef={wysiwygEditorRef}
                  onRawChange={updateActiveTabBody}
                  onRawKeyDown={onRawKeyDown}
                  onRawDrop={onRawDrop}
                  onEditorDragEnter={onEditorDragEnter}
                  onEditorDragOver={onEditorDragOver}
                  onEditorDragLeave={onEditorDragLeave}
                  onWysiwygInput={onWysiwygInput}
                  onWysiwygKeyDown={onWysiwygKeyDown}
                  onWysiwygDrop={onWysiwygDrop}
                  onWysiwygDragStart={onWysiwygDragStart}
                  onWysiwygDragEnd={onWysiwygDragEnd}
                  onWysiwygDragOver={onWysiwygDragOver}
                  openEditorLink={openEditorLink}
                  updateActiveTabBody={updateActiveTabBody}
                  syncWysiwygFromMarkdown={syncWysiwygFromMarkdown}
                  markdownToHtml={markdownToHtml}
                  refreshTableSummaries={refreshTableSummaries}
                  setColumnTypePopup={setColumnTypePopup}
                  isImageDragOverEditor={isImageDragOverEditor}
                  remoteEditBlock={remoteEditBlock}
                  onPullNow={onPullNow}
                  codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
                  setHoveredCodeBlock={setHoveredCodeBlock}
                  documentHeaderProps={{
                    isCompactLayout,
                    editableHeader,
                    isEditorReadOnly,
                    showEmojiPicker,
                    setShowEmojiPicker,
                    titleInputRef,
                    activePathStats,
                    formatReadonlyDate,
                    updateEditableHeader,
                    updateTags,
                    showTagInput,
                    setShowTagInput,
                    tagInput,
                    setTagInput,
                  }}
                />
                
                <EditorOverlays
                  editorMode={editorMode}
                  selectionPopup={selectionPopup}
                  runWysiwygCommand={runWysiwygCommand}
                  onOpenLinkFromSelection={onOpenLinkFromSelection}
                  hasAiProviderConfigured={hasAiProviderConfigured}
                  onOpenAiTransformFromSelection={onOpenAiTransformFromSelection}
                  tablePopup={tablePopup}
                  columnTypePopup={columnTypePopup}
                  insertTableRow={insertTableRow}
                  insertTableColumn={insertTableColumn}
                  sortTableByCurrentColumn={sortTableByCurrentColumn}
                  openCurrentColumnTypePicker={openCurrentColumnTypePicker}
                  deleteTableRow={deleteTableRow}
                  deleteTableColumn={deleteTableColumn}
                  setCurrentColumnType={setCurrentColumnType}
                  onCloseColumnTypePopup={onCloseColumnTypePopup}
                  hoveredCodeBlock={hoveredCodeBlock}
                  codeBlockPopup={codeBlockPopup}
                  codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
                  setHoveredCodeBlock={setHoveredCodeBlock}
                  setCodeBlockPopup={setCodeBlockPopup}
                  formatCodeBlock={formatCodeBlock}
                  onApplyCodeLanguage={onApplyCodeLanguage}
                  slashMenu={slashMenu}
                  slashMenuListRef={slashMenuListRef}
                  slashMenuIndex={slashMenuIndex}
                  slashCommands={SLASH_COMMANDS}
                  matchesSlashQuery={matchesSlashQuery}
                  executeSlashCommand={executeSlashCommand}
                />

              </>
            ) : <EditorEmptyState />}
            </div>{/* end flex-1 min-w-0 content area */}

            {/* Table des matières — colonne droite séparée */}
            <EditorRightToc
              editorMode={editorMode}
              tocItems={tocItems}
              onTocItemClick={onTocItemClick}
            />
          </div>{/* end flex-1 min-h-0 flex row */}
      </section>

      <AiDialogModal
        aiDialog={aiDialog}
        aiTextareaRef={aiTextareaRef}
        onSetAiDialog={setAiDialog}
        onSubmitAiDialog={() => { void submitAiDialog() }}
        onClose={() => {
          setAiDialog(null)
          aiSavedRangeRef.current = null
        }}
      />

      {contextMenu && (
        <div
          className="fixed z-20 min-w-[180px] rounded-lg border border-white/10 bg-[#1b1c1d] p-1.5 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          {(() => {
            const isArchivedContext = Boolean(contextMenu.node.archivedOriginalPath)

            return (
              <>
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
            {contextMenu.node.type === 'directory' ? 'Dossier' : isArchivedContext ? 'Fichier archivé' : 'Fichier'} · {contextMenu.node.name}
          </div>

          {!isArchivedContext && (
            <>
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => openCreateFileDialog(contextMenu.node.path, contextMenu.node.type))}
              >
                <i className="fa-solid fa-file-plus w-4 text-center" />
                Nouveau fichier
              </button>

              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => openCreateDirectoryDialog(contextMenu.node.path, contextMenu.node.type))}
              >
                <i className="fa-solid fa-folder-plus w-4 text-center" />
                Nouveau dossier
              </button>
            </>
          )}

          {!isArchivedContext && contextMenu.node.type === 'directory' && (
            <>
              <div className="my-1 h-px bg-white/8" />
              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => setShowFolderIconPicker(contextMenu.node.path))}
              >
                <i className="fa-regular fa-face-smile w-4 text-center" />
                Changer l'icône
              </button>
            </>
          )}

          {contextMenu.node.path !== rootPath && (
            <>
              <div className="my-1 h-px bg-white/8" />

              {!isArchivedContext && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => openRenameDialog(contextMenu.node.path))}
                >
                  <i className="fa-solid fa-pen w-4 text-center" />
                  Renommer
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <div className="my-1 h-px bg-white/8" />
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void toggleTemplateStatus(
                      contextMenu.node.path,
                      !fileMetaByPath[contextMenu.node.path]?.isTemplate,
                    )
                  })}
                >
                  <i className="fa-solid fa-layer-group w-4 text-center" />
                  {fileMetaByPath[contextMenu.node.path]?.isTemplate ? 'Retirer du modèle' : 'Définir comme modèle'}
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void copyHoloLink(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-link w-4 text-center" />
                  Copier le lien
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void copyPathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-copy w-4 text-center" />
                  Dupliquer
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                  onClick={() => runContextAction(() => {
                    void openFileInNewWindow(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-up-right-from-square w-4 text-center" />
                  Ouvrir dans une nouvelle fenêtre
                </button>
              )}

              {!isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
                  onClick={() => runContextAction(() => {
                    void archivePathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-box-archive w-4 text-center" />
                  Archiver
                </button>
              )}

              {isArchivedContext && contextMenu.node.type === 'file' && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100"
                  onClick={() => runContextAction(() => {
                    void restoreArchivedPathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-box-open w-4 text-center" />
                  Récupérer depuis archive
                </button>
              )}

              {!isArchivedContext && (
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  onClick={() => runContextAction(() => {
                    void deletePathTarget(contextMenu.node.path)
                  })}
                >
                  <i className="fa-solid fa-trash w-4 text-center" />
                  Supprimer
                </button>
              )}
            </>
          )}
              </>
            )
          })()}
        </div>
      )}

      {showFolderIconPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            {/* En-tête */}
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-regular fa-face-smile text-[#7B61FF]" />
                Changer l'icône du dossier
              </h2>
              <button
                className="text-white/40 hover:text-white transition-colors"
                onClick={() => setShowFolderIconPicker(null)}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-white/50">Choisir une icône</span>
                {folderIconByPath[showFolderIconPicker] && (
                  <button
                    className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/8 hover:text-white/70"
                    onClick={() => {
                      void saveFolderIconConfig(showFolderIconPicker, '')
                      setShowFolderIconPicker(null)
                    }}
                  >
                    Supprimer
                  </button>
                )}
              </div>
              <div className="rounded-lg border border-white/10 bg-[#141515] p-2">
                <EmojiPicker
                  width={380}
                  height={380}
                  theme={Theme.DARK}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => {
                    void saveFolderIconConfig(showFolderIconPicker, emojiData.emoji)
                    setShowFolderIconPicker(null)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}


      <SettingsModal
        showSettings={showSettings}
        onClose={() => setShowSettings(false)}
        appAuthor={appAuthor}
        onSetAppAuthor={setAppAuthor}
        gitEmail={gitEmail}
        onSetGitEmail={setGitEmail}
        rootPath={rootPath}
        repoImageStorageMode={repoImageStorageMode}
        onSetRepoImageStorageMode={setRepoImageStorageMode}
        azureBlobContainerUrl={azureBlobContainerUrl}
        onSetAzureBlobContainerUrl={setAzureBlobContainerUrl}
        azureBlobSasToken={azureBlobSasToken}
        onSetAzureBlobSasToken={setAzureBlobSasToken}
        s3Region={s3Region}
        onSetS3Region={setS3Region}
        s3Bucket={s3Bucket}
        onSetS3Bucket={setS3Bucket}
        s3AccessKeyId={s3AccessKeyId}
        onSetS3AccessKeyId={setS3AccessKeyId}
        s3SecretAccessKey={s3SecretAccessKey}
        onSetS3SecretAccessKey={setS3SecretAccessKey}
        s3Endpoint={s3Endpoint}
        onSetS3Endpoint={setS3Endpoint}
        s3PublicBaseUrl={s3PublicBaseUrl}
        onSetS3PublicBaseUrl={setS3PublicBaseUrl}
        dropboxAccessToken={dropboxAccessToken}
        onSetDropboxAccessToken={setDropboxAccessToken}
        dropboxFolderPath={dropboxFolderPath}
        onSetDropboxFolderPath={setDropboxFolderPath}
        gdriveAccessToken={gdriveAccessToken}
        onSetGdriveAccessToken={setGdriveAccessToken}
        gdriveFolderId={gdriveFolderId}
        onSetGdriveFolderId={setGdriveFolderId}
        repoImageModeReady={repoImageModeReady}
        onSaveRepoImageConfig={() => { void saveRepoImageConfig() }}
        aiProvider={aiProvider}
        onSetAiProvider={setAiProvider}
        geminiApiKey={geminiApiKey}
        onSetGeminiApiKey={setGeminiApiKey}
        openaiApiKey={openaiApiKey}
        onSetOpenaiApiKey={setOpenaiApiKey}
        openaiPrompt={openaiPrompt}
        onSetOpenaiPrompt={setOpenaiPrompt}
        appVersion={appVersion}
        currentVersionChangelog={currentVersionChangelog}
        seenChangelogVersion={seenChangelogVersion}
        changelogEntries={CHANGELOG_ENTRIES}
        onOpenChangelog={(version) => {
          setSelectedChangelogVersion(version)
          setShowChangelogModal(true)
        }}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        onCheckForUpdates={() => { void window.holo?.checkForUpdates() }}
        onInstallUpdate={() => { void window.holo?.installUpdate() }}
        shareGatewayBaseUrl={shareGatewayBaseUrl}
        onSetShareGatewayBaseUrl={setShareGatewayBaseUrl}
        showAuthorModal={showAuthorModal}
        authorModalMode={authorModalMode}
        authorModalValue={authorModalValue}
        onSetAuthorModalValue={setAuthorModalValue}
        onCloseAuthorModal={() => setShowAuthorModal(false)}
        onSubmitAuthorProfile={submitAuthorProfile}
      />
      <AppModals
        showChangelogModal={showChangelogModal}
        selectedChangelogEntry={selectedChangelogEntry ?? null}
        appVersion={appVersion}
        onCloseChangelog={() => setShowChangelogModal(false)}
        onMarkChangelogSeen={markCurrentVersionChangelogAsSeen}
        showUnsavedChangesModal={showUnsavedChangesModal}
        onCancelUnsaved={cancelDiscardAndSwitchFile}
        onConfirmUnsaved={() => { void confirmDiscardAndSwitchFile() }}
        confirmDialog={confirmDialog}
        onResolveConfirm={resolveConfirmationDialog}
        linkDialog={linkDialog}
        linkPageSuggestions={linkPageSuggestions}
        onSetLinkDialog={setLinkDialog}
        onClearLinkSavedRange={() => { linkSavedRangeRef.current = null }}
        onInsertLink={insertLinkIntoEditor}
        onLinkSuggestionClick={(filePath) => {
          if (!linkDialog) return
          const relativePath = getRelativeLinkPath(activeTabPath, filePath, rootPath)
          const label = getBaseName(filePath).replace(/\.md$/i, '')
          setLinkDialog({
            ...linkDialog,
            url: relativePath,
            text: linkDialog.text.trim() ? linkDialog.text : label,
            pageQuery: getBaseName(filePath),
          })
        }}
        activeTabPath={activeTabPath}
        rootPath={rootPath}
        getRelativeLinkPath={getRelativeLinkPath}
        getBaseName={getBaseName}
        showGitAuthHelp={showGitAuthHelp}
        onCloseGitAuthHelp={() => setShowGitAuthHelp(false)}
        onGitAuthOpenSettings={() => { setShowGitAuthHelp(false); setShowSettings(true) }}
        onGitAuthRetryFetch={() => { setShowGitAuthHelp(false); void fetchChanges() }}
        nameDialog={nameDialog}
        templateOptions={templateOptions}
        onSetNameDialog={setNameDialog}
        onSubmitNameDialog={() => { void submitNameDialog() }}
        cloneDialog={cloneDialog}
        onSetCloneDialog={setCloneDialog}
        onSubmitCloneDialog={() => { void submitCloneDialog() }}
        onPickCloneDirectory={() => { void pickCloneDirectory() }}
        gitDialog={gitDialog}
        onSetGitDialog={setGitDialog}
        onSubmitGitDialog={() => { void submitGitDialog() }}
        updateAvailable={updateAvailable}
        updateReady={updateReady}
        updateProgress={updateProgress}
        onDismissUpdate={() => setUpdateAvailable(false)}
        onInstallUpdate={() => { void window.holo?.installUpdate() }}
      />
    </main>
  )
}

export default App
