type ColumnType = {
  emoji: string
  label: string
}

type TablePopupPosition = {
  x: number
  y: number
}

type ColumnTypePopupState = {
  x: number
  y: number
  thEl: HTMLElement
}

type TableControlsOverlayProps = {
  editorMode: 'raw' | 'wysiwyg'
  tablePopup: TablePopupPosition | null
  columnTypePopup: ColumnTypePopupState | null
  columnTypes: ColumnType[]
  typeEmojis: string[]
  onInsertTableRow: () => void
  onInsertTableColumn: () => void
  onSortAsc: () => void
  onSortDesc: () => void
  onOpenCurrentColumnTypePicker: () => void
  onDeleteTableRow: () => void
  onDeleteTableColumn: () => void
  onSetCurrentColumnType: (emoji: string) => void
  onCloseColumnTypePopup: () => void
}

export function TableControlsOverlay({
  editorMode,
  tablePopup,
  columnTypePopup,
  columnTypes,
  typeEmojis,
  onInsertTableRow,
  onInsertTableColumn,
  onSortAsc,
  onSortDesc,
  onOpenCurrentColumnTypePicker,
  onDeleteTableRow,
  onDeleteTableColumn,
  onSetCurrentColumnType,
  onCloseColumnTypePopup,
}: TableControlsOverlayProps) {
  return (
    <>
      {tablePopup && editorMode === 'wysiwyg' && (
        <div
          className="fixed z-50 flex items-center gap-1 rounded-lg border border-white/15 bg-[#18191a] px-1 py-1 shadow-2xl"
          style={{ left: tablePopup.x, top: tablePopup.y, transform: 'translate(-100%, -100%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onInsertTableRow}
            title="Ajouter une ligne"
          >
            <i className="fa-solid fa-grip-lines mr-1 text-[10px]" />
            Ligne
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onInsertTableColumn}
            title="Ajouter une colonne"
          >
            <i className="fa-solid fa-table-columns mr-1 text-[10px]" />
            Colonne
          </button>
          <div className="mx-1 h-4 w-px bg-white/15" />
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onSortAsc}
            title="Trier la colonne A → Z"
          >
            <i className="fa-solid fa-arrow-down-a-z mr-1 text-[10px]" />
            A→Z
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onSortDesc}
            title="Trier la colonne Z → A"
          >
            <i className="fa-solid fa-arrow-down-z-a mr-1 text-[10px]" />
            Z→A
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 hover:text-white"
            onClick={onOpenCurrentColumnTypePicker}
            title="Type de colonne"
          >
            <i className="fa-solid fa-list-check mr-1 text-[10px]" />
            Type
          </button>
          <div className="mx-1 h-4 w-px bg-white/15" />
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-red-500/20 hover:text-red-400"
            onClick={onDeleteTableRow}
            title="Supprimer la ligne"
          >
            <i className="fa-solid fa-minus mr-1 text-[10px]" />
            Ligne
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] text-white/80 hover:bg-red-500/20 hover:text-red-400"
            onClick={onDeleteTableColumn}
            title="Supprimer la colonne"
          >
            <i className="fa-solid fa-xmark mr-1 text-[10px]" />
            Colonne
          </button>
        </div>
      )}

      {columnTypePopup && (
        <>
          <div className="fixed inset-0 z-40" onClick={onCloseColumnTypePopup} />
          <div
            className="fixed z-50 flex gap-1 rounded-lg border border-white/15 bg-[#18191a] p-1.5 shadow-2xl"
            style={{ left: columnTypePopup.x, top: columnTypePopup.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {columnTypes.map(({ emoji, label }) => {
              const currentText = columnTypePopup.thEl.textContent ?? ''
              const isActive = emoji
                ? currentText.startsWith(emoji)
                : !typeEmojis.some((em) => currentText.startsWith(em))
              return (
                <button
                  key={label}
                  className={`flex flex-col items-center gap-0.5 rounded px-2 py-1.5 text-[10px] transition-colors min-w-[44px] ${isActive ? 'bg-[#7B61FF]/25 text-white' : 'text-white/60 hover:bg-white/8 hover:text-white'}`}
                  onClick={() => {
                    onSetCurrentColumnType(emoji)
                    onCloseColumnTypePopup()
                  }}
                >
                  <span className="text-base leading-none">{emoji || 'T'}</span>
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
