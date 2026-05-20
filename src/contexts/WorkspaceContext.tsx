import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { TreeNode, NodeType, FileMeta } from '../types/app'

export interface WorkspaceContextType {
  // Root & Tree
  rootPath: string | null
  setRootPath: Dispatch<SetStateAction<string | null>>
  tree: TreeNode | null
  setTree: Dispatch<SetStateAction<TreeNode | null>>
  expandedDirectories: Set<string>
  setExpandedDirectories: Dispatch<SetStateAction<Set<string>>>

  // Selected & Dragged
  selectedPath: string | null
  setSelectedPath: Dispatch<SetStateAction<string | null>>
  selectedType: NodeType | null
  setSelectedType: Dispatch<SetStateAction<NodeType | null>>
  draggedPath: string | null
  setDraggedPath: Dispatch<SetStateAction<string | null>>
  dropTargetPath: string | null
  setDropTargetPath: Dispatch<SetStateAction<string | null>>

  // Recent Files & Folders
  recentFolders: string[]
  setRecentFolders: Dispatch<SetStateAction<string[]>>
  recentFilePaths: string[]
  setRecentFilePaths: Dispatch<SetStateAction<string[]>>
  recentFolderIconByPath: Record<string, string>
  setRecentFolderIconByPath: Dispatch<SetStateAction<Record<string, string>>>
  fileIconByPath: Record<string, string>
  setFileIconByPath: Dispatch<SetStateAction<Record<string, string>>>
  folderIconByPath: Record<string, string>
  setFolderIconByPath: Dispatch<SetStateAction<Record<string, string>>>

  // File Metadata
  fileMetaByPath: Record<string, FileMeta>
  setFileMetaByPath: Dispatch<SetStateAction<Record<string, FileMeta>>>
  pathStatsByPath: Record<string, any>
  setPathStatsByPath: Dispatch<SetStateAction<Record<string, any>>>

  // Archived Files
  archivedFiles: any[]
  setArchivedFiles: Dispatch<SetStateAction<any[]>>

  // Sidebar
  activeSidebar: 'files' | 'git' | 'search'
  setActiveSidebar: Dispatch<SetStateAction<'files' | 'git' | 'search'>>
  filesSection: 'explorer' | 'mine' | 'recent'
  setFilesSection: Dispatch<SetStateAction<'explorer' | 'mine' | 'recent'>>

  // Context Menu
  contextMenu: any
  setContextMenu: Dispatch<SetStateAction<any>>
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}

export { WorkspaceContext }
