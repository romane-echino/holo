import { SidebarFilesPanel } from './SidebarFilesPanel'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useConfig } from '../contexts/ConfigContext'
import { isSameOrChildPath } from '../lib/appUtils'
import type { TreeNode } from '../types/app'

interface SidebarFilesPanelWrapperProps {
  isCompactLayout: boolean
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
  moveNode: (from: string, to: string) => Promise<void>
  onOpenFile: (path: string) => Promise<void>
}

export function SidebarFilesPanelWrapper({
  isCompactLayout,
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
  moveNode,
  onOpenFile,
}: SidebarFilesPanelWrapperProps) {
  const {
    rootPath, filesSection, setFilesSection,
    recentFolders, recentFolderIconByPath,
    tree, selectedPath, fileIconByPath, folderIconByPath, fileMetaByPath,
    expandedDirectories, draggedPath, dropTargetPath,
    setSelectedPath, setSelectedType, setDraggedPath, setDropTargetPath,
  } = useWorkspace()
  const { appAuthor, setAppAuthor } = useConfig()

  return (
    <SidebarFilesPanel
      isCompactLayout={isCompactLayout}
      rootPath={rootPath}
      filesSection={filesSection}
      setFilesSection={setFilesSection}
      appAuthor={appAuthor}
      setAppAuthor={setAppAuthor}
      recentFolders={recentFolders}
      recentFolderIconByPath={recentFolderIconByPath}
      tree={tree}
      selectedPath={selectedPath}
      fileIconByPath={fileIconByPath}
      folderIconByPath={folderIconByPath}
      fileMetaByPath={fileMetaByPath}
      expandedDirectories={expandedDirectories}
      draggedPath={draggedPath}
      dropTargetPath={dropTargetPath}
      myFilePaths={myFilePaths}
      visibleRecentFilePaths={visibleRecentFilePaths}
      desktopApiAvailable={desktopApiAvailable}
      onCloseFolder={onCloseFolder}
      onOpenFolder={onOpenFolder}
      onOpenCloneDialog={onOpenCloneDialog}
      onOpenRecentFolder={onOpenRecentFolder}
      onRemoveRecentFolder={onRemoveRecentFolder}
      onSelectNode={onSelectNode}
      onContextMenu={onContextMenu}
      onToggleDirectory={onToggleDirectory}
      onDragStart={(node: TreeNode) => setDraggedPath(node.path)}
      onDragEnd={() => { setDraggedPath(null); setDropTargetPath(null) }}
      onDragOverDirectory={(node: TreeNode) => {
        if (!draggedPath || draggedPath === node.path || isSameOrChildPath(draggedPath, node.path)) return
        setDropTargetPath(node.path)
      }}
      onDragLeaveDirectory={(node: TreeNode) => { if (dropTargetPath === node.path) setDropTargetPath(null) }}
      onDropOnDirectory={(node: TreeNode) => { if (draggedPath) void moveNode(draggedPath, node.path) }}
      onOpenFile={onOpenFile}
      setSelectedPath={setSelectedPath}
      setSelectedType={setSelectedType}
    />
  )
}
