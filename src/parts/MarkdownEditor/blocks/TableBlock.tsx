/**
 * TableBlock.tsx — Bloc tableau GFM
 *
 * Version UI "clean / document editor":
 * - pas de grosse card autour du tableau
 * - bords externes très subtils
 * - séparateurs internes légers
 * - actions ligne/colonne visibles au hover
 * - footer "Ajouter une ligne" en dehors de la grille, style Notion/Loop
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ElementType,
  type KeyboardEvent,
} from 'react'
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../../utils/global'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'
import type { TableNode } from '../lib/types'

type ColAlign = 'left' | 'center' | 'right'

type InternalColumn = {
  id: string
  title: string
  align: ColAlign
  width: number
}

type InternalRow = {
  id: string
  cells: Record<string, string>
}

type InternalTable = {
  columns: InternalColumn[]
  rows: InternalRow[]
}

let _tc = 0
let _tr = 0
const newColId = () => `tc${++_tc}`
const newRowId = () => `tr${++_tr}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cellText = (cell: any): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cell?.children ?? []).map((n: any) => n.value ?? '').join('')

const toColAlign = (value: unknown): ColAlign => {
  if (value === 'center' || value === 'right') return value
  return 'left'
}

function nodeToInternal(node: TableNode): InternalTable {
  const headerRow = node.children[0]

  const columns: InternalColumn[] = (headerRow?.children ?? []).map((cell, i) => ({
    id: newColId(),
    title: cellText(cell),
    align: toColAlign(node.align?.[i]),
    width: 200,
  }))

  if (columns.length === 0) {
    columns.push({ id: newColId(), title: '', align: 'left', width: 200 })
  }

  const rows: InternalRow[] = node.children.slice(1).map((row) => {
    const cells: Record<string, string> = {}

    columns.forEach((column, ci) => {
      cells[column.id] = cellText(row.children[ci])
    })

    return {
      id: newRowId(),
      cells,
    }
  })

  if (rows.length === 0) {
    rows.push({ id: newRowId(), cells: Object.fromEntries(columns.map((c) => [c.id, ''])) })
  }

  return { columns, rows }
}

function internalToNode(t: InternalTable): TableNode {
  return {
    type: 'table',
    align: t.columns.map((c) => c.align),
    children: [
      {
        type: 'tableRow',
        children: t.columns.map((c) => ({
          type: 'tableCell',
          children: c.title ? [{ type: 'text', value: c.title }] : [],
        })),
      },
      ...t.rows.map((row) => ({
        type: 'tableRow',
        children: t.columns.map((c) => ({
          type: 'tableCell',
          children: row.cells[c.id] ? [{ type: 'text', value: row.cells[c.id] }] : [],
        })),
      })),
    ],
  }
}

const ALIGN_OPTIONS: { value: ColAlign; label: string; Icon: ElementType }[] = [
  { value: 'left', label: 'Gauche', Icon: AlignLeft },
  { value: 'center', label: 'Centre', Icon: AlignCenter },
  { value: 'right', label: 'Droite', Icon: AlignRight },
]

export interface TableBlockProps {
  node: TableNode
  onChange: (node: TableNode) => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
}

export const TableBlock = forwardRef<InlineEditorHandle, TableBlockProps>(
  function TableBlock({ node, onChange, onArrowUp, onArrowDown }, ref) {
    const [table, setTable] = useState<InternalTable>(() => nodeToInternal(node))
    const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null)
    const [activeColMenu, setActiveColMenu] = useState<string | null>(null)
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)

    const cellRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
    const headerRefs = useRef<Map<string, HTMLInputElement>>(new Map())
    const menuRef = useRef<HTMLDivElement | null>(null)
    const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)

    useImperativeHandle(ref, () => ({
      focus(cursor?: InitialCursor) {
        const { rows, columns } = table
        if (!rows.length || !columns.length) return

        if (cursor?.type === 'arrow' && cursor.edge === 'bottom') {
          const lastRow = rows[rows.length - 1]
          const lastCol = columns[columns.length - 1]
          cellRefs.current.get(`${lastRow.id}-${lastCol.id}`)?.focus()
          return
        }

        cellRefs.current.get(`${rows[0].id}-${columns[0].id}`)?.focus()
      },
      clear() {},
      clearSlash() {
        return []
      },
    }))

    const emit = useCallback(
      (next: InternalTable) => {
        onChange(internalToNode(next))
      },
      [onChange],
    )

    const updateCell = useCallback((rowId: string, colId: string, value: string) => {
      setTable((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
        ),
      }))
    }, [])

    const saveCell = useCallback(
      (rowId: string, colId: string, value: string) => {
        setTable((prev) => {
          const next = {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
            ),
          }
          emit(next)
          return next
        })
      },
      [emit],
    )

    const renameColumn = useCallback(
      (colId: string, title: string) => {
        setTable((prev) => {
          const next = {
            ...prev,
            columns: prev.columns.map((c) => (c.id === colId ? { ...c, title } : c)),
          }
          emit(next)
          return next
        })
      },
      [emit],
    )

    const setColumnAlign = useCallback(
      (colId: string, align: ColAlign) => {
        setTable((prev) => {
          const next = {
            ...prev,
            columns: prev.columns.map((c) => (c.id === colId ? { ...c, align } : c)),
          }
          emit(next)
          return next
        })
        setActiveColMenu(null)
      },
      [emit],
    )

    const addRowAt = useCallback(
      (index: number, focusColId?: string) => {
        setTable((prev) => {
          const newRow: InternalRow = {
            id: newRowId(),
            cells: Object.fromEntries(prev.columns.map((c) => [c.id, ''])),
          }

          const next = {
            ...prev,
            rows: [...prev.rows.slice(0, index), newRow, ...prev.rows.slice(index)],
          }

          emit(next)

          const targetColId = focusColId ?? prev.columns[0]?.id
          if (targetColId) {
            requestAnimationFrame(() => {
              cellRefs.current.get(`${newRow.id}-${targetColId}`)?.focus()
            })
          }

          return next
        })
      },
      [emit],
    )

    const removeRow = useCallback(
      (rowId: string) => {
        setTable((prev) => {
          if (prev.rows.length <= 1) return prev

          const idx = prev.rows.findIndex((r) => r.id === rowId)
          const next = { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }

          emit(next)

          const targetRow = next.rows[Math.max(0, idx - 1)]
          const targetCol = prev.columns[0]
          if (targetRow && targetCol) {
            requestAnimationFrame(() => {
              cellRefs.current.get(`${targetRow.id}-${targetCol.id}`)?.focus()
            })
          }

          return next
        })
      },
      [emit],
    )

    const addColumnAt = useCallback(
      (index: number) => {
        setTable((prev) => {
          const newCol: InternalColumn = {
            id: newColId(),
            title: '',
            align: 'left',
            width: 180,
          }

          const next = {
            columns: [...prev.columns.slice(0, index), newCol, ...prev.columns.slice(index)],
            rows: prev.rows.map((r) => ({ ...r, cells: { ...r.cells, [newCol.id]: '' } })),
          }

          emit(next)

          requestAnimationFrame(() => {
            headerRefs.current.get(newCol.id)?.focus()
          })

          return next
        })

        setActiveColMenu(null)
      },
      [emit],
    )

    const removeColumn = useCallback(
      (colId: string) => {
        setTable((prev) => {
          if (prev.columns.length <= 1) return prev

          const next = {
            columns: prev.columns.filter((c) => c.id !== colId),
            rows: prev.rows.map((r) => {
              const cells = { ...r.cells }
              delete cells[colId]
              return { ...r, cells }
            }),
          }

          emit(next)
          return next
        })

        setActiveColMenu(null)
      },
      [emit],
    )

    const focusCell = useCallback(
      (rowIdx: number, colIdx: number) => {
        const { rows, columns } = table
        if (rowIdx < 0 || rowIdx >= rows.length || colIdx < 0 || colIdx >= columns.length) return
        cellRefs.current.get(`${rows[rowIdx].id}-${columns[colIdx].id}`)?.focus()
      },
      [table],
    )

    const handleCellKeyDown = useCallback(
      (
        e: KeyboardEvent<HTMLTextAreaElement>,
        rowIdx: number,
        colIdx: number,
        rowId: string,
        colId: string,
      ) => {
        const { rows, columns } = table

        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault()
          if (colIdx < columns.length - 1) focusCell(rowIdx, colIdx + 1)
          else if (rowIdx < rows.length - 1) focusCell(rowIdx + 1, 0)
          else addRowAt(rows.length)
          return
        }

        if (e.key === 'Tab' && e.shiftKey) {
          e.preventDefault()
          if (colIdx > 0) focusCell(rowIdx, colIdx - 1)
          else if (rowIdx > 0) focusCell(rowIdx - 1, columns.length - 1)
          return
        }

        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          if (rowIdx < rows.length - 1) focusCell(rowIdx + 1, colIdx)
          else addRowAt(rows.length, colId)
          return
        }

        if (e.key === 'Backspace' && rows.length > 1) {
          const el = e.currentTarget
          const cursorAtStart = el.selectionStart === 0 && el.selectionEnd === 0

          if (!el.value && cursorAtStart) {
            const rowAllEmpty = columns.every((c) => !(rows[rowIdx]?.cells[c.id] ?? ''))
            if (rowAllEmpty) {
              e.preventDefault()
              removeRow(rowId)
              return
            }
          }
        }

        if (e.key === 'ArrowUp' && rowIdx === 0 && onArrowUp) {
          const el = e.currentTarget
          const cursorPos = el.selectionStart ?? 0
          const firstLineLen = (el.value.split('\n')[0] ?? '').length

          if (cursorPos <= firstLineLen) {
            e.preventDefault()
            onArrowUp(el.getBoundingClientRect().left)
          }
          return
        }

        if (e.key === 'ArrowDown' && rowIdx === rows.length - 1 && onArrowDown) {
          const el = e.currentTarget
          const lines = el.value.split('\n')
          const lastLineStart = el.value.length - (lines[lines.length - 1]?.length ?? 0)
          const cursorPos = el.selectionStart ?? el.value.length

          if (cursorPos >= lastLineStart) {
            e.preventDefault()
            onArrowDown(el.getBoundingClientRect().left)
          }
        }
      },
      [table, focusCell, addRowAt, removeRow, onArrowUp, onArrowDown],
    )

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        const r = resizingRef.current
        if (!r) return

        const delta = e.clientX - r.startX
        const newWidth = Math.max(96, r.startWidth + delta)

        setTable((prev) => ({
          ...prev,
          columns: prev.columns.map((c) => (c.id === r.colId ? { ...c, width: newWidth } : c)),
        }))
      }

      const onMouseUp = () => {
        resizingRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)

      return () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
    }, [])

    useEffect(() => {
      if (!activeColMenu) return

      const handle = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setActiveColMenu(null)
        }
      }

      document.addEventListener('mousedown', handle)
      return () => document.removeEventListener('mousedown', handle)
    }, [activeColMenu])

    const autoHeight = (el: HTMLTextAreaElement) => {
      el.style.height = 'auto'
      el.style.height = `${Math.max(44, el.scrollHeight)}px`
    }

    useEffect(() => {
      cellRefs.current.forEach((el) => {
        if (el) autoHeight(el)
      })
    }, [table.rows, table.columns])

    const alignClass = (align: ColAlign) =>
      align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

    return (
      <div className="group/table relative my-7 w-full">
        <div className="holo-scrollbar overflow-x-auto pb-1">
          <table className="w-full min-w-max border-separate border-spacing-0 overflow-hidden rounded-holo-xl">
            <thead>
              <tr>
                <th className="w-[42px] min-w-[42px] border-b border-r border-holo-border-soft bg-white/[0.028] p-0 first:rounded-tl-holo-xl" />

                {table.columns.map((col, colIdx) => {
                  const isLastCol = colIdx === table.columns.length - 1

                  return (
                    <th
                      key={col.id}
                      className={cn(
                        'relative border-b border-holo-border-soft bg-white/[0.055] p-0',
                        !isLastCol && 'border-r',
                        isLastCol && 'rounded-tr-holo-xl',
                        alignClass(col.align),
                      )}
                      style={{ width: col.width }}
                    >
                      <div className="flex min-h-11 items-center gap-2 px-3 pr-9">
                        <input
                          ref={(el) => {
                            if (el) headerRefs.current.set(col.id, el)
                            else headerRefs.current.delete(col.id)
                          }}
                          value={col.title}
                          onChange={(e) => renameColumn(col.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab' && !e.shiftKey) {
                              e.preventDefault()
                              if (colIdx < table.columns.length - 1) {
                                headerRefs.current.get(table.columns[colIdx + 1].id)?.focus()
                              } else {
                                const firstRow = table.rows[0]
                                const firstCol = table.columns[0]
                                if (firstRow && firstCol) {
                                  cellRefs.current.get(`${firstRow.id}-${firstCol.id}`)?.focus()
                                }
                              }
                            }

                            if (e.key === 'Tab' && e.shiftKey) {
                              e.preventDefault()
                              if (colIdx > 0) headerRefs.current.get(table.columns[colIdx - 1].id)?.focus()
                            }

                            if (e.key === 'Escape') {
                              e.currentTarget.blur()
                            }
                          }}
                          className={cn(
                            'min-w-0 flex-1 rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm font-semibold text-holo-text-muted outline-none placeholder:text-holo-text-faint transition',
                            'hover:bg-white/[0.025] focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:text-holo-text',
                            alignClass(col.align),
                          )}
                          placeholder="Colonne"
                        />

                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => setActiveColMenu((v) => (v === col.id ? null : col.id))}
                          className={cn(
                            'absolute right-1 flex size-7 shrink-0 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-glass-hover hover:text-holo-text',
                            'group-hover/table:opacity-100',
                            activeColMenu === col.id && 'bg-holo-glass-hover opacity-100',
                          )}
                          aria-label={`Options colonne ${col.title || colIdx + 1}`}
                        >
                          <ChevronDown size={13} />
                        </button>

                        {activeColMenu === col.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-1 top-11 z-40 w-52 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 text-left shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
                            onKeyDown={(e) => e.key === 'Escape' && setActiveColMenu(null)}
                          >
                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
                              Colonne
                            </div>

                            <button
                              onClick={() => addColumnAt(colIdx)}
                              className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                            >
                              <Plus size={13} /> Insérer avant
                            </button>

                            <button
                              onClick={() => addColumnAt(colIdx + 1)}
                              className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                            >
                              <Plus size={13} /> Insérer après
                            </button>

                            <div className="my-1 h-px bg-holo-border-soft" />

                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
                              Alignement
                            </div>

                            {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                              <button
                                key={value}
                                onClick={() => setColumnAlign(col.id, value)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm transition',
                                  col.align === value
                                    ? 'bg-holo-primary-surface text-holo-primary-soft'
                                    : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                                )}
                              >
                                <Icon size={13} /> {label}
                              </button>
                            ))}

                            <div className="my-1 h-px bg-holo-border-soft" />

                            <button
                              onClick={() => removeColumn(col.id)}
                              disabled={table.columns.length <= 1}
                              className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-danger transition hover:bg-holo-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 size={13} /> Supprimer
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        className="absolute right-0 top-0 z-20 h-full w-1 cursor-col-resize opacity-0 transition hover:bg-holo-primary/50 hover:opacity-100 group-hover/table:opacity-100"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          document.body.style.cursor = 'col-resize'
                          document.body.style.userSelect = 'none'
                          resizingRef.current = {
                            colId: col.id,
                            startX: e.clientX,
                            startWidth: col.width,
                          }
                        }}
                      />

                      {colIdx > 0 && (
                        <button
                          onClick={() => addColumnAt(colIdx)}
                          className="absolute -left-3 top-1/2 z-20 flex size-6 -translate-y-1/2 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white group-hover/table:opacity-100"
                          title="Insérer une colonne ici"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </th>
                  )
                })}

                <th className="w-10 border-b border-holo-border-soft bg-white/[0.055] p-0 rounded-tr-holo-xl">
                  <button
                    onClick={() => addColumnAt(table.columns.length)}
                    className="flex w-full items-center justify-center py-3 text-holo-text-faint opacity-0 transition hover:text-holo-primary group-hover/table:opacity-100"
                    title="Ajouter une colonne"
                  >
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {table.rows.map((row, rowIdx) => {
                const isLastRow = rowIdx === table.rows.length - 1

                return (
                  <tr
                    key={row.id}
                    className="group/row"
                    onMouseEnter={() => setHoveredRowId(row.id)}
                    onMouseLeave={() => setHoveredRowId(null)}
                  >
                    <td
                      className={cn(
                        'w-[42px] min-w-[42px] border-r border-holo-border-soft bg-white/[0.012] p-0',
                        !isLastRow && 'border-b',
                        isLastRow && 'rounded-bl-holo-xl',
                      )}
                    >
                      <div className="relative flex h-full min-h-11 items-center justify-center">
                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={table.rows.length <= 1}
                          className="flex size-7 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-danger/10 hover:text-holo-danger group-hover/row:opacity-100 disabled:pointer-events-none disabled:opacity-20"
                          title="Supprimer la ligne"
                        >
                          <Trash2 size={13} />
                        </button>

                        <button
                          onClick={() => addRowAt(rowIdx)}
                          className={cn(
                            'absolute -top-3 left-1/2 z-20 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint opacity-0 shadow-[0_8px_24px_rgba(0,0,0,.22)] transition hover:bg-holo-primary hover:text-white',
                            hoveredRowId === row.id && 'opacity-100',
                          )}
                          title="Insérer une ligne avant"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </td>

                    {table.columns.map((col, colIdx) => {
                      const cellKey = `${row.id}-${col.id}`
                      const isActive = activeCell?.rowId === row.id && activeCell.colId === col.id
                      const isLastCol = colIdx === table.columns.length - 1

                      return (
                        <td
                          key={cellKey}
                          className={cn(
                            'bg-transparent p-0',
                            !isLastRow && 'border-b border-holo-border-soft',
                            !isLastCol && 'border-r border-holo-border-soft',
                            isLastRow && isLastCol && 'rounded-br-holo-xl',
                            isActive && 'bg-holo-primary-surface/25',
                          )}
                          style={{ width: col.width }}
                        >
                          <textarea
                            ref={(el) => {
                              if (el) cellRefs.current.set(cellKey, el)
                              else cellRefs.current.delete(cellKey)
                            }}
                            value={row.cells[col.id] ?? ''}
                            rows={1}
                            onFocus={() => setActiveCell({ rowId: row.id, colId: col.id })}
                            onBlur={(e) => {
                              setActiveCell(null)
                              saveCell(row.id, col.id, e.currentTarget.value)
                            }}
                            onChange={(e) => {
                              updateCell(row.id, col.id, e.target.value)
                              autoHeight(e.currentTarget)
                            }}
                            onKeyDown={(e) => handleCellKeyDown(e, rowIdx, colIdx, row.id, col.id)}
                            className={cn(
                              'block w-full resize-none overflow-hidden bg-transparent px-3 py-3 text-sm leading-6 text-holo-text-soft outline-none placeholder:text-holo-text-faint transition',
                              'hover:bg-white/[0.012] focus:bg-white/[0.02]',
                              alignClass(col.align),
                            )}
                            style={{ minHeight: '2.75rem', height: 'auto' }}
                          />
                        </td>
                      )
                    })}

                    <td className={cn('w-10 bg-transparent p-0', !isLastRow && 'border-b border-holo-border-soft')} />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center pl-3">
          <button
            onClick={() => addRowAt(table.rows.length)}
            className="inline-flex items-center gap-2 rounded-holo-md px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
          >
            <Plus size={14} />
            Ajouter une ligne
          </button>
        </div>
      </div>
    )
  },
)
