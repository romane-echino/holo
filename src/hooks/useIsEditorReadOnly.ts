import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'

export function useIsEditorReadOnly(): boolean {
  const { readOnlyMode } = useEditor()
  const { remoteEditBlock } = useConfig()
  return readOnlyMode || remoteEditBlock.isBlocked
}
