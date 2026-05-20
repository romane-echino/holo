import { useCallback } from 'react'
import { parseMarkdownToHtml } from '../lib/markdown'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useTableDndAndMarkdownConversion() {
  const { tableDndCounterRef } = useEditorOverlay()
  const getNextTableDndId = useCallback(() => {
    const next = tableDndCounterRef.current
    tableDndCounterRef.current += 1
    return `table-dnd-${next}`
  }, [tableDndCounterRef])

  const markdownToHtml = useCallback(
    (markdown: string) => parseMarkdownToHtml(markdown, getNextTableDndId),
    [getNextTableDndId],
  )

  return {
    getNextTableDndId,
    markdownToHtml,
  }
}
