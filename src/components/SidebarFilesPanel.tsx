import { ExplorerTreeItem } from './ExplorerTreeItem'
import { getBaseName } from '../lib/appUtils'
import type { TreeNode, NodeType } from '../types/app'

interface SidebarFilesPanelProps {
  isCompactLayout: boolean
  rootPath: string | null
  filesSection: 'explorer' | 'mine' | 'recent'
  setFilesSection: (s: 'explorer' | 'mine' | 'recent') => void
  appAuthor: string
  setAppAuthor: (v: string) => void
  recentFolders: string[]
  recentFolderIconByPath: Record<string, string>
  tree: TreeNode | null
  selectedPath: string | null
  fileIconByPath: Record<string, string>
  folderIconByPath: Record<string, string>
  fileMetaByPath: Record<string, any>
  expandedDirectories: Set<string>
  draggedPath: string | null
  dropTargetPath: string | null
  myFilePaths: string[]
  visibleRecentFilePaths: string[]
  desktopApiAvailable: boolean
  onCloseFolder: () => void
  onOpenFolder: () => void
  onOpenCloneDialog: () => void
  onOpenRecentFolder: (path: string) => Promise<void>
  onRemoveRecentFolder: (path: string) => Promise<void>
  onSelectNode: (node: TreeNode) => void
  onContextMenu: (node: TreeNode, pos: { x: number; y: number }) => void
  onToggleDirectory: (path: string) => void
  onDragStart: (node: TreeNode) => void
  onDragEnd: () => void
  onDragOverDirectory: (node: TreeNode) => void
  onDragLeaveDirectory: (node: TreeNode) => void
  onDropOnDirectory: (node: TreeNode) => void
  onOpenFile: (path: string) => Promise<void>
  setSelectedPath: (path: string | null) => void
  setSelectedType: (type: NodeType | null) => void
}

export function SidebarFilesPanel({
  isCompactLayout,
  rootPath,
  filesSection,
  setFilesSection,
  appAuthor,
  setAppAuthor,
  recentFolders,
  recentFolderIconByPath,
  tree,
  selectedPath,
  fileIconByPath,
  folderIconByPath,
  fileMetaByPath,
  expandedDirectories,
  draggedPath,
  dropTargetPath,
  myFilePaths,
  visibleRecentFilePaths,
  desktopApiAvailable,
  onCloseFolder,
  onOpenFolder,
  onOpenCloneDialog,
  onOpenRecentFolder,
  onRemoveRecentFolder,
  onSelectNode,
  onContextMenu,
  onToggleDirectory,
  onDragStart,
  onDragEnd,
  onDragOverDirectory,
  onDragLeaveDirectory,
  onDropOnDirectory,
  onOpenFile,
  setSelectedPath,
  setSelectedType,
}: SidebarFilesPanelProps) {
  return (
    <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>

      {/* Titre du dossier */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white/80 truncate">
          {rootPath ? `Dossier ${getBaseName(rootPath)}` : 'Aucun dossier'}
        </h2>
        {rootPath && (
          <button
            className="size-6 shrink-0 rounded border border-white/10 text-white/55 hover:text-white hover:border-white/30 flex items-center justify-center"
            onClick={onCloseFolder}
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
              onClick={() => void onOpenFolder()}
              title="Ouvrir un dossier"
            >
              <i className="fa-solid fa-folder-open mr-1" />
              Ouvrir un dossier
            </button>
            <button
              className="rounded px-2.5 py-1.5 text-xs font-medium border border-white/15 text-white/85 hover:bg-white/10"
              onClick={onOpenCloneDialog}
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
                      onClick={() => void onOpenRecentFolder(folderPath)}
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
                        void onRemoveRecentFolder(folderPath)
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
          <ExplorerTreeItem
            node={tree}
            selectedPath={selectedPath}
            fileIconByPath={fileIconByPath}
            folderIconByPath={folderIconByPath}
            fileMetaByPath={fileMetaByPath}
            onSelect={onSelectNode}
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
              Aucun fichier trouvé pour l'auteur "{appAuthor}".
            </p>
          ) : (
            <ul className="space-y-1">
              {myFilePaths.map((filePath) => (
                <li key={filePath}>
                  <button
                    className={`w-full truncate rounded px-2 py-1 text-left text-xs ${selectedPath === filePath ? 'bg-[#7B61FF]/20 text-[#9d8bff]' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                    onClick={() => void onOpenFile(filePath)}
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
                      void onOpenFile(filePath)
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
  )
}
