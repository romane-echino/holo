import React from 'react'

type TocItem = {
  level: number
  text: string
  headingIndex: number
}

type EditorRightTocProps = {
  editorMode: 'raw' | 'wysiwyg'
  tocItems: TocItem[]
  onTocItemClick: (headingIndex: number) => void
}

function computeTocNumbers(items: TocItem[]): string[] {
  const counters: Record<number, number> = {}
  return items.map(item => {
    const level = item.level
    counters[level] = (counters[level] ?? 0) + 1
    Object.keys(counters).forEach(k => {
      if (Number(k) > level) delete counters[Number(k)]
    })
    const minLevel = Math.min(...Object.keys(counters).map(Number))
    const parts: number[] = []
    for (let l = minLevel; l <= level; l++) parts.push(counters[l] ?? 0)
    return parts.join('.')
  })
}

export const EditorRightToc: React.FC<EditorRightTocProps> = ({
  editorMode,
  tocItems,
  onTocItemClick,
}) => {
  if (!(editorMode === 'wysiwyg' && tocItems.length > 0)) {
    return null
  }

  const numbers = computeTocNumbers(tocItems)

  return (
    <aside className="hidden xl:flex xl:w-52 shrink-0 flex-col overflow-y-auto border-l border-white/5 pt-12 pr-4 pl-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/30">
        Table des matières
      </p>
      <nav className="space-y-0.5">
        {tocItems.map((item, i) => (
          <button
            key={`${item.headingIndex}-${item.text}`}
            className="flex w-full items-baseline gap-1.5 rounded px-2 py-1 text-left text-[11px] text-white/50 hover:bg-white/8 hover:text-white/90 transition-colors"
            style={{ paddingLeft: `${Math.min((item.level - 1) * 10 + 8, 36)}px` }}
            onClick={() => onTocItemClick(item.headingIndex)}
            title={item.text}
          >
            <span className="shrink-0 font-mono text-white/30">{numbers[i]}</span>
            <span className="truncate">{item.text}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
