import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { useIsEditorReadOnly } from './useIsEditorReadOnly'

type TurndownLike = {
  turndown: (input: string) => string
}

type UseWysiwygInputHandlerParams = {
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
  refreshTableSummaries: () => void
}

export function useWysiwygInputHandler({
  getBlockTextBeforeCursor,
  turndownService,
  updateActiveTabBody,
  refreshTableSummaries,
}: UseWysiwygInputHandlerParams) {
  const isEditorReadOnly = useIsEditorReadOnly()
  const { wysiwygEditorRef, isSyncingWysiwygRef, slashMenu, setSlashMenu } = useEditorOverlay()

  const onWysiwygInput = useCallback(() => {
    const editor = wysiwygEditorRef.current

    if (!editor || isSyncingWysiwygRef.current || isEditorReadOnly) {
      return
    }

    const { text } = getBlockTextBeforeCursor()
    if (slashMenu && text.startsWith('/')) {
      setSlashMenu((previous) => (previous ? { ...previous, query: text.slice(1).toLowerCase() } : null))
      return
    }

    const markdown = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(markdown)
    refreshTableSummaries()
  }, [
    getBlockTextBeforeCursor,
    isEditorReadOnly,
    isSyncingWysiwygRef,
    refreshTableSummaries,
    setSlashMenu,
    slashMenu,
    turndownService,
    updateActiveTabBody,
    wysiwygEditorRef,
  ])

  return { onWysiwygInput }
}
