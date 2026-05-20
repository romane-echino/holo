import { useCallback, useEffect } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { splitMarkdownFrontMatter } from '../lib/markdown'

interface UseSyncWysiwygFromMarkdownParams {
  markdownToHtml: (markdown: string) => string
}

export function useSyncWysiwygFromMarkdown({ markdownToHtml }: UseSyncWysiwygFromMarkdownParams) {
  const { editorMode, activeTab, activeTabPath } = useEditor()
  const { wysiwygEditorRef, isSyncingWysiwygRef, lastWysiwygSyncedTabRef } = useEditorOverlay()

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

  useEffect(() => {
    if (editorMode !== 'wysiwyg' || !activeTabPath || !activeTab) {
      lastWysiwygSyncedTabRef.current = null
      return
    }
    if (lastWysiwygSyncedTabRef.current !== activeTabPath) {
      syncWysiwygFromMarkdown(splitMarkdownFrontMatter(activeTab.content).body)
      lastWysiwygSyncedTabRef.current = activeTabPath
    }
  }, [activeTab, activeTabPath, editorMode, syncWysiwygFromMarkdown, lastWysiwygSyncedTabRef])

  return { syncWysiwygFromMarkdown }
}

