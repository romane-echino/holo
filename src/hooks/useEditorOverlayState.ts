import { useRef, useState } from 'react'

export function useEditorOverlayState() {
  const imageDragDepthRef = useRef(0)
  const tableDndCounterRef = useRef(1)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const wysiwygEditorRef = useRef<HTMLDivElement | null>(null)
  const rawEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const codeBlockLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isSyncingWysiwygRef = useRef(false)
  const lastWysiwygSyncedTabRef = useRef<string | null>(null)
  const [hoveredCodeBlock, setHoveredCodeBlock] = useState<{ x: number; y: number; codeEl: HTMLElement } | null>(null)
  const [pendingTitleFocusPath, setPendingTitleFocusPath] = useState<string | null>(null)
  const [selectionPopup, setSelectionPopup] = useState<{ x: number; y: number } | null>(null)
  const [tablePopup, setTablePopup] = useState<{ x: number; y: number } | null>(null)
  const [codeBlockPopup, setCodeBlockPopup] = useState<{ x: number; y: number; codeEl: HTMLElement } | null>(null)
  const [showCompactToc, setShowCompactToc] = useState(false)
  const [slashMenu, setSlashMenu] = useState<{ x: number; y: number; query: string } | null>(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const slashMenuListRef = useRef<HTMLDivElement | null>(null)
  const compactTocRef = useRef<HTMLDivElement | null>(null)
  const [aiDialog, setAiDialog] = useState<{ mode: 'generate' | 'transform'; prompt: string; isLoading: boolean; selectedText: string; error?: string } | null>(null)
  const aiSavedRangeRef = useRef<Range | null>(null)
  const linkSavedRangeRef = useRef<Range | null>(null)
  const aiTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [columnTypePopup, setColumnTypePopup] = useState<{ x: number; y: number; thEl: HTMLElement } | null>(null)

  return {
    imageDragDepthRef,
    tableDndCounterRef,
    titleInputRef,
    showEmojiPicker,
    setShowEmojiPicker,
    wysiwygEditorRef,
    rawEditorRef,
    codeBlockLeaveTimerRef,
    isSyncingWysiwygRef,
    lastWysiwygSyncedTabRef,
    hoveredCodeBlock,
    setHoveredCodeBlock,
    pendingTitleFocusPath,
    setPendingTitleFocusPath,
    selectionPopup,
    setSelectionPopup,
    tablePopup,
    setTablePopup,
    codeBlockPopup,
    setCodeBlockPopup,
    showCompactToc,
    setShowCompactToc,
    slashMenu,
    setSlashMenu,
    slashMenuIndex,
    setSlashMenuIndex,
    slashMenuListRef,
    compactTocRef,
    aiDialog,
    setAiDialog,
    aiSavedRangeRef,
    linkSavedRangeRef,
    aiTextareaRef,
    columnTypePopup,
    setColumnTypePopup,
  }
}
