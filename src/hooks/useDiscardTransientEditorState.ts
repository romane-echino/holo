import { useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react'

interface ActiveTab {
  path: string
  name: string
  content: string
  isDirty: boolean
}

interface UseDiscardTransientEditorStateParams {
  wysiwygEditorRef: RefObject<HTMLDivElement | null>
  rawEditorRef: RefObject<HTMLTextAreaElement | null>
  lastWysiwygSyncedTabRef: RefObject<string | null>
  isSyncingWysiwygRef: RefObject<boolean>
  aiSavedRangeRef: RefObject<Range | null>
  linkSavedRangeRef: RefObject<Range | null>
  setActiveTab: Dispatch<SetStateAction<ActiveTab | null>>
  setActiveTabPath: (path: null) => void
  setSelectionPopup: (popup: null) => void
  setTablePopup: (popup: null) => void
  setCodeBlockPopup: (popup: null) => void
  setColumnTypePopup: (popup: null) => void
  setHoveredCodeBlock: (block: null) => void
  setShowCompactToc: (show: boolean) => void
  setSlashMenu: (menu: null) => void
}

export function useDiscardTransientEditorState({
  wysiwygEditorRef,
  rawEditorRef,
  lastWysiwygSyncedTabRef,
  isSyncingWysiwygRef,
  aiSavedRangeRef,
  linkSavedRangeRef,
  setActiveTab,
  setActiveTabPath,
  setSelectionPopup,
  setTablePopup,
  setCodeBlockPopup,
  setColumnTypePopup,
  setHoveredCodeBlock,
  setShowCompactToc,
  setSlashMenu,
}: UseDiscardTransientEditorStateParams) {
  const discardTransientEditorState = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    wysiwygEditorRef.current?.blur()
    rawEditorRef.current?.blur()
    setActiveTab((prev) => (prev ? { ...prev, isDirty: false } : prev))
    setActiveTab(null)
    setActiveTabPath(null)
    lastWysiwygSyncedTabRef.current = null
    isSyncingWysiwygRef.current = false
    aiSavedRangeRef.current = null
    linkSavedRangeRef.current = null
    setSelectionPopup(null)
    setTablePopup(null)
    setCodeBlockPopup(null)
    setColumnTypePopup(null)
    setHoveredCodeBlock(null)
    setShowCompactToc(false)
    setSlashMenu(null)
  }, [
    setActiveTab,
    setActiveTabPath,
    setSelectionPopup,
    setTablePopup,
    setCodeBlockPopup,
    setColumnTypePopup,
    setHoveredCodeBlock,
    setShowCompactToc,
    setSlashMenu,
  ])

  return {
    discardTransientEditorState,
  }
}
