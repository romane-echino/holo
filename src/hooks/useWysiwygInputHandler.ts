import { useCallback, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react'

type TurndownLike = {
  turndown: (input: string) => string
}

type SlashMenuState = { x: number; y: number; query: string } | null

type UseWysiwygInputHandlerParams = {
  wysiwygEditorRef: RefObject<HTMLDivElement | null>
  isSyncingWysiwygRef: MutableRefObject<boolean>
  isEditorReadOnly: boolean
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
  slashMenu: SlashMenuState
  setSlashMenu: Dispatch<SetStateAction<SlashMenuState>>
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
  refreshTableSummaries: () => void
}

export function useWysiwygInputHandler({
  wysiwygEditorRef,
  isSyncingWysiwygRef,
  isEditorReadOnly,
  getBlockTextBeforeCursor,
  slashMenu,
  setSlashMenu,
  turndownService,
  updateActiveTabBody,
  refreshTableSummaries,
}: UseWysiwygInputHandlerParams) {
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
