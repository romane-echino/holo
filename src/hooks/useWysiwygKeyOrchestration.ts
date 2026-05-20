import { useCallback, type RefObject } from 'react'

interface UseWysiwygKeyOrchestrationParams {
  wysiwygEditorRef: RefObject<HTMLDivElement | null>
  handleWysiwygKeyGuards: (event: React.KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement) => boolean
  handleSlashMenuKeyboard: (event: React.KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement) => boolean
  handleWysiwygTabNavigation: (event: React.KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement) => boolean
  handleWysiwygStructuralKeys: (event: React.KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement) => boolean
}

export function useWysiwygKeyOrchestration({
  wysiwygEditorRef,
  handleWysiwygKeyGuards,
  handleSlashMenuKeyboard,
  handleWysiwygTabNavigation,
  handleWysiwygStructuralKeys,
}: UseWysiwygKeyOrchestrationParams) {
  const onWysiwygKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      if (handleWysiwygKeyGuards(event, editor)) {
        return
      }

      if (handleSlashMenuKeyboard(event, editor)) {
        return
      }

      if (handleWysiwygTabNavigation(event, editor)) {
        return
      }

      if (handleWysiwygStructuralKeys(event, editor)) {
        return
      }
    },
    [handleSlashMenuKeyboard, handleWysiwygKeyGuards, handleWysiwygStructuralKeys, handleWysiwygTabNavigation, wysiwygEditorRef],
  )

  return {
    onWysiwygKeyDown,
  }
}
