import { useCallback, type RefObject } from 'react'
import { parseMarkdownToHtml } from '../lib/markdown'

interface UseTableDndAndMarkdownConversionParams {
  tableDndCounterRef: RefObject<number>
}

export function useTableDndAndMarkdownConversion({
  tableDndCounterRef,
}: UseTableDndAndMarkdownConversionParams) {
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
