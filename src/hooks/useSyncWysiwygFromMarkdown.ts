import { useCallback, type RefObject } from 'react'

interface UseSyncWysiwygFromMarkdownParams {
  wysiwygEditorRef: RefObject<HTMLDivElement | null>
  isSyncingWysiwygRef: RefObject<boolean>
  markdownToHtml: (markdown: string) => string
}

export function useSyncWysiwygFromMarkdown({
  wysiwygEditorRef,
  isSyncingWysiwygRef,
  markdownToHtml,
}: UseSyncWysiwygFromMarkdownParams) {
  const syncWysiwygFromMarkdown = useCallback(
    (markdown: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      isSyncingWysiwygRef.current = true
      editor.innerHTML = markdownToHtml(markdown)
      isSyncingWysiwygRef.current = false
    },
    [markdownToHtml, wysiwygEditorRef, isSyncingWysiwygRef],
  )

  return {
    syncWysiwygFromMarkdown,
  }
}
