import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../utils/global'
import { useParams } from 'react-router-dom'
import { getBaseName } from '../lib/appUtils'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConfig } from '../contexts/ConfigContext'
import { useGetHoloApi } from '../hooks/useGetHoloApi'
import { useWorkspaceFolders } from '../hooks/useWorkspaceFolders'
import type { TreeNode } from '../types/app'
import { Folder, FolderOpen, FileText, File, ChevronRight, Plus, Search, X, Pencil, Trash2, FilePlus, FolderPlus, ChevronDown, MoreHorizontal, Star, RefreshCw, Unlink, GitBranch, Archive } from 'lucide-react'
import { ContextMenu } from '../components/ContextMenu'
import type { ContextMenuAction } from '../components/ContextMenu'
import type { LucideIcon } from 'lucide-react'
import { AbstractPanel } from './AbstractPanel'

type SpacePanelTab = 'browse' | 'recent' | 'favorites'

export type SpaceFileNode = {
  id: string
  name: string
  type: 'folder' | 'file'
  path: string
  children?: SpaceFileNode[]
  extension?: string
}

export type SpacePanelItem = {
  id: string
  title: string
  path: string
  icon?: LucideIcon
  subtitle?: string
}

type SpacePanelProps = {
  spaceName: string
  files?: SpaceFileNode[]
  recentItems?: SpacePanelItem[]
  favoriteItems?: SpacePanelItem[]
  archivedItems?: SpacePanelItem[]
  selectedPath?: string
  rootPath?: string
  /** Métadonnées live du fichier actuellement ouvert (override du cache) */
  metaOverride?: TreeFileMeta & { path: string }
  onSelectFile?: (node: SpaceFileNode) => void
  onAddItem?: (type: 'file' | 'folder', name: string, parentPath?: string) => void
  onMoveItem?: (sourcePath: string, targetFolderPath: string) => void
  onRenameItem?: (path: string, newName: string) => void
  onDeleteItem?: (path: string) => void
  onArchiveItem?: (path: string) => void
  onSearch?: (query: string) => void
  // "…" menu
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onDetach?: () => void
  isGitRepo?: boolean
  gitAhead?: number
  gitBehind?: number
  onGitSync?: () => void
  // Favoris fichiers
  favoriteFilePaths?: string[]
  onToggleFileFavorite?: (path: string) => void
}



const tabClassName =
  'flex flex-1 items-center justify-center rounded-holo-md px-2 py-2 text-sm transition active:scale-[0.99]'

// ─── Métadonnées fichier (frontmatter) ───────────────────────────────────────

export type TreeFileMeta = { title?: string; description?: string; icon?: string }

function parseFrontmatterQuick(content: string): TreeFileMeta {
  const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result: TreeFileMeta = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key !== 'title' && key !== 'description' && key !== 'icon') continue
    const value = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '')
    if (value) result[key as keyof TreeFileMeta] = value
  }
  return result
}

function collectMdPaths(nodes: SpaceFileNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.type === 'file' && node.extension === 'md') paths.push(node.path)
    if (node.children?.length) paths.push(...collectMdPaths(node.children))
  }
  return paths
}

// Collecte tous les dossiers (chemin + nom indenté) pour le picker
function getAllFolders(nodes: SpaceFileNode[], depth = 0): { path: string; label: string }[] {
  const result: { path: string; label: string }[] = []
  for (const node of nodes) {
    if (node.type === 'folder') {
      result.push({ path: node.path, label: '\u00a0'.repeat(depth * 3) + node.name })
      if (node.children?.length) result.push(...getAllFolders(node.children, depth + 1))
    }
  }
  return result
}

function getFileIcon(node: SpaceFileNode): LucideIcon {
  if (node.type === 'folder') return Folder
  if (node.extension === 'md') return FileText
  return File
}

// Props DnD passés à chaque TreeNode
type DragProps = {
  dragOverPath: string | null
  onDragStart: (path: string, e: React.DragEvent) => void
  onDragOverFolder: (folderPath: string, e: React.DragEvent) => void
  onDragLeaveFolder: (e: React.DragEvent) => void
  onDropFolder: (folderPath: string, e: React.DragEvent) => void
  onDragEnd: () => void
}

function TreeNode({
  node,
  level,
  activePath,
  expanded,
  onToggle,
  onSelectFile,
  onSelectFolder,
  drag,
  fileMeta,
  metaOverride,
  onContextMenu,
  favoriteFilePaths,
}: {
  node: SpaceFileNode
  level: number
  activePath?: string
  expanded: Set<string>
  onToggle: (path: string) => void
  onSelectFile?: (node: SpaceFileNode) => void
  onSelectFolder?: (path: string) => void
  drag?: DragProps
  fileMeta?: Record<string, TreeFileMeta>
  metaOverride?: TreeFileMeta & { path: string }
  onContextMenu?: (node: SpaceFileNode, e: React.MouseEvent) => void
  favoriteFilePaths?: string[]
}) {
  const isFolder = node.type === 'folder'
  const isExpanded = expanded.has(node.path)
  const isSelected = activePath === node.path
  const hasChildren = Boolean(node.children?.length)
  const FileIcon = getFileIcon(node)
  const isDragOver = drag?.dragOverPath === node.path && isFolder
  const isFav = !isFolder && (favoriteFilePaths?.includes(node.path) ?? false)
  // Utiliser l'override si disponible (mise à jour immédiate sans attendre le cache)
  const metaRaw = metaOverride?.path === node.path ? metaOverride : (!isFolder ? fileMeta?.[node.path] : undefined)
  const displayTitle = metaRaw?.title || node.name
  const displayIcon = metaRaw?.icon
  const displayDesc = metaRaw?.description

  const handleClick = () => {
    if (isFolder) {
      onToggle(node.path)
      onSelectFolder?.(isSelected ? '' : node.path)
      return
    }
    onSelectFolder?.('')
    onSelectFile?.(node)
  }

  return (
    <div
      onDragOver={isFolder && drag ? (e) => drag.onDragOverFolder(node.path, e) : undefined}
      onDragLeave={isFolder && drag ? drag.onDragLeaveFolder : undefined}
      onDrop={isFolder && drag ? (e) => drag.onDropFolder(node.path, e) : undefined}
    >
      <button
        onClick={handleClick}
        draggable={!!drag}
        onDragStart={drag ? (e) => drag.onDragStart(node.path, e) : undefined}
        onDragEnd={drag ? drag.onDragEnd : undefined}
        onContextMenu={(e) => onContextMenu?.(node, e)}
        className={cn(
          'group flex min-h-9 w-full items-center gap-2 rounded-holo-md py-2 pr-2 text-left text-sm transition hover:bg-holo-glass-hover hover:text-holo-text',
          isSelected
            ? 'bg-holo-primary-surface text-holo-primary-soft ring-1 ring-holo-primary/20'
            : 'text-holo-text-muted',
          isDragOver && 'ring-1 ring-holo-primary/50 bg-holo-primary-surface/60 text-holo-primary-soft',
        )}
        style={{ paddingLeft: `${10 + level * 14}px` }}
        title={node.path}
        data-tree-path={node.path}
      >
        <span className="flex size-4 shrink-0 items-center justify-center text-holo-text-faint">
          {isFolder && hasChildren ? (
            <ChevronRight size={10} className={cn('transition-transform duration-150', isExpanded && 'rotate-90')} />
          ) : (
            <span className="size-4" />
          )}
        </span>

        <span className="flex size-5 shrink-0 items-center justify-center text-holo-text-faint group-hover:text-holo-text-muted">
          {displayIcon
            ? <span className="text-sm leading-none">{displayIcon}</span>
            : <FileIcon size={14} />
          }
        </span>

        <div className="min-w-0 flex-1">
          <div className="truncate leading-none">{displayTitle}</div>
          {displayDesc && (
            <div className="mt-0.5 truncate text-[11px] leading-4 text-holo-text-faint/70">{displayDesc}</div>
          )}
        </div>

        {isFav && (
          <Star size={10} className="shrink-0 fill-amber-400 text-amber-400 opacity-70" />
        )}
      </button>

      {isFolder && isExpanded && hasChildren && (
        <div className="mt-0.5 space-y-0.5">
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              activePath={activePath}
              expanded={expanded}
              onToggle={onToggle}
              onSelectFile={onSelectFile}
              onSelectFolder={onSelectFolder}
              drag={drag}
              fileMeta={fileMeta}
              metaOverride={metaOverride}
              onContextMenu={onContextMenu}
              favoriteFilePaths={favoriteFilePaths}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-holo-2xl border border-white/[0.04] bg-holo-glass shadow-[0_8px_30px_rgba(0,0,0,.22)]">
        <Icon size={20} className="text-holo-text-muted" />
      </div>
      <p className="text-sm font-medium text-holo-text">{title}</p>
      <p className="mt-1 max-w-[220px] text-sm leading-6 text-holo-text-faint">{description}</p>
    </div>
  )
}

function ItemList({
  items,
  emptyTitle,
  emptyDescription,
  onSelect,
  archived = false,
}: {
  items?: SpacePanelItem[]
  emptyTitle: string
  emptyDescription: string
  onSelect?: (path: string) => void
  archived?: boolean
}) {
  if (!items?.length) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="space-y-1">
      {items?.map((item) => {
        const ItemIcon = archived ? Archive : (item.icon ?? FileText)
        return (
        <button
          key={item.id}
          onClick={() => onSelect?.(item.path)}
          className="group w-full rounded-holo-md px-3 py-2 text-left transition hover:bg-holo-glass-hover"
          title={item.path}
        >
          <div className="flex items-center gap-2">
            <span className={cn('flex size-5 shrink-0 items-center justify-center', archived ? 'text-amber-400/60 group-hover:text-amber-400' : 'text-holo-text-faint group-hover:text-holo-text-muted')}>
              <ItemIcon size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-holo-text-muted group-hover:text-holo-text">
              {item.title}
            </span>
          </div>

          <div className="mt-1 truncate pl-7 text-xs text-holo-text-faint">
            {item.subtitle ?? item.path}
          </div>
        </button>
        )
      })}
    </div>
  )
}

export function SpacePanel({
  spaceName,
  files,
  recentItems,
  favoriteItems,
  archivedItems,
  selectedPath,
  rootPath,
  metaOverride,
  onSelectFile,
  onAddItem,
  onMoveItem,
  onRenameItem,
  onDeleteItem,
  onArchiveItem,
  onSearch,
  isFavorite,
  onToggleFavorite,
  onDetach,
  isGitRepo,
  gitAhead = 0,
  gitBehind = 0,
  onGitSync,
  favoriteFilePaths = [],
  onToggleFileFavorite,
}: SpacePanelProps) {
  const [tab, setTab] = useState<SpacePanelTab>('browse')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/docs', '/docs/architecture']))
  const [selectedFolderPath, setSelectedFolderPath] = useState('')

  // Réagit au clic sur un dossier dans le breadcrumb de l'éditeur
  useEffect(() => {
    const handler = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string }>).detail
      if (!rootPath || !path.startsWith(rootPath)) return
      // Basculer sur l'onglet "browse"
      setTab('browse')
      // Sélectionner le dossier
      setSelectedFolderPath(path)
      // Ouvrir tous les ancêtres
      setExpanded(prev => {
        const next = new Set(prev)
        let current = path
        while (current.length > rootPath.length) {
          const parent = current.slice(0, current.lastIndexOf('/'))
          if (parent.length >= rootPath.length) next.add(parent)
          current = parent
        }
        next.add(path) // ouvrir le dossier lui-même
        return next
      })
      // Scroll vers l'élément après le rendu
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-tree-path="${CSS.escape(path)}"]`)
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      })
    }
    window.addEventListener('holo:reveal-in-tree', handler)
    return () => window.removeEventListener('holo:reveal-in-tree', handler)
  }, [rootPath])

  // ─── Métadonnées frontmatter des fichiers .md ─────────────────────────────
  const [fileMeta, setFileMeta] = useState<Record<string, TreeFileMeta>>({})
  const fileMetaRef = useRef<Record<string, TreeFileMeta>>({})
  fileMetaRef.current = fileMeta
  const loadingPathsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!files?.length || !window.holo) return
    const paths = collectMdPaths(files)
    const toLoad = paths.filter(p => !fileMetaRef.current[p] && !loadingPathsRef.current.has(p))
    if (!toLoad.length) return
    for (const path of toLoad) {
      loadingPathsRef.current.add(path)
      window.holo.readFile(path)
        .then(content => {
          const meta = parseFrontmatterQuick(content)
          setFileMeta(prev => ({ ...prev, [path]: meta }))
        })
        .catch(() => {
          setFileMeta(prev => ({ ...prev, [path]: {} }))
        })
        .finally(() => {
          loadingPathsRef.current.delete(path)
        })
    }
  }, [files])

  // ─── Drag-and-drop ──────────────────────────────────────────────────────────
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [dragOverRoot, setDragOverRoot] = useState(false)
  const dragSourceRef = useRef<string | null>(null)

  const handleDragStart = useCallback((path: string, e: React.DragEvent) => {
    dragSourceRef.current = path
    e.dataTransfer.setData('text/plain', path)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOverFolder = useCallback((folderPath: string, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const source = dragSourceRef.current
    // Interdit de déposer un dossier dans lui-même ou dans un de ses enfants
    if (source && (folderPath === source || folderPath.startsWith(source + '/'))) return
    e.dataTransfer.dropEffect = 'move'
    setDragOverRoot(false)
    setDragOverPath(folderPath)
  }, [])

  const handleDragLeaveFolder = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragOverPath(null)
  }, [])

  const handleDropFolder = useCallback((folderPath: string, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPath(null)
    const sourcePath = e.dataTransfer.getData('text/plain') || dragSourceRef.current
    dragSourceRef.current = null
    if (!sourcePath || sourcePath === folderPath || folderPath.startsWith(sourcePath + '/')) return
    // Évite de déplacer vers le dossier parent actuel (opération inutile)
    const currentParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
    if (currentParent === folderPath) return
    onMoveItem?.(sourcePath, folderPath)
  }, [onMoveItem])

  // Zone de dépôt sur le dossier root
  const handleDragOverRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const source = dragSourceRef.current
    if (!source || !rootPath) return
    if (source === rootPath || rootPath.startsWith(source + '/')) return
    const currentParent = source.substring(0, source.lastIndexOf('/'))
    if (currentParent === rootPath) return  // déjà à la racine
    e.dataTransfer.dropEffect = 'move'
    setDragOverRoot(true)
  }, [rootPath])

  const handleDragLeaveRoot = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragOverRoot(false)
  }, [])

  const handleDropRoot = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOverRoot(false)
    const sourcePath = e.dataTransfer.getData('text/plain') || dragSourceRef.current
    dragSourceRef.current = null
    if (!sourcePath || !rootPath) return
    const currentParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
    if (currentParent === rootPath) return
    if (sourcePath === rootPath || rootPath.startsWith(sourcePath + '/')) return
    onMoveItem?.(sourcePath, rootPath)
  }, [rootPath, onMoveItem])

  const handleDragEnd = useCallback(() => {
    dragSourceRef.current = null
    setDragOverPath(null)
    setDragOverRoot(false)
  }, [])

  const dragProps: DragProps | undefined = onMoveItem ? {
    dragOverPath,
    onDragStart: handleDragStart,
    onDragOverFolder: handleDragOverFolder,
    onDragLeaveFolder: handleDragLeaveFolder,
    onDropFolder: handleDropFolder,
    onDragEnd: handleDragEnd,
  } : undefined

  // ─── Dialog ajout fichier / dossier ────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false)
  const [addType, setAddType] = useState<'file' | 'folder'>('file')
  const [addName, setAddName] = useState('')
  const [addParentOverride, setAddParentOverride] = useState<string | undefined>(undefined)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const addInputRef = useRef<HTMLInputElement>(null)
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [moreMenuAnchorEl, setMoreMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [gitSyncing, setGitSyncing] = useState(false)

  // ─── Menu contextuel clic-droit ────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; node: SpaceFileNode } | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamePath, setRenamePath] = useState('')
  const [renameName, setRenameName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const handleContextMenu = useCallback((node: SpaceFileNode, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const openRenameDialog = useCallback((node: SpaceFileNode) => {
    setRenamePath(node.path)
    setRenameName(node.name.replace(/\.md$/, ''))
    setCtxMenu(null)
    setRenameOpen(true)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }, [])

  const handleRenameConfirm = useCallback(() => {
    const name = renameName.trim()
    if (!name || !renamePath) return
    const original = renamePath.split('/').pop() ?? ''
    const ext = original.includes('.') && !original.startsWith('.') ? original.slice(original.lastIndexOf('.')) : ''
    const finalName = name.includes('.') ? name : name + ext
    onRenameItem?.(renamePath, finalName)
    setRenameOpen(false)
    setRenameName('')
    setRenamePath('')
  }, [renameName, renamePath, onRenameItem])

  const openAddDialog = useCallback((type: 'file' | 'folder', parentPath?: string) => {
    setAddType(type)
    setAddName('')
    setAddParentOverride((parentPath ?? selectedFolderPath) || undefined)
    setFolderPickerOpen(false)
    setAddOpen(true)
    setTimeout(() => addInputRef.current?.focus(), 50)
  }, [selectedFolderPath])

  const handleAddConfirm = useCallback(() => {
    let name = addName.trim()
    if (!name) return
    if (addType === 'file' && !name.includes('.')) name += '.md'
    onAddItem?.(addType, name, addParentOverride || undefined)
    setAddOpen(false)
    setAddName('')
    setAddParentOverride(undefined)
    setFolderPickerOpen(false)
  }, [addName, addType, onAddItem, addParentOverride])

  const filteredFiles = useMemo(() => {
    if (!query.trim()) return files

    const normalizedQuery = query.trim().toLowerCase()

    const filterNode = (node: SpaceFileNode): SpaceFileNode | null => {
      const selfMatch = node.name.toLowerCase().includes(normalizedQuery) || node.path.toLowerCase().includes(normalizedQuery)

      if (!node.children?.length) {
        return selfMatch ? node : null
      }

      const children = node.children.map(filterNode).filter(Boolean) as SpaceFileNode[]

      if (selfMatch || children.length) {
        return { ...node, children }
      }

      return null
    }

    return files?.map(filterNode).filter(Boolean) as SpaceFileNode[]
  }, [files, query])

  const handleToggle = (path: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleSearch = (value: string) => {
    setQuery(value)
    onSearch?.(value)
  }

  return (
    <>
    <AbstractPanel
      title={spaceName}
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => setMoreMenuAnchorEl(e.currentTarget)}
            className="flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:border-holo-primary/40 hover:bg-holo-primary-surface hover:text-holo-primary-soft active:scale-[0.98]"
            title="Options de l'espace"
            aria-label="Options"
          >
            <MoreHorizontal size={13} />
          </button>
          <button
            onClick={(e) => setMenuAnchorEl(e.currentTarget)}
            className={`flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-holo-border-soft 
            ${files?.length === 0 ? 'bg-holo-primary/80 text-white hover:bg-holo-primary/80' : 'bg-holo-glass text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text'}
            text-holo-text-muted transition hover:border-holo-primary/40 hover:bg-holo-primary-surface hover:text-holo-primary-soft active:scale-[0.98]`}
            title="Nouveau…"
            aria-label="Nouveau…"
          >
            <Plus size={13} />
          </button>
        </div>
      }
      subHeader={
        <div className="px-4 pb-3">
          <div className="mb-3 flex gap-1 rounded-holo-lg bg-holo-glass p-1">
            {([
              ['browse', 'Parcourir'],
              ['recent', 'Récents'],
              ['favorites', 'Favoris'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={cn(
                  tabClassName,
                  tab === value
                    ? 'bg-holo-primary-surface text-holo-primary-soft shadow-[0_6px_24px_rgba(0,0,0,.22)] ring-1 ring-white/[0.05]'
                    : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={12} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-holo-text-faint" />
            <input
              value={query}
              onChange={(event) => handleSearch(event.target.value)}
              placeholder="Filtrer..."
              className="w-full rounded-holo-md border border-holo-border-soft bg-holo-glass py-2 pl-9 pr-3 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none"
            />
          </div>
        </div>
      }
    >
      {tab === 'browse' && (
        <>
          {filteredFiles?.length ? (
            <div
              className={cn('space-y-0.5 px-1 rounded-holo-md transition-all', dragOverRoot && 'ring-1 ring-holo-primary/50 bg-holo-primary-surface/20')}
              onDragOver={rootPath ? handleDragOverRoot : undefined}
              onDragLeave={rootPath ? handleDragLeaveRoot : undefined}
              onDrop={rootPath ? handleDropRoot : undefined}
            >
              {filteredFiles.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  level={0}
                  activePath={selectedFolderPath || selectedPath}
                  expanded={expanded}
                  onToggle={handleToggle}
                  onSelectFile={onSelectFile}
                  onSelectFolder={setSelectedFolderPath}
                  drag={dragProps}
                  fileMeta={fileMeta}
                  metaOverride={metaOverride}
                  onContextMenu={handleContextMenu}
                  favoriteFilePaths={favoriteFilePaths}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="Aucun fichier trouvé"
              description="Essaie avec un autre terme de recherche."
            />
          )}
        </>
      )}

      {tab === 'recent' && (
        <div className="space-y-4">
          <ItemList
            items={recentItems}
            emptyTitle="Aucun fichier récent"
            emptyDescription="Les documents ouverts récemment apparaîtront ici."
            onSelect={(path) => onSelectFile?.({ id: path, name: getBaseName(path), type: 'file', path })}
          />
          {(archivedItems?.length ?? 0) > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-2 px-1">
                <Archive size={11} className="text-amber-400/60" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400/60">Archivés récemment</span>
              </div>
              <ItemList
                items={archivedItems}
                emptyTitle=""
                emptyDescription=""
                onSelect={(path) => onSelectFile?.({ id: path, name: getBaseName(path), type: 'file', path })}
                archived
              />
            </div>
          )}
        </div>
      )}

      {tab === 'favorites' && (
        <ItemList
          items={favoriteItems}
          emptyTitle="Aucun favori"
          emptyDescription="Marque des documents comme favoris pour les retrouver rapidement."
          onSelect={(path) => onSelectFile?.({ id: path, name: getBaseName(path), type: 'file', path })}
        />
      )}
    </AbstractPanel>

    {addOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => { setAddOpen(false); setFolderPickerOpen(false) }}
      >
        <div
          className="w-[340px] rounded-holo-2xl border border-holo-border-soft bg-holo-bg-elevated p-5 shadow-[0_24px_64px_rgba(0,0,0,.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-holo-text">
              {addType === 'file' ? 'Nouveau fichier' : 'Nouveau dossier'}
            </h3>
            <button
              onClick={() => { setAddOpen(false); setFolderPickerOpen(false) }}
              className="flex size-7 items-center justify-center rounded-holo-md text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
            >
              <X size={14} />
            </button>
          </div>

          {/* Picker dossier parent */}
          <div className="mb-3">
            <p className="mb-1.5 text-xs text-holo-text-faint">Créer dans</p>
            <button
              type="button"
              onClick={() => setFolderPickerOpen((o) => !o)}
              className="flex w-full items-center gap-1.5 rounded-holo-md border border-holo-border-soft bg-holo-glass px-2.5 py-1.5 text-xs text-holo-text-muted transition hover:border-holo-primary/40 hover:bg-holo-glass-hover"
            >
              <Folder size={11} className="shrink-0 text-holo-text-faint" />
              <span className="flex-1 truncate text-left">
                {addParentOverride
                  ? addParentOverride.split('/').filter(Boolean).at(-1)
                  : 'Racine de l\'espace'}
              </span>
              <ChevronDown size={11} className={cn('shrink-0 text-holo-text-faint transition-transform', folderPickerOpen && 'rotate-180')} />
            </button>
            {folderPickerOpen && (
              <div className="mt-1 max-h-[160px] overflow-y-auto rounded-holo-lg border border-holo-border-soft bg-holo-bg-elevated shadow-holo-md holo-scrollbar">
                <button
                  type="button"
                  onClick={() => { setAddParentOverride(undefined); setFolderPickerOpen(false) }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-holo-glass-hover',
                    !addParentOverride ? 'text-holo-primary-soft font-medium' : 'text-holo-text-muted',
                  )}
                >
                  <FolderOpen size={11} className="shrink-0" />
                  <span>Racine de l'espace</span>
                </button>
                {getAllFolders(files ?? []).map((folder) => (
                  <button
                    key={folder.path}
                    type="button"
                    onClick={() => { setAddParentOverride(folder.path); setFolderPickerOpen(false) }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition hover:bg-holo-glass-hover',
                      addParentOverride === folder.path ? 'text-holo-primary-soft font-medium' : 'text-holo-text-muted',
                    )}
                  >
                    <Folder size={11} className="shrink-0" />
                    <span className="truncate">{folder.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            ref={addInputRef}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddConfirm()
              if (e.key === 'Escape') { setAddOpen(false); setFolderPickerOpen(false) }
            }}
            placeholder={addType === 'file' ? 'nom-du-fichier.md' : 'nom-du-dossier'}
            className="mb-4 w-full rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text placeholder:text-holo-text-faint focus:border-holo-primary/40 focus:outline-none"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAddOpen(false); setFolderPickerOpen(false) }}
              className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
            >
              Annuler
            </button>
            <button
              onClick={handleAddConfirm}
              disabled={!addName.trim()}
              className="rounded-holo-md bg-holo-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-holo-primary/90 disabled:opacity-40 active:scale-[0.98]"
            >
              Créer
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Menu contextuel clic-droit */}
    {ctxMenu && (
      <ContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu(null)}
        items={[
          { type: 'header', label: `${ctxMenu.node.type === 'folder' ? 'Dossier' : 'Fichier'} · ${ctxMenu.node.name}` },
          { type: 'separator' },
          { type: 'item', label: 'Renommer', icon: Pencil, onClick: () => openRenameDialog(ctxMenu.node) },
          ...(ctxMenu.node.type === 'file' && onToggleFileFavorite ? [{
            type: 'item' as const,
            label: favoriteFilePaths.includes(ctxMenu.node.path) ? 'Retirer des favoris' : 'Mettre en favori',
            icon: Star,
            onClick: () => onToggleFileFavorite(ctxMenu.node.path),
          }] : []),
          ...(ctxMenu.node.type === 'file' && onArchiveItem ? [{
            type: 'item' as const,
            label: 'Archiver',
            icon: Archive,
            onClick: () => { onArchiveItem(ctxMenu.node.path); setCtxMenu(null) },
          }] : []),
          ...(ctxMenu.node.type === 'folder' ? [
            { type: 'item' as const, label: 'Nouveau fichier ici', icon: FilePlus, onClick: () => openAddDialog('file', ctxMenu.node.path) },
            { type: 'item' as const, label: 'Nouveau dossier ici', icon: FolderPlus, onClick: () => openAddDialog('folder', ctxMenu.node.path) },
          ] : []),
          { type: 'separator' },
          { type: 'item', label: 'Supprimer', icon: Trash2, variant: 'danger', onClick: () => onDeleteItem?.(ctxMenu.node.path) },
        ] satisfies ContextMenuAction[]}
      />
    )}

    {/* Dropdown bouton + */}
    {menuAnchorEl && (
      <ContextMenu
        anchorEl={menuAnchorEl}
        anchorAlign="right"
        onClose={() => setMenuAnchorEl(null)}
        items={[
          { type: 'item', label: 'Nouveau fichier', icon: FileText, onClick: () => openAddDialog('file') },
          { type: 'item', label: 'Nouveau dossier', icon: Folder, onClick: () => openAddDialog('folder') },
        ] satisfies ContextMenuAction[]}
      />
    )}

    {/* Dropdown bouton … */}
    {moreMenuAnchorEl && (
      <ContextMenu
        anchorEl={moreMenuAnchorEl}
        anchorAlign="right"
        onClose={() => setMoreMenuAnchorEl(null)}
        items={[
          { type: 'header', label: spaceName },
          { type: 'separator' },
          ...(onToggleFavorite ? [{
            type: 'item' as const,
            label: isFavorite ? 'Retirer des favoris' : 'Mettre en favori',
            icon: Star,
            onClick: () => onToggleFavorite(),
          }] : []),
          ...(isGitRepo && onGitSync ? [{
            type: 'item' as const,
            label: gitSyncing
              ? 'Synchronisation…'
              : `Synchroniser git${gitAhead || gitBehind ? ` ↑${gitAhead} ↓${gitBehind}` : ''}`,
            icon: gitSyncing ? RefreshCw : GitBranch,
            onClick: async () => {
              setGitSyncing(true)
              try { await onGitSync() } finally { setGitSyncing(false) }
            },
          }] : []),
          { type: 'separator' },
          ...(onDetach ? [{
            type: 'item' as const,
            label: 'Dissocier l\'espace',
            icon: Unlink,
            variant: 'danger' as const,
            onClick: () => onDetach(),
          }] : []),
        ] satisfies ContextMenuAction[]}
      />
    )}

    {/* Dialog renommer */}
    {renameOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setRenameOpen(false)}
      >
        <div
          className="w-[320px] rounded-holo-2xl border border-holo-border-soft bg-holo-bg-elevated p-5 shadow-[0_24px_64px_rgba(0,0,0,.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-holo-text">Renommer</h3>
            <button
              onClick={() => setRenameOpen(false)}
              className="flex size-7 items-center justify-center rounded-holo-md text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
            >
              <X size={14} />
            </button>
          </div>
          <input
            ref={renameInputRef}
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm()
              if (e.key === 'Escape') setRenameOpen(false)
            }}
            placeholder="Nouveau nom…"
            className="mb-4 w-full rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text placeholder:text-holo-text-faint focus:border-holo-primary/40 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setRenameOpen(false)}
              className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
            >
              Annuler
            </button>
            <button
              onClick={handleRenameConfirm}
              disabled={!renameName.trim()}
              className="rounded-holo-md bg-holo-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-holo-primary/90 disabled:opacity-40 active:scale-[0.98]"
            >
              Renommer
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}


function treeNodeToSpaceFile(node: TreeNode): SpaceFileNode {
  const ext =
    node.type === 'file' && node.name.includes('.')
      ? node.name.split('.').pop()
      : undefined
  return {
    id: node.path,
    name: node.name,
    type: node.type === 'directory' ? 'folder' : 'file',
    path: node.path,
    extension: ext,
    children: node.children?.map(treeNodeToSpaceFile),
  }
}

export function SpaceRoute({
  onSelectFile,
  selectedFilePath,
  metaOverride,
  isFavorite,
  onToggleFavorite,
  onDetach,
  favoriteFilePaths,
  onToggleFileFavorite,
}: {
  onSelectFile?: (node: SpaceFileNode) => void
  selectedFilePath?: string
  metaOverride?: TreeFileMeta & { path: string }
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onDetach?: () => void
  favoriteFilePaths?: string[]
  onToggleFileFavorite?: (path: string) => void
}) {
  const { encodedPath } = useParams()
  const folderPath = encodedPath ? decodeURIComponent(encodedPath) : null
  const spaceName = folderPath ? getBaseName(folderPath) : ''

  const { rootPath, tree, recentFilePaths, fileMetaByPath, setTree } = useWorkspace()
  const { getHoloApi } = useGetHoloApi()
  const { openRecentFolder } = useWorkspaceFolders({ getHoloApi })

  // Récupération du gitState depuis le ConfigContext
  const { gitState } = useConfig()
  const isGitRepo = gitState.isRepo && gitState.hasRemote

  // ─── Fichiers archivés ────────────────────────────────────────────────────
  const [archivedEntries, setArchivedEntries] = useState<{ archivedPath: string; name: string }[]>([])

  const refreshArchivedEntries = useCallback(async () => {
    try {
      const files = await window.holo?.listArchivedFiles()
      setArchivedEntries(files?.map(f => ({ archivedPath: f.archivedPath, name: f.name })) ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void refreshArchivedEntries() }, [refreshArchivedEntries])

  const handleGitSync = useCallback(async () => {
    try {
      await window.holo?.gitSync()
    } catch (err) {
      console.error('[SpaceRoute] Erreur sync git :', err)
    }
  }, [])

  const handleAddItem = useCallback(async (type: 'file' | 'folder', name: string, parentPath?: string) => {
    const parent = parentPath || rootPath
    if (!parent) return
    try {
      if (type === 'file') {
        await window.holo?.createFile(parent, name)
      } else {
        await window.holo?.createDirectory(parent, name)
      }
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
      // Auto-ouvrir le fichier nouvellement créé
      if (type === 'file') {
        const newPath = `${parent}/${name}`
        onSelectFile?.({ id: newPath, path: newPath, name, type: 'file' })
      }
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[SpaceRoute] Impossible de créer :', err)
    }
  }, [rootPath, setTree, onSelectFile])

  const handleMoveItem = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    try {
      await window.holo?.movePath(sourcePath, targetFolderPath)
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[SpaceRoute] Impossible de déplacer :', err)
    }
  }, [setTree])

  const handleRenameItem = useCallback(async (path: string, newName: string) => {
    try {
      await window.holo?.renamePath(path, newName)
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[SpaceRoute] Impossible de renommer :', err)
    }
  }, [setTree])

  const handleDeleteItem = useCallback(async (path: string) => {
    try {
      await window.holo?.deletePath(path)
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
      window.dispatchEvent(new CustomEvent('holo:close-file', { detail: { path } }))
      // Git : stage la suppression et synchronise
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[SpaceRoute] Impossible de supprimer :', err)
    }
  }, [setTree])

  const handleArchiveItem = useCallback(async (path: string) => {
    try {
      await window.holo?.archivePath(path)
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
      window.dispatchEvent(new CustomEvent('holo:close-file', { detail: { path } }))
      void refreshArchivedEntries()
      // Git : stage le déplacement vers l'archive et synchronise
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[SpaceRoute] Impossible d\'archiver :', err)
    }
  }, [setTree, refreshArchivedEntries])

  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null)
  const requestDeleteItem = useCallback((path: string) => {
    setPendingDeletePath(path)
  }, [])

  const [pendingArchivePath, setPendingArchivePath] = useState<string | null>(null)
  const requestArchiveItem = useCallback((path: string) => {
    setPendingArchivePath(path)
  }, [])

  // Écoute l'événement de rafraîchissement déclenché depuis l'extérieur (ex: archive depuis EditorFrame)
  useEffect(() => {
    const handler = async () => {
      const result = await window.holo?.refreshTree().catch(() => null)
      if (result) setTree(result.tree)
    }
    window.addEventListener('holo:refresh-tree', handler)
    return () => window.removeEventListener('holo:refresh-tree', handler)
  }, [setTree])

  useEffect(() => {
    if (folderPath && folderPath !== rootPath) {
      void openRecentFolder(folderPath)
    }
  }, [folderPath, rootPath, openRecentFolder])

  const files = useMemo(
    () => tree?.children?.map(treeNodeToSpaceFile) ?? [],
    [tree],
  )

  const recentItems = useMemo(
    () =>
      recentFilePaths
        .filter((p) => folderPath !== null && p.startsWith(folderPath + '/'))
        .slice(0, 20)
        .map((p) => {
          const meta = fileMetaByPath[p]
          return {
            id: p,
            title: meta?.title || getBaseName(p),
            path: p,
            subtitle: folderPath ? p.slice(folderPath.length + 1) : p,
          } satisfies SpacePanelItem
        }),
    [recentFilePaths, folderPath, fileMetaByPath],
  )

  const favoriteItems = useMemo(
    () =>
      (favoriteFilePaths ?? [])
        .filter((p) => folderPath === null || p.startsWith(folderPath + '/'))
        .map((p) => {
          const meta = fileMetaByPath[p]
          return {
            id: p,
            title: meta?.title || getBaseName(p),
            path: p,
            subtitle: folderPath ? p.slice(folderPath.length + 1) : p,
          } satisfies SpacePanelItem
        }),
    [favoriteFilePaths, folderPath, fileMetaByPath],
  )

  const archivedItems = useMemo(
    () =>
      archivedEntries
        .filter((e) => folderPath === null || e.archivedPath.includes(folderPath ? getBaseName(folderPath) : ''))
        .slice(0, 10)
        .map((e) => ({
          id: e.archivedPath,
          title: e.name.replace(/\.md$/i, ''),
          path: e.archivedPath,
          subtitle: '.archive/' + e.name,
        } satisfies SpacePanelItem)),
    [archivedEntries, folderPath],
  )

  return (
    <>
      <SpacePanel
        spaceName={spaceName}
        files={files}
        recentItems={recentItems}
        favoriteItems={favoriteItems}
        archivedItems={archivedItems}
        selectedPath={selectedFilePath}
        metaOverride={metaOverride}
        onSelectFile={onSelectFile}
        onAddItem={handleAddItem}
        onMoveItem={handleMoveItem}
        onRenameItem={handleRenameItem}
        onDeleteItem={requestDeleteItem}
        onArchiveItem={requestArchiveItem}
        rootPath={folderPath ?? undefined}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onDetach={onDetach}
        isGitRepo={isGitRepo}
        gitAhead={gitState.outgoing}
        gitBehind={gitState.incoming}
        onGitSync={isGitRepo ? handleGitSync : undefined}
        favoriteFilePaths={favoriteFilePaths}
        onToggleFileFavorite={onToggleFileFavorite}
      />

      {/* Confirmation d'archivage */}
      {pendingArchivePath && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-holo-xl border border-holo-border-soft bg-holo-bg p-6 shadow-[0_24px_80px_rgba(0,0,0,.6)]">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-amber-500/10 text-amber-400">
                <Archive size={16} />
              </div>
              <p className="text-sm font-semibold text-holo-text">Archiver ce fichier ?</p>
            </div>
            <p className="mb-5 ml-12 text-xs text-holo-text-faint">
              « {getBaseName(pendingArchivePath)} » sera déplacé dans l'archive et pourra être restauré.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingArchivePath(null)}
                className="rounded-holo-md border border-holo-border-soft bg-holo-glass px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                Annuler
              </button>
              <button
                onClick={() => { void handleArchiveItem(pendingArchivePath); setPendingArchivePath(null) }}
                className="rounded-holo-md bg-amber-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
              >
                Archiver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation de suppression */}
      {pendingDeletePath && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-holo-xl border border-holo-border-soft bg-holo-bg p-6 shadow-[0_24px_80px_rgba(0,0,0,.6)]">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-red-500/10 text-red-400">
                <Trash2 size={16} />
              </div>
              <p className="text-sm font-semibold text-holo-text">Supprimer cet élément ?</p>
            </div>
            <p className="mb-5 ml-12 text-xs text-holo-text-faint">
              « {getBaseName(pendingDeletePath)} » sera supprimé définitivement.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDeletePath(null)}
                className="rounded-holo-md border border-holo-border-soft bg-holo-glass px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                Annuler
              </button>
              <button
                onClick={() => { void handleDeleteItem(pendingDeletePath); setPendingDeletePath(null) }}
                className="rounded-holo-md bg-red-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}