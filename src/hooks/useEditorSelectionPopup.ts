import { useEffect } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useEditorSelectionPopup() {
  const { wysiwygEditorRef, setSelectionPopup, setTablePopup, setCodeBlockPopup } = useEditorOverlay()

  useEffect(() => {
    const onSelectionChange = () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      const selection = window.getSelection()
      if (!selection || !editor.contains(selection.anchorNode)) {
        setSelectionPopup(null)
        setTablePopup(null)
        setCodeBlockPopup(null)
        return
      }

      const anchorElement =
        selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement ?? null
      const currentTable = anchorElement?.closest('table')

      if (currentTable) {
        const rect = currentTable.getBoundingClientRect()
        setTablePopup({ x: rect.right - 8, y: rect.top - 10 })
      } else {
        setTablePopup(null)
      }

      if (selection.isCollapsed) {
        setSelectionPopup(null)
        return
      }

      if (selection.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect()
        setSelectionPopup({ x: rect.left + rect.width / 2, y: rect.top - 8 })
      }
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [setCodeBlockPopup, setSelectionPopup, setTablePopup, wysiwygEditorRef])
}

  wysiwygEditorRef,
  setSelectionPopup,
  setTablePopup,
  setCodeBlockPopup,
}: UseEditorSelectionPopupParams) {
  useEffect(() => {
    const onSelectionChange = () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      const selection = window.getSelection()
      if (!selection || !editor.contains(selection.anchorNode)) {
        setSelectionPopup(null)
        setTablePopup(null)
        setCodeBlockPopup(null)
        return
      }

      const anchorElement =
        selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement ?? null
      const currentTable = anchorElement?.closest('table')

      if (currentTable) {
        const rect = currentTable.getBoundingClientRect()
        setTablePopup({ x: rect.right - 8, y: rect.top - 10 })
      } else {
        setTablePopup(null)
      }

      const currentPre = anchorElement?.closest('pre')
      if (!currentPre) {
        // Don't clear hoveredCodeBlock here — handled by onMouseLeave
      }

      if (selection.isCollapsed) {
        setSelectionPopup(null)
        return
      }

      if (selection.rangeCount) {
        const rect = selection.getRangeAt(0).getBoundingClientRect()
        setSelectionPopup({ x: rect.left + rect.width / 2, y: rect.top - 8 })
      }
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [setCodeBlockPopup, setSelectionPopup, setTablePopup, wysiwygEditorRef])
}
