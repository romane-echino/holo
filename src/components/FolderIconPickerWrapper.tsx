import { FolderIconPickerModal } from './FolderIconPickerModal'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'

interface FolderIconPickerWrapperProps {
  onSaveFolderIconConfig: (path: string, emoji: string) => Promise<void>
}

export function FolderIconPickerWrapper({ onSaveFolderIconConfig }: FolderIconPickerWrapperProps) {
  const { folderIconByPath } = useWorkspace()
  const { showFolderIconPicker, setShowFolderIconPicker } = useUI()

  if (!showFolderIconPicker) return null

  return (
    <FolderIconPickerModal
      folderPath={showFolderIconPicker}
      folderIconByPath={folderIconByPath}
      onSaveFolderIconConfig={onSaveFolderIconConfig}
      onClose={() => setShowFolderIconPicker(null)}
    />
  )
}
