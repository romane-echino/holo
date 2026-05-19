import { useCallback } from 'react'

type AiDialogState = {
  mode: 'generate' | 'transform'
  prompt: string
  isLoading: boolean
  selectedText: string
  error?: string
}

type LinkDialogState = {
  text: string
  url: string
  pageQuery?: string
}

type UseEditorUiCallbacksParams = {
  pullChanges: () => Promise<void>
  linkSavedRangeRef: React.RefObject<Range | null>
  aiSavedRangeRef: React.RefObject<Range | null>
  wysiwygEditorRef: React.RefObject<HTMLDivElement | null>
  setSelectionPopup: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  setLinkDialog: React.Dispatch<React.SetStateAction<LinkDialogState | null>>
  setAiDialog: React.Dispatch<React.SetStateAction<AiDialogState | null>>
  setColumnTypePopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; thEl: HTMLElement } | null>>
  setCodeBlockPopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
  setHoveredCodeBlock: React.Dispatch<React.SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
  turndownService: { turndown: (html: string) => string }
  updateActiveTabBody: (content: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
  setShowCompactToc: React.Dispatch<React.SetStateAction<boolean>>
  onTocItemClick: (headingIndex: number) => void
  readOnlyMode: boolean
  setEditorMode: React.Dispatch<React.SetStateAction<'raw' | 'wysiwyg'>>
  exportActiveFileToPdf: () => Promise<void>
  saveCurrentFile: () => Promise<void>
}

export function useEditorUiCallbacks({
  pullChanges,
  linkSavedRangeRef,
  aiSavedRangeRef,
  wysiwygEditorRef,
  setSelectionPopup,
  setLinkDialog,
  setAiDialog,
  setColumnTypePopup,
  setCodeBlockPopup,
  setHoveredCodeBlock,
  turndownService,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
  setShowCompactToc,
  onTocItemClick,
  readOnlyMode,
  setEditorMode,
  exportActiveFileToPdf,
  saveCurrentFile,
}: UseEditorUiCallbacksParams) {
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
