import { useMemo } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { splitMarkdownFrontMatter } from '../lib/markdown'

export type TocItem = {
  level: number
  text: string
  headingIndex: number
}

export function useTocItems(): TocItem[] {
  const { activeTab } = useEditor()
  const activeTabBody = useMemo(
    () => splitMarkdownFrontMatter(activeTab?.content ?? '').body,
    [activeTab?.content],
  )
  return useMemo<TocItem[]>(() => {
    const lines = activeTabBody.split('\n')
    const items: TocItem[] = []
    let inCodeFence = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (/^(```|~~~)/.test(trimmed)) {
        inCodeFence = !inCodeFence
        continue
      }

      if (inCodeFence) continue

      const match = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!match) continue

      const level = match[1].length
      const text = match[2]
        .replace(/\[(.*)\]\((.*)\)/g, '$1')
        .replace(/[*_`~]/g, '')
        .trim()

      if (!text) continue

      items.push({ level, text, headingIndex: items.length })
    }

    return items
  }, [activeTabBody])
}
