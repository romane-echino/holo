import { useCallback } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useDiscardTransientEditorState() {
  const { setActiveTab, setActiveTabPath } = useEditor()
  const {
    wysiwygEditorRef, rawEditorRef, lastWysiwygSyncedTabRef, isSyncingWysiwygRef,
    aiSavedRangeRef, linkSavedRangeRef, setSelectionPopup, setTablePopup,
    setCodeBlockPopup, setColumnTypePopup, setHoveredCodeBlock, setShowCompactToc, setSlashMenu,
  } = useEditorOverlay()

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
    setActiveTab, setActiveTabPath, setSelectionPopup, setTablePopup,
    setCodeBlockPopup, setColumnTypePopup, setHoveredCodeBlock, setShowCompactToc, setSlashMenu,
    wysiwygEditorRef, rawEditorRef, lastWysiwygSyncedTabRef, isSyncingWysiwygRef,
    aiSavedRangeRef, linkSavedRangeRef,
  ])

  return { discardTransientEditorState }
}
