import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

type NodeType = 'file' | 'directory'

type TreeNode = {
  name: string
  path: string
  type: NodeType
  children?: TreeNode[]
}

type OpenFolderResult = {
  rootPath: string
  tree: TreeNode
} | null

type NameDialog =
  | {
    mode: 'create-file' | 'create-directory'
    value: string
    targetDirectoryPath: string
  }
  | {
    mode: 'rename'
    value: string
    targetPath: string
  }

type GitDialog =
  | {
    mode: 'commit'
    value: string
  }
  | {
    mode: 'merge'
    value: string
  }

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

type EditableMarkdownHeader = {
  title: string
  description: string
  author: string
}

type FilePathStats = {
  modifiedAt: string
  createdAt: string
}

type TocItem = {
  level: number
  text: string
  headingIndex: number
}

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
    return 'Échec de connexion GitHub. Vérifie ton compte (SSH/identifiants) puis réessaie Synchroniser.'
  }

  if (/could not resolve host|name or service not known|network is unreachable|timed out/.test(message)) {
    return 'Impossible de joindre GitHub (réseau/DNS). Vérifie la connexion Internet puis réessaie.'
  }

  return rawMessage
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

function splitMarkdownFrontMatter(markdown: string) {
  const lines = markdown.split(/\r?\n/)

  if (lines[0] !== '---') {
    return {
      hasFrontMatter: false,
      frontMatterLines: [] as string[],
      body: markdown,
    }
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === '---')

  if (endIndex <= 0) {
    return {
      hasFrontMatter: false,
      frontMatterLines: [] as string[],
      body: markdown,
    }
  }

  return {
    hasFrontMatter: true,
    frontMatterLines: lines.slice(1, endIndex),
    body: lines.slice(endIndex + 1).join('\n'),
  }
}

function escapeFrontMatterValue(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ')
  return `"${normalized.replace(/"/g, '\\"')}"`
}

function readFrontMatterValue(line: string): string {
  const [, raw = ''] = line.split(/:(.*)/)
  const trimmed = raw.trim()

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed
}

function getEditableMarkdownHeader(markdown: string): EditableMarkdownHeader {
  const { frontMatterLines } = splitMarkdownFrontMatter(markdown)
  const header: EditableMarkdownHeader = {
    title: '',
    description: '',
    author: '',
  }

  for (const line of frontMatterLines) {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:/)

    if (!match) {
      continue
    }

    const key = match[1].toLowerCase()

    if (key === 'title' || key === 'description' || key === 'author') {
      header[key] = readFrontMatterValue(line)
    }
  }

  return header
}

function updateMarkdownHeaderField(
  markdown: string,
  field: keyof EditableMarkdownHeader,
  nextValue: string,
): string {
  const { frontMatterLines, body } = splitMarkdownFrontMatter(markdown)
  const nextLines = [...frontMatterLines]
  const key = field
  const keyMatcher = new RegExp(`^${key}\\s*:`, 'i')
  const existingIndexes = nextLines
    .map((line, index) => (keyMatcher.test(line) ? index : -1))
    .filter((index) => index >= 0)

  for (let index = existingIndexes.length - 1; index >= 1; index -= 1) {
    nextLines.splice(existingIndexes[index], 1)
  }

  const firstExistingIndex = existingIndexes.length > 0 ? existingIndexes[0] : -1
  const cleanedValue = nextValue;

  if (!cleanedValue) {
    if (firstExistingIndex >= 0) {
      nextLines.splice(firstExistingIndex, 1)
    }
  } else {
    const nextLine = `${key}: ${escapeFrontMatterValue(cleanedValue)}`

    if (firstExistingIndex >= 0) {
      nextLines[firstExistingIndex] = nextLine
    } else {
      nextLines.push(nextLine)
    }
  }

  if (nextLines.length === 0) {
    return body
  }

  return ['---', ...nextLines, '---', body].join('\n')
}

function updateMarkdownBody(markdown: string, nextBody: string): string {
  const { frontMatterLines } = splitMarkdownFrontMatter(markdown)

  if (frontMatterLines.length === 0) {
    return nextBody
  }

  return ['---', ...frontMatterLines, '---', nextBody].join('\n')
}

function TreeItem({
  node,
  selectedPath,
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
          onSelect(node)

          if (isDirectory) {
            onToggleDirectory(node.path)
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
            <i className="fa-solid fa-circle text-[6px]" />
          )}
        </span>
        <span className="w-5 text-center text-sm text-white/70">
          {node.type === 'directory' ? (
            <i className={`fa-regular ${isExpanded ? 'fa-folder-open' : 'fa-folder'}`} />
          ) : (
            <i className="fa-regular fa-file-lines" />
          )}
        </span>
        <span className="truncate text-xs">{node.type === 'file' ? node.name.replace(/\.md$/i, '') : node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
        <ul className="mt-0.5">
          {node.children.map((childNode) => (
            <TreeItem
              key={childNode.path}
              node={childNode}
              selectedPath={selectedPath}
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

type SlashCommand = {
  id: string
  icon: string
  label: string
  hint: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', icon: 'fa-solid fa-1', label: 'Titre 1', hint: 'Grand titre' },
  { id: 'h2', icon: 'fa-solid fa-2', label: 'Titre 2', hint: 'Titre moyen' },
  { id: 'h3', icon: 'fa-solid fa-3', label: 'Titre 3', hint: 'Petit titre' },
  { id: 'bullet', icon: 'fa-solid fa-list-ul', label: 'Liste à puces', hint: '—' },
  { id: 'ordered', icon: 'fa-solid fa-list-ol', label: 'Liste numérotée', hint: '1. 2. 3.' },
  { id: 'quote', icon: 'fa-solid fa-quote-left', label: 'Citation', hint: 'Bloc citation' },
  { id: 'code', icon: 'fa-solid fa-code', label: 'Bloc code', hint: 'Monospace' },
  { id: 'table', icon: 'fa-solid fa-table', label: 'Tableau', hint: 'Grille' },
  { id: 'todo', icon: 'fa-solid fa-square-check', label: 'Tâches', hint: 'Checklist' },
]

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [pathStatsByPath, setPathStatsByPath] = useState<Record<string, FilePathStats>>({})
  const [recentFolders, setRecentFolders] = useState<string[]>([])
  const [draggedPath, setDraggedPath] = useState<string | null>(null)
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [gitState, setGitState] = useState<GitState>(DEFAULT_GIT_STATE)
  const [gitDialog, setGitDialog] = useState<GitDialog | null>(null)
  const [isGitBusy, setIsGitBusy] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>(DEFAULT_SYNC_FEEDBACK)
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git'>('files')
  const [editorMode, setEditorMode] = useState<'raw' | 'wysiwyg'>('wysiwyg')
  const [isImageDragOverEditor, setIsImageDragOverEditor] = useState(false)
  const imageDragDepthRef = useRef(0)
  const wysiwygEditorRef = useRef<HTMLDivElement | null>(null)
  const isSyncingWysiwygRef = useRef(false)
  const lastWysiwygSyncedTabRef = useRef<string | null>(null)
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number } | null>(null)
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const turndownService = useMemo(() => {
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    })
    service.use(gfm)
    
    
    // Convert images back to markdown, restoring relative paths
    service.addRule('localImage', {
      filter: 'img',
      replacement: (_content, node) => {
        const img = node as HTMLImageElement
        let src = img.getAttribute('src') ?? ''
        const dataSrc = img.getAttribute('data-src')
        const alt = img.getAttribute('alt') ?? ''
        
        // If data-src exists, use that for relative path
        if (dataSrc) {
          src = dataSrc
        }
        // Otherwise keep the src as is (data URLs, external URLs)
        
        return `![${alt}](${src})`
      },
    })
    
    // Table rule to use GFM markdown format
    service.addRule('table', {
      filter: 'table',
      replacement: () => {
        // The gfm plugin should handle this, but ensure proper formatting
        return '\n\n' // This will be replaced by gfm's table handling
      },
    })
    
    return service
  }, [])
  const desktopApiAvailable = typeof window.holo !== 'undefined'

  // Récupérer l'onglet actif
  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.path === activeTabPath),
    [activeTabPath, openTabs],
  )

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
        .replace(/[\*_`~]/g, '')
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
    const holo = getHoloApi()

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

  const applyOpenedFolder = useCallback((result: OpenFolderResult) => {
    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
    setSelectedPath(result.rootPath)
    setSelectedType('directory')
    setExpandedDirectories(new Set([result.rootPath]))
    setOpenTabs([])
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)
  }, [])

  const refreshRecentFolders = useCallback(async () => {
    if (!window.holo) {
      setRecentFolders([])
      return
    }

    const recent = await window.holo.getRecentFolders()
    setRecentFolders(Array.isArray(recent) ? recent : [])
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

    const nextGitState = await holo.gitGetState(true)
    setGitState(normalizeGitState(nextGitState))
  }, [applyOpenedFolder, getHoloApi, refreshRecentFolders])

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

        const nextGitState = await holo.gitGetState(true)
        setGitState(normalizeGitState(nextGitState))
      } catch (error) {
        window.alert((error as Error).message)
        await refreshRecentFolders()
      }
    },
    [applyOpenedFolder, getHoloApi, refreshRecentFolders],
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
    if (!rootPath || !gitState.isRepo) {
      return
    }

    const interval = window.setInterval(() => {
      void refreshGitState(true)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [gitState.isRepo, refreshGitState, rootPath])

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
        // Vérifier si le fichier est déjà ouvert dans les tabs actuels
        const existingTab = openTabs.find((tab) => tab.path === filePath)
        if (existingTab) {
          setActiveTabPath(filePath)
          return
        }

        // Charger le fichier
        const nextContent = await holo.readFile(filePath)
        const stats = await holo.getPathStats(filePath).catch(() => null)
        const newTab: OpenTab = {
          path: filePath,
          name: getBaseName(filePath),
          content: nextContent,
          isDirty: false,
        }
        setOpenTabs((prev) => [...prev, newTab])

        if (stats) {
          setPathStatsByPath((prev) => ({
            ...prev,
            [filePath]: stats,
          }))
        }

        setActiveTabPath(filePath)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, openTabs],
  )

  const onSelectNode = useCallback(
    async (node: TreeNode) => {
      setSelectedPath(node.path)
      setSelectedType(node.type)

      if (node.type === 'file') {
        const isDirty = activeTab?.isDirty ?? false
        if (isDirty && activeTabPath && activeTabPath !== node.path) {
          const continueWithoutSave = window.confirm(
            'Le fichier courant a des modifications non sauvegardées. Continuer sans sauvegarder ?'
          )

          if (!continueWithoutSave) {
            return
          }
        }

        await openFile(node.path)
      }
    },
    [activeTab, activeTabPath, openFile],
  )

  const saveCurrentFile = useCallback(async () => {
    if (!activeTab) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.writeFile(activeTab.path, activeTab.content)
    const stats = await holo.getPathStats(activeTab.path).catch(() => null)
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTab.path ? { ...tab, isDirty: false } : tab,
      ),
    )

    if (stats) {
      setPathStatsByPath((prev) => ({
        ...prev,
        [activeTab.path]: stats,
      }))
    }

    await refreshTree()
    await refreshGitState(false)

    // Auto-commit if in a Git repository
    if (gitState.isRepo) {
      try {
        const displayPath = activeTab.path
          .replace(/^\//, '')
          .replace(/\.md$/, '')
        const commitMessage = `update/add ${displayPath}`
        await holo.gitCommit(commitMessage)
      } catch (error) {
        // Silent fail - file was saved successfully, commit is just a bonus
        console.error('Auto-commit failed:', error)
      }
    }
  }, [activeTab, getHoloApi, refreshGitState, refreshTree, gitState.isRepo])

  const updateActiveTabContent = useCallback(
    (nextContent: string) => {
      if (!activeTabPath) {
        return
      }

      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.path === activeTabPath
            ? { ...tab, content: nextContent, isDirty: true }
            : tab,
        ),
      )
    },
    [activeTabPath],
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

  const markdownToHtml = useCallback((markdown: string) => {
    const parsed = marked.parse(markdown)
    const html = typeof parsed === 'string' ? parsed : ''

    const doc = new DOMParser().parseFromString(html, 'text/html')

    doc.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.getAttribute('src')?.trim()
      if (!rawSrc) return

      // Skip external URLs and data URLs
      if (/^(https?:|data:)/i.test(rawSrc)) {
        return
      }

      // Store relative path and use placeholder
      let imagePath = rawSrc.replace(/^\/+/, '')
      if (!imagePath.startsWith('images/')) {
        imagePath = 'images/' + imagePath
      }
      
      img.setAttribute('data-src', imagePath)
      img.setAttribute('src', 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E')
    })

    doc.querySelectorAll('li > input[type="checkbox"]').forEach((checkbox) => {
      const input = checkbox as HTMLInputElement
      input.removeAttribute('disabled')
      input.classList.add('task-checkbox')

      const parentLi = input.closest('li')
      if (parentLi) {
        parentLi.classList.add('task-item')
        const parentUl = parentLi.closest('ul')
        if (parentUl) {
          parentUl.classList.add('task-list')
        }
      }
    })

    return doc.body.innerHTML
  }, [])

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
    if (editorMode !== 'wysiwyg' || !activeTabPath) {
      lastWysiwygSyncedTabRef.current = null
      return
    }

    const tab = openTabs.find((item) => item.path === activeTabPath)

    if (!tab) {
      return
    }

    if (lastWysiwygSyncedTabRef.current !== activeTabPath) {
      syncWysiwygFromMarkdown(splitMarkdownFrontMatter(tab.content).body)
      lastWysiwygSyncedTabRef.current = activeTabPath
    }
  }, [activeTabPath, editorMode, openTabs, syncWysiwygFromMarkdown])

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

  // Helpers for getting text context in the contentEditable editor
  const getBlockTextBeforeCursor = useCallback((): { text: string; block: Element | null } => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return { text: '', block: null }
    const editor = wysiwygEditorRef.current
    if (!editor) return { text: '', block: null }
    let node: Node | null = sel.anchorNode
    while (node && node !== editor) {
      const tag = (node as Element).tagName
      if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'].includes(tag ?? '')) break
      node = node.parentNode
    }
    if (!node || node === editor) return { text: '', block: null }
    const blockRange = document.createRange()
    blockRange.setStart(node, 0)
    blockRange.setEnd(sel.anchorNode!, sel.anchorOffset)
    return { text: blockRange.toString(), block: node as Element }
  }, [])

  const deleteCurrentBlockContents = useCallback(() => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const editor = wysiwygEditorRef.current
    if (!editor) return
    let node: Node | null = sel.anchorNode
    while (node && node !== editor) {
      const tag = (node as Element).tagName
      if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'].includes(tag ?? '')) break
      node = node.parentNode
    }
    if (!node || node === editor) return
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(sel.anchorNode!, sel.anchorOffset)
    range.deleteContents()
  }, [])

  const executeSlashCommand = useCallback((cmd: SlashCommand) => {
    const editor = wysiwygEditorRef.current
    if (!editor) return
    
    // Delete the slash + query text
    deleteCurrentBlockContents()
    
    switch (cmd.id) {
      case 'h1': document.execCommand('formatBlock', false, '<h1>'); break
      case 'h2': document.execCommand('formatBlock', false, '<h2>'); break
      case 'h3': document.execCommand('formatBlock', false, '<h3>'); break
      case 'bullet': document.execCommand('insertUnorderedList'); break
      case 'ordered': document.execCommand('insertOrderedList'); break
      case 'quote': document.execCommand('formatBlock', false, '<blockquote>'); break
      case 'code': document.execCommand('insertHTML', false, '<pre><code>\u200B</code></pre><p><br></p>'); break
      case 'table': {
        const html = '<table><thead><tr><th>Col A</th><th>Col B</th></tr></thead><tbody><tr><td>\u200B</td><td></td></tr></tbody></table><p><br></p>'
        document.execCommand('insertHTML', false, html)
        break
      }
      case 'todo': {
        const html = '<ul class="task-list"><li class="task-item"><input class="task-checkbox" type="checkbox"> Tâche</li></ul><p><br></p>'
        document.execCommand('insertHTML', false, html)
        break
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
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent],
  )

  const onEditorDragEnter = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      imageDragDepthRef.current += 1
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent],
  )

  const onEditorDragLeave = useCallback(() => {
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1)
    if (imageDragDepthRef.current === 0) {
      setIsImageDragOverEditor(false)
    }
  }, [])

  const handleImageFiles = useCallback(
    async (
      files: File[],
      insertFn: (mdImage: string, relativePath: string, previewDataUrl: string) => void,
    ) => {
      const holo = getHoloApi()
      if (!holo) return

      for (const file of files) {
        const reader = new FileReader()
        reader.onload = async (e) => {
          const dataUrl = e.target?.result as string
          if (typeof dataUrl !== 'string') return
          const base64 = dataUrl.split(',')[1]
          if (!base64) return
          try {
            const result = await holo.saveImage(file.name, base64)
            insertFn(`![${file.name}](${result.relativePath})`, result.relativePath, dataUrl)
          } catch (err) {
            console.error('saveImage error', err)
          }
        }
        reader.readAsDataURL(file)
      }
    },
    [getHoloApi],
  )

  const onWysiwygDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      imageDragDepthRef.current = 0
      setIsImageDragOverEditor(false)
      const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile)
      if (imageFiles.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      const editor = wysiwygEditorRef.current
      if (!editor) return
      void handleImageFiles(imageFiles, (_md, relativePath, previewDataUrl) => {
        const safePath = relativePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        const imgHtml = `<img data-src="${safePath}" src="${previewDataUrl}" alt="" style="max-width:100%;border-radius:4px">`
        document.execCommand('insertHTML', false, imgHtml)
        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
      })
    },
    [handleImageFiles, isImageFile, turndownService, updateActiveTabBody],
  )

  const onRawDrop = useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
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
    [handleImageFiles, isImageFile, updateActiveTabBody],
  )

  const onWysiwygInput = useCallback(() => {
    const editor = wysiwygEditorRef.current

    if (!editor || isSyncingWysiwygRef.current) {
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
  }, [getBlockTextBeforeCursor, slashMenu, turndownService, updateActiveTabBody])
  const onWysiwygKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      // Ne traiter que les événements venant du contentEditable WYSIWYG lui-même
      // Ignorer ceux qui viennent des inputs ou autres éléments
      if (event.currentTarget !== editor || !editor.contains(event.target as Node)) {
        return
      }

      // ── Slash menu navigation ──────────────────────────────────────────
      if (slashMenu) {
        const filtered = SLASH_COMMANDS.filter(
          (c) => !slashMenu.query || c.label.toLowerCase().includes(slashMenu.query),
        )
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
            // Position menu below the cursor, accounting for viewport
            let x = rect.left
            let y = rect.top + rect.height + 6
            // Ensure menu doesn't go off-screen horizontally
            setSlashMenu({ x, y, query: '' })
            setSlashMenuIndex(0)
          }
        }
        return
      }

      if (event.key === 'Enter') {
        const sel = window.getSelection()
        const anchor = sel?.anchorNode ?? null
        const currentLi = anchor instanceof Element ? anchor.closest('li') : anchor?.parentElement?.closest('li')
        const currentCheckbox = currentLi?.querySelector('input[type="checkbox"]')

        if (currentLi && currentCheckbox) {
          event.preventDefault()

          const nextLi = document.createElement('li')
          nextLi.className = 'task-item'
          nextLi.innerHTML = '<input class="task-checkbox" type="checkbox"> '

          if (currentLi.nextSibling) {
            currentLi.parentNode?.insertBefore(nextLi, currentLi.nextSibling)
          } else {
            currentLi.parentNode?.appendChild(nextLi)
          }

          const range = document.createRange()
          range.selectNodeContents(nextLi)
          range.collapse(false)
          sel?.removeAllRanges()
          sel?.addRange(range)

          const markdown = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(markdown)
          return
        }
      }

      // ── Markdown space shortcuts ───────────────────────────────────────
      if (event.key === ' ') {
        const { text, block } = getBlockTextBeforeCursor()
        if (!block) return

        const patterns: Array<[RegExp, () => void]> = [
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
    [deleteCurrentBlockContents, executeSlashCommand, getBlockTextBeforeCursor, slashMenu, slashMenuIndex, turndownService, updateActiveTabBody],
  )

  // Selection change → show/hide floating popup
  useEffect(() => {
    const onSelectionChange = () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !editor.contains(sel.anchorNode)) {
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
    (
      command:
        | 'bold'
        | 'italic'
        | 'underline'
        | 'strikeThrough'
        | 'insertUnorderedList'
        | 'insertOrderedList'
        | 'formatBlock'
        | 'createLink'
        | 'insertHTML',
      value?: string,
    ) => {
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

  const closeTab = useCallback(
    (tabPath: string) => {
      const tabIndex = openTabs.findIndex((tab) => tab.path === tabPath)

      if (tabIndex < 0) {
        return
      }

      const nextActiveTab =
        openTabs[tabIndex + 1]
        ?? openTabs[tabIndex - 1]
        ?? null

      setOpenTabs((prev) => prev.filter((tab) => tab.path !== tabPath))

      if (activeTabPath === tabPath) {
        setActiveTabPath(nextActiveTab?.path ?? null)
      }
    },
    [activeTabPath, openTabs],
  )

  const closeTabsForPath = useCallback(
    (targetPath: string) => {
      const isActiveTabRemoved = activeTabPath ? isSameOrChildPath(targetPath, activeTabPath) : false

      if (isActiveTabRemoved && activeTabPath) {
        const activeIndex = openTabs.findIndex((tab) => tab.path === activeTabPath)
        const nextActiveTab =
          openTabs
            .slice(activeIndex + 1)
            .find((tab) => !isSameOrChildPath(targetPath, tab.path))
          ?? [...openTabs.slice(0, activeIndex)].reverse().find((tab) => !isSameOrChildPath(targetPath, tab.path))
          ?? null

        setActiveTabPath(nextActiveTab?.path ?? null)
      }

      setOpenTabs((prev) => prev.filter((tab) => !isSameOrChildPath(targetPath, tab.path)))
    },
    [activeTabPath, openTabs],
  )

  const moveNode = useCallback(
    async (sourcePath: string, targetDirectoryPath: string) => {
      const holo = getHoloApi()

      if (!holo || sourcePath === targetDirectoryPath || isSameOrChildPath(sourcePath, targetDirectoryPath)) {
        return
      }

      try {
        const result = await holo.movePath(sourcePath, targetDirectoryPath)
        const nextPath = result.newPath

        setOpenTabs((prev) =>
          prev.map((tab) =>
            isSameOrChildPath(sourcePath, tab.path)
              ? { ...tab, path: tab.path.replace(sourcePath, nextPath) }
              : tab,
          ),
        )

        if (selectedPath && isSameOrChildPath(sourcePath, selectedPath)) {
          setSelectedPath(selectedPath.replace(sourcePath, nextPath))
        }

        if (activeTabPath && isSameOrChildPath(sourcePath, activeTabPath)) {
          setActiveTabPath(activeTabPath.replace(sourcePath, nextPath))
        }

        await refreshTree()
        await refreshGitState(false)
      } catch (error) {
        window.alert((error as Error).message)
      } finally {
        setDraggedPath(null)
        setDropTargetPath(null)
      }
    },
    [activeTabPath, getHoloApi, refreshGitState, refreshTree, selectedPath],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'

      if (!isSaveKey) {
        return
      }

      event.preventDefault()
      if (activeTab) {
        void saveCurrentFile()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrentFile, activeTab])

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
    })
  }, [rootPath, selectedPath, selectedType])

  const openCreateDirectoryDialog = useCallback((targetPath?: string | null, targetType?: NodeType | null) => {
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
  }, [rootPath, selectedPath, selectedType])

  const openRenameDialog = useCallback((targetPathOverride?: string | null) => {
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
  }, [rootPath, selectedPath])

  const submitNameDialog = useCallback(async () => {
    if (!nameDialog || !rootPath) {
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
      if (nameDialog.mode === 'create-file') {
        // Auto-append .md extension if not provided
        const filename = value.endsWith('.md') ? value : `${value}.md`
        const newFilePath = `${nameDialog.targetDirectoryPath}/${filename}`
        await holo.createFile(nameDialog.targetDirectoryPath, filename)
        
        // Auto-open the created file
        const content = await holo.readFile(newFilePath)
        setOpenTabs((prev) => [
          ...prev,
          {
            path: newFilePath,
            name: filename.replace(/\.md$/, ''),
            content,
            isDirty: false,
          },
        ])
        setActiveTabPath(newFilePath)
      } else if (nameDialog.mode === 'create-directory') {
        await holo.createDirectory(nameDialog.targetDirectoryPath, value)
      } else if (nameDialog.mode === 'rename') {
        const renameTargetPath = nameDialog.targetPath
        const result = await holo.renamePath(renameTargetPath, value)

        setOpenTabs((prev) =>
          prev.map((tab) =>
            isSameOrChildPath(renameTargetPath, tab.path)
              ? {
                ...tab,
                path: tab.path.replace(renameTargetPath, result.newPath),
                name: getBaseName(tab.path.replace(renameTargetPath, result.newPath)),
              }
              : tab,
          ),
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
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [getHoloApi, nameDialog, activeTabPath, refreshGitState, refreshTree, rootPath, selectedPath])

  const deletePathTarget = useCallback(async (targetPath: string) => {
    if (!rootPath || targetPath === rootPath) {
      return
    }

    const confirmed = window.confirm('Confirmer la suppression ?')

    if (!confirmed) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      await holo.deletePath(targetPath)
      closeTabsForPath(targetPath)

      setSelectedPath(rootPath)
      setSelectedType('directory')
      await refreshTree()
      await refreshGitState(false)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [closeTabsForPath, getHoloApi, refreshGitState, refreshTree, rootPath])

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
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

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

    await holo.toggleMaximizeWindow()
  }, [getHoloApi])

  const closeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.closeWindow()
  }, [getHoloApi])

  const openGithubCheckout = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      window.open('https://github.com', '_blank', 'noopener,noreferrer')
      return
    }

    await holo.openExternalUrl('https://github.com')
  }, [getHoloApi])

  const closeOpenedFolder = useCallback(() => {
    setRootPath(null)
    setTree(null)
    setSelectedPath(null)
    setSelectedType(null)
    setExpandedDirectories(new Set())
    setOpenTabs([])
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)
    setSyncFeedback(DEFAULT_SYNC_FEEDBACK)
    setContextMenu(null)
  }, [])


  return (
    <main
      className="h-screen bg-[#242527] text-white rounded-lg font-sans gap-x-2 grid overflow-hidden grid-cols-[auto_1fr] grid-rows-[64px_1fr]"
      style={{ gridTemplateAreas: `'appbar appbar' 'sidebar content'` }}
    >

      {/* App header */}
      <header className="flex items-center pr-3" style={{ gridArea: 'appbar' }}>
        <div className="flex-1 drag user-select-none">
          <img src="/logo.png" height={40} width={120} alt="logo" />
        </div>
        <div className="flex gap-2 text-white/50 no-drag">
          <button
            className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
            onClick={() => {
              void toggleDevTools()
            }}
            title="DevTools"
          >
            <i className="fa-regular fa-code" />
          </button>
          <button
            className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
            onClick={() => {
              void minimizeWindow()
            }}
            title="Minimiser"
          >
            <i className="fa-jelly-duo fa-regular fa-minus" />
          </button>
          <button
            className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
            onClick={() => {
              void toggleMaximizeWindow()
            }}
            title="Agrandir / Restaurer"
          >
            <i className="fa-jelly-duo fa-regular fa-square" />
          </button>
          <button
            className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
            onClick={() => {
              void closeWindow()
            }}
            title="Fermer"
          >
            <i className="fa-jelly-duo fa-regular fa-xmark" />
          </button>
        </div>
      </header>

      <aside className="max-w-[492px] flex gap-2 z-10 pl-2 font-quicksand" style={{ gridArea: 'sidebar' }}>

        {/* Icônes de navigation principale */}
        <nav className="flex flex-col gap-4 pt-4">

          {/* Bouton Fichiers */}
          <div
            className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
              activeSidebar === 'files'
                ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
            }`}
            onClick={() => setActiveSidebar('files')}
          >
            <i className="fa-jelly-duo fa-regular fa-folder text-2xl" />
            {openTabs.length > 0 && (
              <div className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#242527] border-2 border-[#7B61FF]/70 text-[10px] font-bold text-white flex items-center justify-center">
                {openTabs.length}
              </div>
            )}
          </div>

          {/* Bouton Git — badges incoming/outgoing juste en dessous */}
          <div className="relative flex flex-col items-center gap-1">
            <div
              className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
                activeSidebar === 'git'
                  ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                  : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
              }`}
              onClick={() => setActiveSidebar('git')}
            >
              <i className="fa-brands fa-github text-2xl" />
            </div>

            {/* Badges incoming / outgoing — visibles seulement si valeur > 0 */}
            <div className="flex flex-col gap-1 items-center pointer-events-none">
              {gitState.incoming > 0 && (
                <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                  <i className="fa-solid fa-arrow-down text-[10px]" />
                  <span className="font-bold">{gitState.incoming}</span>
                </div>
              )}
              {gitState.outgoing > 0 && (
                <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                  <i className="fa-solid fa-arrow-up text-[10px]" />
                  <span className="font-bold">{gitState.outgoing}</span>
                </div>
              )}
            </div>
          </div>

        </nav>

        {/* Panel Fichiers */}
        {activeSidebar === 'files' && (
          <nav className="bg-[#1f2021] min-w-[300px] rounded-t-lg overflow-x-hidden overflow-y-auto flex-1 p-5 flex flex-col gap-3">
            
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
                      void openGithubCheckout()
                    }}
                    title="Checkout sur GitHub"
                  >
                    <i className="fa-brands fa-github mr-1" />
                    Checkout GitHub
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
                            className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-xs ${isActive ? 'text-[#7B61FF]' : 'text-white/70 hover:text-white'}`}
                            onClick={() => {
                              void openRecentFolder(folderPath)
                            }}
                            title={folderPath}
                          >
                            {getBaseName(folderPath)}
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

            {/* Arborescence */}
            {tree ? (
              <ul className="space-y-0.5 flex-1 overflow-auto">
                <TreeItem
                  node={tree!}
                  selectedPath={selectedPath}
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
            ) : !rootPath && recentFolders.length > 0 ? null : (
              <p className="text-xs text-white/40 text-center py-8">
                {desktopApiAvailable ? 'Ouvre un dossier pour commencer' : 'API Electron indisponible'}
              </p>
            )}
          </nav>
        )}

        {/* Panel Git */}
        {activeSidebar === 'git' && (
          <nav className="bg-[#1f2021] w-[300px] rounded-t-lg overflow-x-hidden overflow-y-auto flex-1 p-5 flex flex-col gap-3">
            
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
                          <button
                            className="w-full truncate rounded border border-amber-700/30 bg-white/5 px-2 py-1 text-left text-[9px] text-amber-100 hover:bg-amber-900/20 hover:border-amber-700/50"
                            onClick={() => void openConflictedFile(filePath)}
                            title={filePath}
                          >
                            {getBaseName(filePath)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </nav>
        )}

      </aside>

      {/* Zone d'édition principale */}
      <section className="flex flex-1 min-h-0 flex-col bg-[#292929]" style={{ gridArea: 'content' }}>
          {/* Tab bar */}
          <div className="flex items-center border-b border-white/10 bg-[#242527]">
            {openTabs.length === 0 ? (
              <div className="flex-1 px-4 py-2 text-xs text-white/40">
                Aucun fichier ouvert
              </div>
            ) : (
              <>
                {openTabs.map((tab) => (
                  <button
                    key={tab.path}
                    className={`group flex items-center gap-2 border-r border-white/5 px-3 py-2 text-xs font-medium transition-colors ${
                      activeTabPath === tab.path
                        ? 'bg-[#1f2021] text-white'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                    }`}
                    onClick={() => setActiveTabPath(tab.path)}
                  >
                    <span className="truncate max-w-[150px]">{tab.name}</span>
                    {tab.isDirty && <span className="text-xs">•</span>}
                    <button
                      className="ml-1 rounded px-1 opacity-0 hover:bg-white/20 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        closeTab(tab.path)
                      }}
                      title="Fermer"
                    >
                      <i className="fa-solid fa-xmark text-[9px]" />
                    </button>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Éditeur */}
          <div className="flex-1 min-h-0 flex flex-col">
            {activeTab ? (
              <>
                {/* Barre de contrôles fine */}
                <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-6 py-2">
                  <span className="text-[10px] text-white/25">
                    {activeTab.isDirty ? '● non sauvegardé' : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded border border-white/10 bg-[#1f2021] p-0.5">
                      <button
                        className={`rounded px-2 py-1 text-[10px] font-medium ${editorMode === 'raw' ? 'bg-[#7B61FF] text-white' : 'text-white/70 hover:text-white'}`}
                        onClick={() => setEditorMode('raw')}
                        title="Mode RAW"
                      >
                        RAW
                      </button>
                      <button
                        className={`rounded px-2 py-1 text-[10px] font-medium ${editorMode === 'wysiwyg' ? 'bg-[#7B61FF] text-white' : 'text-white/70 hover:text-white'}`}
                        onClick={() => setEditorMode('wysiwyg')}
                        title="Mode WYSIWYG"
                      >
                        WYSIWYG
                      </button>
                    </div>
                    <button
                      className="rounded bg-[#7B61FF] px-3 py-1 text-xs font-medium text-white hover:bg-[#6D4FD8] disabled:opacity-50"
                      onClick={() => void saveCurrentFile()}
                      disabled={!activeTab.isDirty}
                      title="Sauvegarder (Ctrl+S)"
                    >
                      <i className="fa-solid fa-floppy-disk mr-1" />
                      Sauvegarder
                    </button>
                  </div>
                </div>

                {/* Zone de page unifiée — tout scrolle ensemble */}
                <div className="flex-1 min-h-0 overflow-auto">
                  <div className="mx-auto max-w-4xl px-8 pt-10 pb-32">

                    {/* Titre */}
                    <input
                      className="mb-2 w-full bg-transparent text-[2rem] font-bold leading-tight text-white outline-none placeholder:text-white/20"
                      value={editableHeader.title}
                      onChange={(event) => updateEditableHeader('title', event.target.value)}
                      placeholder="Sans titre"
                    />

                    {/* Description */}
                    <textarea
                      className="mb-3 w-full resize-none bg-transparent text-sm leading-relaxed text-white/55 outline-none placeholder:text-white/20"
                      rows={2}
                      value={editableHeader.description}
                      onChange={(event) => updateEditableHeader('description', event.target.value)}
                      placeholder="Ajouter une description…"
                    />

                    {/* Ligne de méta */}
                    <div className="mb-8 flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-white/8 pb-5 text-xs text-white/30">
                      <span className="flex items-center gap-1">
                        <i className="fa-regular fa-user text-[10px]" />
                        <input
                          className="bg-transparent outline-none placeholder:text-white/20 hover:text-white/60 focus:text-white/80"
                          value={editableHeader.author}
                          onChange={(event) => updateEditableHeader('author', event.target.value)}
                          placeholder="Auteur"
                          size={Math.max(editableHeader.author.length, 6)}
                        />
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="fa-regular fa-calendar text-[10px]" />
                        {formatReadonlyDate(activePathStats?.createdAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <i className="fa-regular fa-clock text-[10px]" />
                        {formatReadonlyDate(activePathStats?.modifiedAt)}
                      </span>
                    </div>

                    {/* Corps du document */}
                    <div className="relative">
                    {editorMode === 'raw' ? (
                      <textarea
                        className="w-full min-h-[400px] resize-none bg-transparent font-mono text-sm leading-relaxed text-white/85 outline-none placeholder:text-white/25"
                        value={activeTabBody}
                        onChange={(event) => updateActiveTabBody(event.target.value)}
                        onDrop={onRawDrop}
                        onDragEnter={onEditorDragEnter}
                        onDragOver={onEditorDragOver}
                        onDragLeave={onEditorDragLeave}
                        placeholder="Édite ton fichier ici…"
                      />
                    ) : (
                      <>
                        <div
                          ref={wysiwygEditorRef}
                          className="min-h-[400px] text-sm text-white/90 outline-none [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-white [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-white [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-white [&_p]:my-1.5 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_ul.task-list]:list-none [&_ul.task-list]:pl-0 [&_ul.task-list_li]:list-none [&_li.task-item]:flex [&_li.task-item]:items-center [&_li.task-item]:gap-2 [&_li.task-item]:my-1 [&_input.task-checkbox]:w-4 [&_input.task-checkbox]:h-4 [&_input.task-checkbox]:cursor-pointer [&_input.task-checkbox]:appearance-none [&_input.task-checkbox]:rounded-full [&_input.task-checkbox]:border [&_input.task-checkbox]:border-white/35 [&_input.task-checkbox]:bg-transparent [&_input.task-checkbox]:transition-colors [&_input.task-checkbox:checked]:bg-[#7B61FF] [&_input.task-checkbox:checked]:border-[#7B61FF] [&_a]:text-[#9d8bff] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#7B61FF]/50 [&_blockquote]:pl-4 [&_blockquote]:text-white/60 [&_blockquote]:my-2 [&_pre]:bg-[#111213] [&_pre]:rounded [&_pre]:p-3 [&_pre]:my-2 [&_pre]:font-mono [&_code]:text-[#9d8bff] [&_table]:border-collapse [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_table]:rounded-lg [&_table]:overflow-hidden [&_table]:border [&_table]:border-white/10 [&_tbody_tr:hover]:bg-white/5 [&_th]:border-b [&_th]:border-white/15 [&_th]:p-4 [&_th]:bg-gradient-to-r [&_th]:from-[#7B61FF]/15 [&_th]:to-[#9d8bff]/10 [&_th]:text-white [&_th]:font-semibold [&_th]:text-left [&_td]:border-b [&_td]:border-white/10 [&_td]:p-4 [&_tr]:transition-colors [&_img]:max-w-full [&_img]:rounded [&_img]:my-2 empty:before:content-['Écris_ici,_ou_tape_/_pour_les_commandes…'] empty:before:text-white/25 empty:before:pointer-events-none"
                          contentEditable
                          suppressContentEditableWarning
                          onInput={onWysiwygInput}
                          onKeyDown={onWysiwygKeyDown}
                          onDrop={onWysiwygDrop}
                          onDragEnter={onEditorDragEnter}
                          onDragOver={onEditorDragOver}
                          onDragLeave={onEditorDragLeave}
                          onClick={(e) => {
                            const target = e.target as HTMLInputElement
                            if (target.type === 'checkbox') {
                              // Sync after checkbox toggle
                              setTimeout(() => {
                                const editor = wysiwygEditorRef.current
                                if (editor) {
                                  const markdown = turndownService.turndown(editor.innerHTML)
                                  updateActiveTabBody(markdown)
                                }
                              }, 0)
                            }
                          }}
                        />
                        <div className="mt-4 text-right text-[9px] text-white/15 pointer-events-none select-none">
                          <kbd>/</kbd> commandes · <kbd>#</kbd> titre · <kbd>-</kbd> liste · glisse une image
                        </div>
                      </>
                    )}
                      {isImageDragOverEditor && (
                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border border-dashed border-[#7B61FF]/70 bg-[#111213]/75 px-4 text-sm font-medium text-white/90">
                          Déposez une image pour l’insérer
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {tocItems.length > 0 && (
                  <aside className="fixed right-6 top-40 z-30 hidden max-h-[70vh] w-64 overflow-auto rounded-lg border border-white/10 bg-[#1a1b1c]/90 p-3 backdrop-blur-sm 2xl:block">
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                      Table des matières
                    </p>
                    <nav className="space-y-0.5">
                      {tocItems.map((item) => (
                        <button
                          key={`${item.headingIndex}-${item.text}`}
                          className="block w-full truncate rounded px-2 py-1 text-left text-xs text-white/65 hover:bg-white/8 hover:text-white"
                          style={{ paddingLeft: `${Math.min((item.level - 1) * 10 + 8, 36)}px` }}
                          onClick={() => onTocItemClick(item.headingIndex)}
                          title={item.text}
                        >
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  </aside>
                )}

                {/* Floating selection popup */}
                {selectionPopup && editorMode === 'wysiwyg' && (
                  <div
                    className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-white/15 bg-[#18191a] shadow-2xl px-1 py-1"
                    style={{ left: selectionPopup.x, top: selectionPopup.y, transform: 'translate(-50%, -100%)' }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <button className="rounded px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('bold')} title="Gras">B</button>
                    <button className="rounded px-2 py-1 text-xs italic text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('italic')} title="Italique">I</button>
                    <button className="rounded px-2 py-1 text-xs underline text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('underline')} title="Souligné">U</button>
                    <button className="rounded px-2 py-1 text-xs line-through text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('strikeThrough')} title="Barré">S</button>
                    <div className="w-px h-4 bg-white/15 mx-0.5" />
                    <button className="rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('formatBlock', '<h1>')} title="H1">H1</button>
                    <button className="rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('formatBlock', '<h2>')} title="H2">H2</button>
                    <div className="w-px h-4 bg-white/15 mx-0.5" />
                    <button
                      className="rounded px-2 py-1 text-xs text-[#9d8bff] hover:bg-[#7B61FF]/20"
                      onClick={() => {
                        const link = window.prompt('URL du lien', 'https://')
                        if (link) runWysiwygCommand('createLink', link)
                      }}
                      title="Lien"
                    >
                      <i className="fa-solid fa-link text-[10px]" />
                    </button>
                  </div>
                )}

                {/* Slash command menu */}
                {slashMenu && editorMode === 'wysiwyg' && (() => {
                  const filtered = SLASH_COMMANDS.filter(
                    (c) => !slashMenu.query || c.label.toLowerCase().includes(slashMenu.query),
                  )
                  return filtered.length > 0 ? (
                    <div
                      className="fixed z-50 min-w-[200px] rounded-lg border border-white/15 bg-[#18191a] shadow-2xl p-1"
                      style={{ left: slashMenu.x, top: slashMenu.y }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      {slashMenu.query === '' && (
                        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/35">Insérer un bloc</p>
                      )}
                      {filtered.map((cmd, idx) => (
                        <button
                          key={cmd.id}
                          className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-xs ${idx === slashMenuIndex ? 'bg-[#7B61FF]/25 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                          onClick={() => executeSlashCommand(cmd)}
                        >
                          <span className="w-5 text-center text-[11px] text-[#9d8bff]">
                            <i className={cmd.icon} />
                          </span>
                          <span className="flex-1 font-medium">{cmd.label}</span>
                          <span className="text-[10px] text-white/30">{cmd.hint}</span>
                        </button>
                      ))}
                    </div>
                  ) : null
                })()}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-center text-sm text-white/40">
                  Clique sur un fichier pour commencer l'édition
                </p>
              </div>
            )}
          </div>
        </section>

      {contextMenu && (
        <div
          className="fixed z-20 min-w-[180px] rounded-lg border border-white/10 bg-[#1b1c1d] p-1.5 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
            {contextMenu.node.type === 'directory' ? 'Dossier' : 'Fichier'} · {contextMenu.node.name}
          </div>

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

          {contextMenu.node.path !== rootPath && (
            <>
              <div className="my-1 h-px bg-white/8" />

              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/75 hover:bg-white/8 hover:text-white"
                onClick={() => runContextAction(() => openRenameDialog(contextMenu.node.path))}
              >
                <i className="fa-solid fa-pen w-4 text-center" />
                Renommer
              </button>

              <button
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
                onClick={() => runContextAction(() => {
                  void deletePathTarget(contextMenu.node.path)
                })}
              >
                <i className="fa-solid fa-trash w-4 text-center" />
                Supprimer
              </button>
            </>
          )}
        </div>
      )}

      {nameDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">
              {nameDialog!.mode === 'create-file'
                ? 'Créer un fichier'
                : nameDialog!.mode === 'create-directory'
                  ? 'Créer un dossier'
                  : 'Renommer'}
            </h2>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitNameDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={nameDialog!.value}
                onChange={(event) =>
                  setNameDialog((previous) =>
                    previous
                      ? {
                        ...previous,
                        value: event.target.value,
                      }
                      : previous,
                  )
                }
                placeholder="Nom"
              />

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setNameDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8]"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gitDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">
              {gitDialog!.mode === 'commit' ? 'Nouveau commit' : 'Merge une branche'}
            </h2>

            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void submitGitDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={gitDialog!.value}
                onChange={(event) =>
                  setGitDialog((previous) =>
                    previous
                      ? {
                        ...previous,
                        value: event.target.value,
                      }
                      : previous,
                  )
                }
                placeholder={gitDialog!.mode === 'commit' ? 'Message de commit' : 'Nom de branche'}
              />

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => setGitDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8]"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
