import { useCallback, type RefObject } from 'react'

interface UseFocusActiveEditorParams {
  effectiveEditorMode: 'raw' | 'wysiwyg'
  isEditorReadOnly: boolean
  rawEditorRef: RefObject<HTMLTextAreaElement | null>
  wysiwygEditorRef: RefObject<HTMLDivElement | null>
}

export function useFocusActiveEditor({
  effectiveEditorMode,
  isEditorReadOnly,
  rawEditorRef,
  wysiwygEditorRef,
}: UseFocusActiveEditorParams) {
  const focusActiveEditorSoon = useCallback(() => {
    window.setTimeout(() => {
      if (effectiveEditorMode === 'raw') {
        rawEditorRef.current?.focus()
        return
      }

      if (!isEditorReadOnly) {
        wysiwygEditorRef.current?.focus()
      }
    }, 0)
  }, [effectiveEditorMode, isEditorReadOnly, rawEditorRef, wysiwygEditorRef])

  return {
    focusActiveEditorSoon,
  }
}
