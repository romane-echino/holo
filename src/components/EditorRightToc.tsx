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

export const EditorRightToc: React.FC<EditorRightTocProps> = ({
  editorMode,
  tocItems,
  onTocItemClick,
}) => {
  if (!(editorMode === 'wysiwyg' && tocItems.length > 0)) {
    return null
  }

  return (
    <aside className="hidden xl:flex xl:w-52 shrink-0 flex-col overflow-y-auto border-l border-white/5 pt-12 pr-4 pl-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/30">
        Table des matières
      </p>
      <nav className="space-y-0.5">
        {tocItems.map((item) => (
          <button
            key={`${item.headingIndex}-${item.text}`}
            className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-white/50 hover:bg-white/8 hover:text-white/90 transition-colors"
            style={{ paddingLeft: `${Math.min((item.level - 1) * 10 + 8, 36)}px` }}
            onClick={() => onTocItemClick(item.headingIndex)}
            title={item.text}
          >
            {item.text}
          </button>
        ))}
      </nav>
    </aside>
  )
}
