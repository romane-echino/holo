import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../utils/global'
import { useParams } from 'react-router-dom'
import { getBaseName } from '../lib/appUtils'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useGetHoloApi } from '../hooks/useGetHoloApi'
import { useWorkspaceFolders } from '../hooks/useWorkspaceFolders'
import type { TreeNode } from '../types/app'
import { Folder, FolderOpen, FileText, File, ChevronRight, Plus, Search, X } from 'lucide-react'
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
  selectedPath?: string
  rootPath?: string
  onSelectFile?: (node: SpaceFileNode) => void
  onAddItem?: (type: 'file' | 'folder', name: string, parentPath?: string) => void
  onMoveItem?: (sourcePath: string, targetFolderPath: string) => void
  onSearch?: (query: string) => void
}



const tabClassName =
  'flex flex-1 items-center justify-center rounded-holo-md px-2 py-2 text-sm transition active:scale-[0.99]'

// ─── Métadonnées fichier (frontmatter) ───────────────────────────────────────

type TreeFileMeta = { title?: string; description?: string; icon?: string }

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
}) {
  const isFolder = node.type === 'folder'
  const isExpanded = expanded.has(node.path)
  const isSelected = activePath === node.path
  const hasChildren = Boolean(node.children?.length)
  const FileIcon = getFileIcon(node)
  const isDragOver = drag?.dragOverPath === node.path && isFolder
  const meta = !isFolder ? fileMeta?.[node.path] : undefined
  const displayTitle = meta?.title || node.name
  const displayIcon = meta?.icon
  const displayDesc = meta?.description

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
        className={cn(
          'group flex min-h-9 w-full items-center gap-2 rounded-holo-md py-2 pr-2 text-left text-sm transition hover:bg-holo-glass-hover hover:text-holo-text',
          isSelected
            ? 'bg-holo-primary-surface text-holo-primary-soft ring-1 ring-holo-primary/20'
            : 'text-holo-text-muted',
          isDragOver && 'ring-1 ring-holo-primary/50 bg-holo-primary-surface/60 text-holo-primary-soft',
        )}
        style={{ paddingLeft: `${10 + level * 14}px` }}
        title={node.path}
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
}: {
  items?: SpacePanelItem[]
  emptyTitle: string
  emptyDescription: string
}) {
  if (!items?.length) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="space-y-1">
      {items?.map((item) => {
        const ItemIcon = item.icon ?? FileText
        return (
        <button
          key={item.id}
          className="group w-full rounded-holo-md px-3 py-2 text-left transition hover:bg-holo-glass-hover"
          title={item.path}
        >
          <div className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center text-holo-text-faint group-hover:text-holo-text-muted">
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
  selectedPath,
  rootPath,
  onSelectFile,
  onAddItem,
  onMoveItem,
  onSearch,
}: SpacePanelProps) {
  const [tab, setTab] = useState<SpacePanelTab>('browse')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['/docs', '/docs/architecture']))
  const [selectedFolderPath, setSelectedFolderPath] = useState('')

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
  const addInputRef = useRef<HTMLInputElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [menuOpen])

  const openAddDialog = useCallback((type: 'file' | 'folder') => {
    setAddType(type)
    setAddName('')
    setAddOpen(true)
    setTimeout(() => addInputRef.current?.focus(), 50)
  }, [])

  const handleAddConfirm = useCallback(() => {
    let name = addName.trim()
    if (!name) return
    if (addType === 'file' && !name.includes('.')) name += '.md'
    onAddItem?.(addType, name, selectedFolderPath || undefined)
    setAddOpen(false)
    setAddName('')
  }, [addName, addType, onAddItem, selectedFolderPath])

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
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex size-8 shrink-0 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-primary-soft active:scale-[0.98]"
            title="Nouveau…"
            aria-label="Nouveau…"
          >
            <Plus size={13} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1.5 w-48 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg-elevated shadow-[0_12px_40px_rgba(0,0,0,.4)]">
              <button
                onClick={() => { setMenuOpen(false); openAddDialog('file') }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                <FileText size={13} className="shrink-0 text-holo-text-faint" />
                Nouveau fichier
              </button>
              <button
                onClick={() => { setMenuOpen(false); openAddDialog('folder') }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                <Folder size={13} className="shrink-0 text-holo-text-faint" />
                Nouveau dossier
              </button>
            </div>
          )}
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
        <ItemList
          items={recentItems}
          emptyTitle="Aucun fichier récent"
          emptyDescription="Les documents ouverts récemment apparaîtront ici."
        />
      )}

      {tab === 'favorites' && (
        <ItemList
          items={favoriteItems}
          emptyTitle="Aucun favori"
          emptyDescription="Marque des documents comme favoris pour les retrouver rapidement."
        />
      )}
    </AbstractPanel>

    {addOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={() => setAddOpen(false)}
      >
        <div
          className="w-[320px] rounded-holo-2xl border border-holo-border-soft bg-holo-bg-elevated p-5 shadow-[0_24px_64px_rgba(0,0,0,.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-holo-text">
              {addType === 'file' ? 'Nouveau fichier' : 'Nouveau dossier'}
            </h3>
            <button
              onClick={() => setAddOpen(false)}
              className="flex size-7 items-center justify-center rounded-holo-md text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
            >
              <X size={14} />
            </button>
          </div>

          {selectedFolderPath && (
            <div className="mb-3 flex items-center gap-1.5 rounded-holo-md bg-holo-glass px-2.5 py-1.5 text-xs text-holo-text-faint">
              <Folder size={11} className="shrink-0" />
              <span className="truncate">{selectedFolderPath.split('/').filter(Boolean).at(-1)}</span>
            </div>
          )}

          <input
            ref={addInputRef}
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddConfirm()
              if (e.key === 'Escape') setAddOpen(false)
            }}
            placeholder={addType === 'file' ? 'nom-du-fichier.md' : 'nom-du-dossier'}
            className="mb-4 w-full rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text placeholder:text-holo-text-faint focus:border-holo-primary/40 focus:outline-none"
          />

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAddOpen(false)}
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
}: {
  onSelectFile?: (node: SpaceFileNode) => void
  selectedFilePath?: string
}) {
  const { encodedPath } = useParams()
  const folderPath = encodedPath ? decodeURIComponent(encodedPath) : null
  const spaceName = folderPath ? getBaseName(folderPath) : ''

  const { rootPath, tree, recentFilePaths, fileMetaByPath, setTree } = useWorkspace()
  const { getHoloApi } = useGetHoloApi()
  const { openRecentFolder } = useWorkspaceFolders({ getHoloApi })

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
    } catch (err) {
      console.error('[SpaceRoute] Impossible de créer :', err)
    }
  }, [rootPath, setTree, onSelectFile])

  const handleMoveItem = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    try {
      await window.holo?.movePath(sourcePath, targetFolderPath)
      const result = await window.holo?.refreshTree()
      if (result) setTree(result.tree)
    } catch (err) {
      console.error('[SpaceRoute] Impossible de déplacer :', err)
    }
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

  return (
    <SpacePanel
      spaceName={spaceName}
      files={files}
      recentItems={recentItems}
      favoriteItems={[]}
      selectedPath={selectedFilePath}
      onSelectFile={onSelectFile}
      onAddItem={handleAddItem}
      onMoveItem={handleMoveItem}
      rootPath={folderPath ?? undefined}
    />
  )
}