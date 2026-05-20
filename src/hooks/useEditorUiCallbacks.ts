import { useCallback } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useUI } from '../contexts/UIContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useEditorUiCallbacks({
  pullChanges,
  turndownService,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
  onTocItemClick,
  exportActiveFileToPdf,
  saveCurrentFile,
}: {
  pullChanges: () => Promise<void>
  turndownService: { turndown: (html: string) => string }
  updateActiveTabBody: (content: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
  onTocItemClick: (headingIndex: number) => void
  exportActiveFileToPdf: () => Promise<void>
  saveCurrentFile: () => Promise<void>
}) {
  const { readOnlyMode, setEditorMode } = useEditor()
  const { setLinkDialog } = useUI()
  const {
    linkSavedRangeRef, aiSavedRangeRef, wysiwygEditorRef, setAiDialog,
    setSelectionPopup, setColumnTypePopup, setCodeBlockPopup, setHoveredCodeBlock, setShowCompactToc,
  } = useEditorOverlay()

  const onPullNow = useCallback(() => {
    void pullChanges()
  }, [pullChanges])

  const onOpenLinkFromSelection = useCallback(() => {
    const sel = window.getSelection()
    const selectedText = sel?.toString() ?? ''
    linkSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setSelectionPopup(null)
    setLinkDialog({ text: selectedText, url: 'https://', pageQuery: '' })
  }, [linkSavedRangeRef, setSelectionPopup, setLinkDialog])

  const onOpenAiTransformFromSelection = useCallback(() => {
    const sel = window.getSelection()
    const selectedText = sel?.toString() ?? ''
    aiSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
    setSelectionPopup(null)
    wysiwygEditorRef.current?.blur()
    setAiDialog({ mode: 'transform', prompt: '', isLoading: false, selectedText })
  }, [aiSavedRangeRef, setSelectionPopup, wysiwygEditorRef, setAiDialog])

  const onCloseColumnTypePopup = useCallback(() => {
    setColumnTypePopup(null)
  }, [setColumnTypePopup])

  const onApplyCodeLanguage = useCallback(
    (lang: string, codeEl: HTMLElement) => {
      const toRemove = Array.from(codeEl.classList).filter((c) => c.startsWith('language-') || c === 'hljs')
      toRemove.forEach((c) => codeEl.classList.remove(c))
      codeEl.className = `language-${lang}`
      setCodeBlockPopup(null)
      setHoveredCodeBlock(null)
      const editor = wysiwygEditorRef.current
      if (editor) {
        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
        syncWysiwygFromMarkdown(md)
      }
    },
    [
      setCodeBlockPopup,
      setHoveredCodeBlock,
      wysiwygEditorRef,
      turndownService,
      updateActiveTabBody,
      syncWysiwygFromMarkdown,
    ],
  )

  const onToggleCompactToc = useCallback(() => {
    setShowCompactToc((prev) => !prev)
  }, [setShowCompactToc])

  const onCompactTocItemClick = useCallback(
    (headingIndex: number) => {
      onTocItemClick(headingIndex)
      setShowCompactToc(false)
    },
    [onTocItemClick, setShowCompactToc],
  )

  const onEditorSwitchRaw = useCallback(() => {
    if (!readOnlyMode) {
      setEditorMode('raw')
    }
  }, [readOnlyMode, setEditorMode])

  const onEditorSwitchWysiwyg = useCallback(() => {
    setEditorMode('wysiwyg')
  }, [setEditorMode])

  const onEditorExportPdf = useCallback(() => {
    void exportActiveFileToPdf()
  }, [exportActiveFileToPdf])

  const onEditorSave = useCallback(() => {
    void saveCurrentFile()
  }, [saveCurrentFile])

  return {
    onPullNow,
    onOpenLinkFromSelection,
    onOpenAiTransformFromSelection,
    onCloseColumnTypePopup,
    onApplyCodeLanguage,
    onToggleCompactToc,
    onCompactTocItemClick,
    onEditorSwitchRaw,
    onEditorSwitchWysiwyg,
    onEditorExportPdf,
    onEditorSave,
  }
}
