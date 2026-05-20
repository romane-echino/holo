import { ContextMenuPopup } from './ContextMenuPopup'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'
import type { NodeType } from '../types/app'

interface ContextMenuWrapperProps {
  onRunContextAction: (action: () => void) => void
  onOpenCreateFileDialog: (path?: string | null, type?: NodeType | null) => void
  onOpenCreateDirectoryDialog: (path?: string | null, type?: NodeType | null) => void
  onOpenRenameDialog: (path: string) => void
  onToggleTemplateStatus: (path: string, isTemplate: boolean) => Promise<void>
  onCopyHoloLink: (path: string) => Promise<void>
  onCopyPathTarget: (path: string) => Promise<void>
  onOpenFileInNewWindow: (path: string) => Promise<void>
  onArchivePathTarget: (path: string) => Promise<void>
  onRestoreArchivedPathTarget: (path: string) => Promise<void>
  onDeletePathTarget: (path: string) => Promise<void>
}

export function ContextMenuWrapper({
  onRunContextAction,
  onOpenCreateFileDialog,
  onOpenCreateDirectoryDialog,
  onOpenRenameDialog,
  onToggleTemplateStatus,
  onCopyHoloLink,
  onCopyPathTarget,
  onOpenFileInNewWindow,
  onArchivePathTarget,
  onRestoreArchivedPathTarget,
  onDeletePathTarget,
}: ContextMenuWrapperProps) {
  const { contextMenu, rootPath, fileMetaByPath } = useWorkspace()
  const { setShowFolderIconPicker } = useUI()

  if (!contextMenu) return null

  return (
    <ContextMenuPopup
      contextMenu={contextMenu}
      rootPath={rootPath}
      fileMetaByPath={fileMetaByPath}
      onRunContextAction={onRunContextAction}
      onOpenCreateFileDialog={onOpenCreateFileDialog}
      onOpenCreateDirectoryDialog={onOpenCreateDirectoryDialog}
      onSetShowFolderIconPicker={setShowFolderIconPicker}
      onOpenRenameDialog={onOpenRenameDialog}
      onToggleTemplateStatus={onToggleTemplateStatus}
      onCopyHoloLink={onCopyHoloLink}
      onCopyPathTarget={onCopyPathTarget}
      onOpenFileInNewWindow={onOpenFileInNewWindow}
      onArchivePathTarget={onArchivePathTarget}
      onRestoreArchivedPathTarget={onRestoreArchivedPathTarget}
      onDeletePathTarget={onDeletePathTarget}
    />
  )
}
