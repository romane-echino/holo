import { useMemo, useState } from 'react'
import {
  ChevronDown,
  GripHorizontal,
  MoreHorizontal,
  Plus,
  PlusCircle,
  Trash2,
  Type,
} from 'lucide-react'
import { cn } from '../utils/global'

export type HoloTableColumn = {
  id: string
  title: string
  align?: 'left' | 'center' | 'right'
  width?: number
}

export type HoloTableRow = {
  id: string
  cells: Record<string, string>
}

export type HoloTableValue = {
  columns: HoloTableColumn[]
  rows: HoloTableRow[]
}

type HoloMarkdownTableProps = {
  value?: HoloTableValue
  readonly?: boolean
  onChange?: (value: HoloTableValue) => void
}

const defaultTable: HoloTableValue = {
  columns: [
    { id: 'col-1', title: 'Nom', align: 'left', width: 220 },
    { id: 'col-2', title: 'Rôle', align: 'left', width: 280 },
    { id: 'col-3', title: 'Statut', align: 'center', width: 160 },
  ],
  rows: [
    { id: 'row-1', cells: { 'col-1': 'Markdown', 'col-2': 'Format principal d’écriture', 'col-3': 'Actif' } },
    { id: 'row-2', cells: { 'col-1': 'Git', 'col-2': 'Historique et synchronisation', 'col-3': 'Synchronisé' } },
    { id: 'row-3', cells: { 'col-1': 'IA', 'col-2': 'Résumé, liens, réécriture', 'col-3': 'Prêt' } },
  ],
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`
}

function normalizeTable(value?: HoloTableValue): HoloTableValue {
  return value ?? defaultTable
}

export function TableTest({ value, readonly = false, onChange }: HoloMarkdownTableProps) {
  const table = normalizeTable(value)
  const [activeCell, setActiveCell] = useState<{ rowId: string; columnId: string } | null>(null)
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null)
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
  const [hoveredColumnId, setHoveredColumnId] = useState<string | null>(null)

  const columnMap = useMemo(() => new Map(table.columns.map((column) => [column.id, column])), [table.columns])

  const update = (next: HoloTableValue) => onChange?.(next)

  const updateCell = (rowId: string, columnId: string, nextValue: string) => {
    update({
      ...table,
      rows: table.rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: nextValue } } : row,
      ),
    })
  }

  const renameColumn = (columnId: string, title: string) => {
    update({
      ...table,
      columns: table.columns.map((column) => (column.id === columnId ? { ...column, title } : column)),
    })
  }

  const setColumnAlign = (columnId: string, align: HoloTableColumn['align']) => {
    update({
      ...table,
      columns: table.columns.map((column) => (column.id === columnId ? { ...column, align } : column)),
    })
    setActiveColumnMenu(null)
  }

  const addRowAt = (index: number) => {
    const newRow: HoloTableRow = {
      id: createId('row'),
      cells: Object.fromEntries(table.columns.map((column) => [column.id, ''])),
    }

    update({ ...table, rows: [...table.rows.slice(0, index), newRow, ...table.rows.slice(index)] })
  }

  const addColumnAt = (index: number) => {
    const newColumn: HoloTableColumn = {
      id: createId('col'),
      title: 'Nouvelle colonne',
      align: 'left',
      width: 220,
    }

    update({
      columns: [...table.columns.slice(0, index), newColumn, ...table.columns.slice(index)],
      rows: table.rows.map((row) => ({ ...row, cells: { ...row.cells, [newColumn.id]: '' } })),
    })
  }

  const removeRow = (rowId: string) => {
    update({ ...table, rows: table.rows.filter((row) => row.id !== rowId) })
  }

  const removeColumn = (columnId: string) => {
    if (table.columns.length <= 1) return

    update({
      columns: table.columns.filter((column) => column.id !== columnId),
      rows: table.rows.map((row) => {
        const cells = { ...row.cells }
        delete cells[columnId]
        return { ...row, cells }
      }),
    })

    setActiveColumnMenu(null)
  }

  const alignmentClass = (align?: HoloTableColumn['align']) => {
    if (align === 'center') return 'text-center'
    if (align === 'right') return 'text-right'
    return 'text-left'
  }

  return (
    <div className="group/table relative my-8 w-full">
      {!readonly && (
        <div className="absolute -top-8 left-0 right-0 hidden h-8 items-end group-hover/table:flex">
          <div className="flex pl-[42px]">
            {table.columns.map((column, index) => (
              <div
                key={column.id}
                className="relative"
                style={{ width: column.width ?? 220 }}
                onMouseEnter={() => setHoveredColumnId(column.id)}
                onMouseLeave={() => setHoveredColumnId(null)}
              >
                <button
                  onClick={() => addColumnAt(index)}
                  className={cn(
                    'absolute -left-3 top-1 flex size-6 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white',
                    hoveredColumnId === column.id && 'opacity-100',
                  )}
                  title="Ajouter une colonne avant"
                  aria-label="Ajouter une colonne avant"
                >
                  <Plus size={13} />
                </button>

                {index === table.columns.length - 1 && (
                  <button
                    onClick={() => addColumnAt(index + 1)}
                    className="absolute -right-3 top-1 flex size-6 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white group-hover/table:opacity-100"
                    title="Ajouter une colonne après"
                    aria-label="Ajouter une colonne après"
                  >
                    <Plus size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-holo-2xl border border-holo-border-soft bg-holo-glass shadow-[0_12px_40px_rgba(0,0,0,.16),inset_0_1px_0_rgba(255,255,255,.025)] backdrop-blur-xl">
        <div className="holo-scrollbar overflow-x-auto">
          <table className="w-full min-w-max border-separate border-spacing-0">
            <thead>
              <tr className="bg-white/[0.035]">
                {!readonly && (
                  <th className="sticky left-0 z-10 w-[42px] border-b border-r border-holo-border-soft bg-holo-bg/70 p-0 backdrop-blur-xl" />
                )}

                {table.columns.map((column, columnIndex) => (
                  <th
                    key={column.id}
                    className={cn(
                      'relative border-b border-r border-holo-border-soft p-0 last:border-r-0',
                      alignmentClass(column.align),
                    )}
                    style={{ width: column.width ?? 220 }}
                    onMouseEnter={() => setHoveredColumnId(column.id)}
                    onMouseLeave={() => setHoveredColumnId(null)}
                  >
                    <div className="flex min-h-11 items-center gap-2 px-3">
                      <Type size={13} className="shrink-0 text-holo-text-faint" />

                      <input
                        value={column.title}
                        readOnly={readonly}
                        onChange={(event) => renameColumn(column.id, event.target.value)}
                        className={cn(
                          'min-w-0 flex-1 rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-holo-text placeholder:text-holo-text-faint transition',
                          !readonly &&
                            'hover:bg-white/[0.025] focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:outline-none',
                          alignmentClass(column.align),
                        )}
                        placeholder="Colonne"
                      />

                      {!readonly && (
                        <button
                          onClick={() => setActiveColumnMenu((current) => (current === column.id ? null : column.id))}
                          className={cn(
                            'flex size-7 shrink-0 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-glass-hover hover:text-holo-text',
                            (hoveredColumnId === column.id || activeColumnMenu === column.id) && 'opacity-100',
                          )}
                          aria-label="Options colonne"
                          title="Options colonne"
                        >
                          <ChevronDown size={14} />
                        </button>
                      )}
                    </div>

                    {!readonly && columnIndex > 0 && (
                      <button
                        onClick={() => addColumnAt(columnIndex)}
                        className="absolute -left-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white group-hover/table:opacity-100"
                        title="Ajouter une colonne ici"
                        aria-label="Ajouter une colonne ici"
                      >
                        <Plus size={13} />
                      </button>
                    )}

                    {!readonly && activeColumnMenu === column.id && (
                      <ColumnMenu
                        align={column.align ?? 'left'}
                        onAlign={(align) => setColumnAlign(column.id, align)}
                        onAddBefore={() => addColumnAt(columnIndex)}
                        onAddAfter={() => addColumnAt(columnIndex + 1)}
                        onDelete={() => removeColumn(column.id)}
                        canDelete={table.columns.length > 1}
                      />
                    )}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  className="group/row"
                  onMouseEnter={() => setHoveredRowId(row.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                >
                  {!readonly && (
                    <td className="sticky left-0 z-10 w-[42px] border-b border-r border-holo-border-soft bg-holo-bg/70 p-0 backdrop-blur-xl">
                      <div className="relative flex h-full min-h-12 items-center justify-center">
                        <button
                          className="flex size-7 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-glass-hover hover:text-holo-text group-hover/row:opacity-100"
                          title="Déplacer la ligne"
                          aria-label="Déplacer la ligne"
                        >
                          <GripHorizontal size={14} />
                        </button>

                        <button
                          onClick={() => addRowAt(rowIndex)}
                          className={cn(
                            'absolute -top-3 left-1/2 z-20 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white',
                            hoveredRowId === row.id && 'opacity-100',
                          )}
                          title="Ajouter une ligne avant"
                          aria-label="Ajouter une ligne avant"
                        >
                          <Plus size={13} />
                        </button>

                        <button
                          onClick={() => removeRow(row.id)}
                          className="absolute right-1 flex size-7 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-danger/85 hover:text-white group-hover/row:opacity-100"
                          title="Supprimer la ligne"
                          aria-label="Supprimer la ligne"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}

                  {table.columns.map((column) => {
                    const isActive = activeCell?.rowId === row.id && activeCell.columnId === column.id

                    return (
                      <td
                        key={`${row.id}-${column.id}`}
                        className={cn(
                          'border-b border-r border-holo-border-soft p-0 last:border-r-0',
                          isActive && 'bg-holo-primary-surface/50',
                        )}
                        style={{ width: column.width ?? 220 }}
                      >
                        <textarea
                          value={row.cells[column.id] ?? ''}
                          readOnly={readonly}
                          onFocus={() => setActiveCell({ rowId: row.id, columnId: column.id })}
                          onBlur={() => setActiveCell(null)}
                          onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                          className={cn(
                            'block min-h-12 w-full resize-none rounded-none border border-transparent bg-transparent px-3 py-3 text-sm leading-6 text-holo-text-soft placeholder:text-holo-text-faint transition',
                            !readonly &&
                              'hover:bg-white/[0.018] focus:border-holo-primary/30 focus:bg-white/[0.025] focus:outline-none',
                            alignmentClass(column.align),
                          )}
                          placeholder="Vide"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readonly && (
          <div className="flex items-center gap-2 border-t border-holo-border-soft bg-white/[0.018] px-3 py-2">
            <button
              onClick={() => addRowAt(table.rows.length)}
              className="inline-flex items-center gap-2 rounded-holo-md px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            >
              <PlusCircle size={15} />
              Ajouter une ligne
            </button>

            <button
              onClick={() => addColumnAt(table.columns.length)}
              className="inline-flex items-center gap-2 rounded-holo-md px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            >
              <PlusCircle size={15} />
              Ajouter une colonne
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ColumnMenu({
  align,
  canDelete,
  onAlign,
  onAddBefore,
  onAddAfter,
  onDelete,
}: {
  align: 'left' | 'center' | 'right'
  canDelete: boolean
  onAlign: (align: 'left' | 'center' | 'right') => void
  onAddBefore: () => void
  onAddAfter: () => void
  onDelete: () => void
}) {
  return (
    <div className="absolute right-2 top-10 z-40 w-56 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 text-left shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl">
      <div className="px-2 py-1.5 text-[11px] uppercase tracking-[0.14em] text-holo-text-faint">Colonne</div>

      <button onClick={onAddBefore} className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text">
        <Plus size={14} />
        Insérer avant
      </button>

      <button onClick={onAddAfter} className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text">
        <Plus size={14} />
        Insérer après
      </button>

      <div className="my-1 h-px bg-holo-border-soft" />

      <div className="px-2 py-1.5 text-[11px] uppercase tracking-[0.14em] text-holo-text-faint">Alignement</div>

      {(['left', 'center', 'right'] as const).map((value) => (
        <button
          key={value}
          onClick={() => onAlign(value)}
          className={cn(
            'flex w-full items-center justify-between rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text',
            align === value && 'bg-holo-primary-surface text-holo-primary-soft',
          )}
        >
          <span>
            {value === 'left' && 'Gauche'}
            {value === 'center' && 'Centre'}
            {value === 'right' && 'Droite'}
          </span>

          {align === value && <span className="text-xs">✓</span>}
        </button>
      ))}

      <div className="my-1 h-px bg-holo-border-soft" />

      <button
        onClick={onDelete}
        disabled={!canDelete}
        className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-danger transition hover:bg-holo-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 size={14} />
        Supprimer
      </button>
    </div>
  )
}
