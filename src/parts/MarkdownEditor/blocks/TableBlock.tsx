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
} from 'react'
import { createPortal } from 'react-dom'
import { AlignCenter, AlignLeft, AlignRight, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../../utils/global'
import { InlineEditor } from '../InlineEditor'
import { setClipboardEventData, writeClipboardPayload } from '../lib/clipboard'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'
import type { InlineNode, TableNode } from '../lib/types'

type ColAlign = 'left' | 'center' | 'right'

type InternalColumn = {
  id: string
  title: string
  align: ColAlign
  width: number
  manualWidth?: boolean
}

type InternalRow = {
  id: string
  cells: Record<string, InlineNode[]>
}

type InternalTable = {
  columns: InternalColumn[]
  rows: InternalRow[]
}

type CellCoord = {
  rowIdx: number
  colIdx: number
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

function getSelectionBounds(anchor: CellCoord | null, focus: CellCoord | null) {
  if (!anchor || !focus) return null
  return {
    rowStart: Math.min(anchor.rowIdx, focus.rowIdx),
    rowEnd: Math.max(anchor.rowIdx, focus.rowIdx),
    colStart: Math.min(anchor.colIdx, focus.colIdx),
    colEnd: Math.max(anchor.colIdx, focus.colIdx),
  }
}

function inlineNodesToPlainText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text':
      case 'inlineCode':
        return node.value
      case 'break':
        return '\n'
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'underline':
      case 'link':
        return inlineNodesToPlainText(node.children)
      case 'image':
        return node.alt ?? ''
      default:
        return ''
    }
  }).join('')
}

function plainTextToInlineNodes(value: string): InlineNode[] {
  if (!value) return []
  const lines = value.replace(/\r/g, '').split('\n')
  const result: InlineNode[] = []
  lines.forEach((line, index) => {
    if (line) {
      result.push({ type: 'text', value: line })
    }
    if (index < lines.length - 1) {
      result.push({ type: 'break' })
    }
  })
  return result
}

function getCellContentVersion(nodes: InlineNode[] | undefined): string {
  return JSON.stringify(nodes ?? [])
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function estimateColumnWidth(title: string, cells: InlineNode[][], totalColumns: number): number {
  const lengths = [title.trim().length, ...cells.map((cell) => cellText({ children: cell }).trim().length)]
  const longest = Math.max(0, ...lengths)
  const minWidth = totalColumns <= 2 ? 180 : totalColumns === 3 ? 104 : 72
  const maxWidth = totalColumns <= 2 ? 420 : totalColumns === 3 ? 220 : 180
  const estimated = 56 + longest * 8
  return Math.max(minWidth, Math.min(maxWidth, estimated))
}

function nodeToInternal(node: TableNode): InternalTable {
  const headerRow = node.children[0]

  const headerCells = headerRow?.children ?? []
  const bodyRows = node.children.slice(1)
  const totalColumns = Math.max(1, headerCells.length)

  const columns: InternalColumn[] = headerCells.map((cell, i) => ({
    id: newColId(),
    title: cellText(cell),
    align: toColAlign(node.align?.[i]),
    width: estimateColumnWidth(
      cellText(cell),
      bodyRows.map((row) => (row.children[i]?.children ?? []) as InlineNode[]),
      totalColumns,
    ),
    manualWidth: false,
  }))

  if (columns.length === 0) {
    columns.push({ id: newColId(), title: '', align: 'left', width: 180, manualWidth: false })
  }

  const rows: InternalRow[] = node.children.slice(1).map((row) => {
    const cells: Record<string, InlineNode[]> = {}

    columns.forEach((column, ci) => {
      cells[column.id] = (row.children[ci]?.children ?? []) as InlineNode[]
    })

    return {
      id: newRowId(),
      cells,
    }
  })

  if (rows.length === 0) {
    rows.push({ id: newRowId(), cells: Object.fromEntries(columns.map((c) => [c.id, [] as InlineNode[]])) })
  }

  return { columns, rows }
}

function internalToNode(t: InternalTable): TableNode {
  return {
    type: 'table',
    align: t.columns.map((c) => c.align),
    children: [
      {
        type: 'tableRow' as const,
        children: t.columns.map((c) => ({
          type: 'tableCell' as const,
          children: c.title ? [{ type: 'text' as const, value: c.title }] : [],
        })),
      },
      ...t.rows.map((row) => ({
        type: 'tableRow' as const,
        children: t.columns.map((c) => ({
          type: 'tableCell' as const,
          children: (row.cells[c.id] ?? []) as InlineNode[],
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
  onSelect?: () => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  /** Appelé quand Tab est pressé depuis la dernière cellule. Si fourni, focus le bloc suivant plutôt que d'ajouter une ligne. */
  onTabExit?: () => void
}

export const TableBlock = forwardRef<InlineEditorHandle, TableBlockProps>(
  function TableBlock({ node, onChange, onSelect, onArrowUp, onArrowDown, onTabExit }, ref) {
    const [table, setTable] = useState<InternalTable>(() => nodeToInternal(node))
    // Ref toujours synchronisé avec table pour éviter les closures périmées
    const tableRef = useRef(table)
    tableRef.current = table
    const [activeCell, setActiveCell] = useState<{ rowId: string; colId: string } | null>(null)
    const [activeColMenu, setActiveColMenu] = useState<string | null>(null)
    const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null)
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
    const [selectionAnchor, setSelectionAnchor] = useState<CellCoord | null>(null)
    const [selectionFocus, setSelectionFocus] = useState<CellCoord | null>(null)

    const cellRefs = useRef<Map<string, InlineEditorHandle>>(new Map())
    const headerRefs = useRef<Map<string, HTMLInputElement>>(new Map())
    const menuRef = useRef<HTMLDivElement | null>(null)
    const resizingRef = useRef<{ colId: string; startX: number; startWidth: number } | null>(null)
    const tableWrapRef = useRef<HTMLDivElement | null>(null)
    const dragSelectRef = useRef<{ anchor: CellCoord; active: boolean } | null>(null)

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


    const saveCell = useCallback(
      (rowId: string, colId: string, nodes: InlineNode[]) => {
        const next = {
          ...tableRef.current,
          rows: tableRef.current.rows.map((r) =>
            r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: nodes } } : r,
          ),
        }
        setTable(next)
        emit(next)
      },
      [emit],
    )

    const renameColumn = useCallback(
      (colId: string, title: string) => {
        const next = {
          ...tableRef.current,
          columns: tableRef.current.columns.map((c) => (c.id === colId ? { ...c, title } : c)),
        }
        setTable(next)
        emit(next)
      },
      [emit],
    )

    const setColumnAlign = useCallback(
      (colId: string, align: ColAlign) => {
        const next = {
          ...tableRef.current,
          columns: tableRef.current.columns.map((c) => (c.id === colId ? { ...c, align } : c)),
        }
        setTable(next)
        emit(next)
        setActiveColMenu(null)
      },
      [emit],
    )

    const addRowAt = useCallback(
      (index: number, focusColId?: string) => {
        const prev = tableRef.current
        const newRow: InternalRow = {
          id: newRowId(),
          cells: Object.fromEntries(prev.columns.map((c) => [c.id, [] as InlineNode[]])),
        }
        const next = {
          ...prev,
          rows: [...prev.rows.slice(0, index), newRow, ...prev.rows.slice(index)],
        }
        setTable(next)
        emit(next)
        const targetColId = focusColId ?? prev.columns[0]?.id
        if (targetColId) {
          requestAnimationFrame(() => {
            cellRefs.current.get(`${newRow.id}-${targetColId}`)?.focus()
          })
        }
      },
      [emit],
    )

    const removeRow = useCallback(
      (rowId: string) => {
        const prev = tableRef.current
        if (prev.rows.length <= 1) return
        const idx = prev.rows.findIndex((r) => r.id === rowId)
        const next = { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) }
        setTable(next)
        emit(next)
        const targetRow = next.rows[Math.max(0, idx - 1)]
        const targetCol = prev.columns[0]
        if (targetRow && targetCol) {
          requestAnimationFrame(() => {
            cellRefs.current.get(`${targetRow.id}-${targetCol.id}`)?.focus()
          })
        }
      },
      [emit],
    )

    const addColumnAt = useCallback(
      (index: number) => {
        const prev = tableRef.current
        const newCol: InternalColumn = {
          id: newColId(),
          title: '',
          align: 'left',
          width: prev.columns.length <= 1 ? 180 : 120,
          manualWidth: false,
        }
        const next = {
          columns: [...prev.columns.slice(0, index), newCol, ...prev.columns.slice(index)],
          rows: prev.rows.map((r) => ({ ...r, cells: { ...r.cells, [newCol.id]: [] as InlineNode[] } })),
        }
        setTable(next)
        emit(next)
        requestAnimationFrame(() => {
          headerRefs.current.get(newCol.id)?.focus()
        })
        setActiveColMenu(null)
      },
      [emit],
    )

    const removeColumn = useCallback(
      (colId: string) => {
        const prev = tableRef.current
        if (prev.columns.length <= 1) return
        const next = {
          columns: prev.columns.filter((c) => c.id !== colId),
          rows: prev.rows.map((r) => {
            const cells = { ...r.cells }
            delete cells[colId]
            return { ...r, cells }
          }),
        }
        setTable(next)
        emit(next)
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

    const clearSelection = useCallback(() => {
      setSelectionAnchor(null)
      setSelectionFocus(null)
    }, [])

    const focusSelectionLayer = useCallback(() => {
      tableWrapRef.current?.focus({ preventScroll: true })
    }, [])

    const setRectSelection = useCallback((anchor: CellCoord, focus: CellCoord) => {
      setSelectionAnchor(anchor)
      setSelectionFocus(focus)
      focusSelectionLayer()
    }, [focusSelectionLayer])

    const updateCells = useCallback((updater: (prev: InternalTable) => InternalTable) => {
      const next = updater(tableRef.current)
      setTable(next)
      emit(next)
    }, [emit])

    const selectionBounds = getSelectionBounds(selectionAnchor, selectionFocus)
    const hasSelection = selectionBounds !== null
    const hasMultiSelection = selectionBounds !== null
      && (selectionBounds.rowStart !== selectionBounds.rowEnd || selectionBounds.colStart !== selectionBounds.colEnd)

    const isCellSelected = useCallback((rowIdx: number, colIdx: number) => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return false
      return rowIdx >= bounds.rowStart && rowIdx <= bounds.rowEnd && colIdx >= bounds.colStart && colIdx <= bounds.colEnd
    }, [selectionAnchor, selectionFocus])

    const serializeSelection = useCallback(() => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return ''
      return tableRef.current.rows
        .slice(bounds.rowStart, bounds.rowEnd + 1)
        .map((row) => tableRef.current.columns
          .slice(bounds.colStart, bounds.colEnd + 1)
          .map((col) => inlineNodesToPlainText(row.cells[col.id] ?? []))
          .join('\t'))
        .join('\n')
    }, [selectionAnchor, selectionFocus])

    const serializeSelectionMarkdown = useCallback(() => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return ''

      const rows = tableRef.current.rows
        .slice(bounds.rowStart, bounds.rowEnd + 1)
        .map((row) => tableRef.current.columns
          .slice(bounds.colStart, bounds.colEnd + 1)
          .map((col) => inlineNodesToPlainText(row.cells[col.id] ?? [])))

      if (rows.length === 0) return ''

      const formatRow = (cells: string[]) => `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`
      const separator = `| ${rows[0].map(() => '---').join(' | ')} |`

      return [
        formatRow(rows[0]),
        separator,
        ...rows.slice(1).map(formatRow),
      ].join('\n')
    }, [selectionAnchor, selectionFocus])

    const serializeSelectionHtml = useCallback(() => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return ''

      const rows = tableRef.current.rows
        .slice(bounds.rowStart, bounds.rowEnd + 1)
        .map((row) => tableRef.current.columns
          .slice(bounds.colStart, bounds.colEnd + 1)
          .map((col) => inlineNodesToPlainText(row.cells[col.id] ?? [])))

      if (rows.length === 0) return ''

      const body = rows
        .map((cells) => `<tr>${cells.map((cell) => `<td>${escapeHtml(cell).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`)
        .join('')

      return `<table><tbody>${body}</tbody></table>`
    }, [selectionAnchor, selectionFocus])

    const copySelectionToClipboard = useCallback((clipboardData?: DataTransfer | null) => {
      const payload = {
        plainText: serializeSelection(),
        html: serializeSelectionHtml(),
        markdown: serializeSelectionMarkdown(),
      }

      setClipboardEventData(clipboardData, payload)
      void writeClipboardPayload(payload)
    }, [serializeSelection, serializeSelectionHtml, serializeSelectionMarkdown])

    const clearSelectedCells = useCallback(() => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return
      updateCells((prev) => ({
        ...prev,
        rows: prev.rows.map((row, rowIdx) => {
          if (rowIdx < bounds.rowStart || rowIdx > bounds.rowEnd) return row
          const nextCells = { ...row.cells }
          prev.columns.forEach((col, colIdx) => {
            if (colIdx >= bounds.colStart && colIdx <= bounds.colEnd) {
              nextCells[col.id] = []
            }
          })
          return { ...row, cells: nextCells }
        }),
      }))
    }, [selectionAnchor, selectionFocus, updateCells])

    const pasteIntoSelection = useCallback((text: string) => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return false
      const rows = text.replace(/\r/g, '').split('\n').map((line) => line.split('\t'))
      if (rows.length === 0) return false

      updateCells((prev) => {
        const next = {
          ...prev,
          rows: prev.rows.map((row) => ({ ...row, cells: { ...row.cells } })),
        }

        if (rows.length === 1 && rows[0].length === 1 && hasMultiSelection) {
          for (let rowIdx = bounds.rowStart; rowIdx <= bounds.rowEnd; rowIdx += 1) {
            for (let colIdx = bounds.colStart; colIdx <= bounds.colEnd; colIdx += 1) {
              const row = next.rows[rowIdx]
              const col = prev.columns[colIdx]
              if (row && col) row.cells[col.id] = plainTextToInlineNodes(rows[0][0])
            }
          }
          return next
        }

        rows.forEach((line, rowOffset) => {
          const row = next.rows[bounds.rowStart + rowOffset]
          if (!row) return
          line.forEach((value, colOffset) => {
            const col = prev.columns[bounds.colStart + colOffset]
            if (!col) return
            row.cells[col.id] = plainTextToInlineNodes(value)
          })
        })

        return next
      })

      return true
    }, [selectionAnchor, selectionFocus, hasMultiSelection, updateCells])

    useEffect(() => {
      const handleMouseUp = () => {
        dragSelectRef.current = null
      }

      window.addEventListener('mouseup', handleMouseUp)
      return () => window.removeEventListener('mouseup', handleMouseUp)
    }, [])

    useEffect(() => {
      if (!hasSelection) return

      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as Node | null
        if (target && tableWrapRef.current && !tableWrapRef.current.contains(target) && document.activeElement !== tableWrapRef.current) {
          return
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault()
          event.stopPropagation()
          clearSelectedCells()
          focusSelectionLayer()
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          clearSelection()
        }
      }

      const handleCopy = (event: ClipboardEvent) => {
        const target = event.target as Node | null
        if (target && tableWrapRef.current && !tableWrapRef.current.contains(target) && document.activeElement !== tableWrapRef.current) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        copySelectionToClipboard(event.clipboardData)
      }

      const handlePaste = (event: ClipboardEvent) => {
        const target = event.target as Node | null
        if (target && tableWrapRef.current && !tableWrapRef.current.contains(target) && document.activeElement !== tableWrapRef.current) {
          return
        }

        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (!text) return

        event.preventDefault()
        event.stopPropagation()
        pasteIntoSelection(text)
        focusSelectionLayer()
      }

      window.addEventListener('keydown', handleKeyDown, true)
      window.addEventListener('copy', handleCopy, true)
      window.addEventListener('paste', handlePaste, true)

      return () => {
        window.removeEventListener('keydown', handleKeyDown, true)
        window.removeEventListener('copy', handleCopy, true)
        window.removeEventListener('paste', handlePaste, true)
      }
    }, [clearSelectedCells, clearSelection, copySelectionToClipboard, focusSelectionLayer, hasSelection, pasteIntoSelection])

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        const r = resizingRef.current
        if (!r) return

        const delta = e.clientX - r.startX
        const newWidth = Math.max(96, r.startWidth + delta)

        setTable((prev) => ({
          ...prev,
          columns: prev.columns.map((c) => (c.id === r.colId ? { ...c, width: newWidth, manualWidth: true } : c)),
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

    const alignClass = (align: ColAlign) =>
      align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

    return (
      <div className="group/table relative my-7 w-full">
        <div
          ref={tableWrapRef}
          tabIndex={-1}
          className="holo-scrollbar overflow-x-auto pb-1 outline-none"
          onMouseDown={(e) => {
            if (!(e.target as HTMLElement).closest('td, th, [data-block-type="table-cell"]')) {
              clearSelection()
            }
          }}
          onCopyCapture={(e) => {
            if (!hasSelection) return
            e.preventDefault()
            e.stopPropagation()
            copySelectionToClipboard(e.clipboardData)
          }}
          onPasteCapture={(e) => {
            if (!hasSelection) return
            const text = e.clipboardData.getData('text/plain')
            if (!text) return
            e.preventDefault()
            e.stopPropagation()
            pasteIntoSelection(text)
          }}
          onKeyDownCapture={(e) => {
            if (!hasSelection) return
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault()
              e.stopPropagation()
              clearSelectedCells()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              clearSelection()
            }
          }}
        >
          <table className="w-full min-w-max border-separate border-spacing-0 overflow-hidden rounded-holo-xl">
            <thead>
              <tr>
                <th className="w-[42px] min-w-[42px] border-b border-r border-holo-border-soft bg-white/[0.028] p-0 first:rounded-tl-holo-xl">
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      clearSelection()
                      onSelect?.()
                    }}
                    className="flex h-full min-h-11 w-full items-center justify-center rounded-tl-holo-xl text-holo-text-faint transition hover:bg-white/[0.04] hover:text-holo-text"
                    title="Sélectionner le tableau"
                    aria-label="Sélectionner le tableau"
                  >
                    <span className="text-sm leading-none">•</span>
                  </button>
                </th>

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
                      style={col.manualWidth ? { width: col.width, minWidth: col.width } : { minWidth: col.width }}
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
                            'min-w-0 flex-1 rounded-holo-sm border border-transparent bg-transparent px-0 py-1 font-semibold text-holo-text-muted outline-none placeholder:text-holo-text-faint transition',
                            'hover:bg-white/[0.025] focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:text-holo-text',
                            alignClass(col.align),
                          )}
                          placeholder="Colonne"
                        />

                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            if (activeColMenu === col.id) {
                              setActiveColMenu(null)
                              setColMenuPos(null)
                            } else {
                              const menuW = 208 // w-52
                              const left = Math.max(8, Math.min(rect.right - menuW, window.innerWidth - menuW - 8))
                              const top = rect.bottom + 4 + menuW > window.innerHeight
                                ? rect.top - menuW - 4
                                : rect.bottom + 4
                              setColMenuPos({ top, left })
                              setActiveColMenu(col.id)
                            }
                          }}
                          className={cn(
                            'absolute right-1 flex size-7 shrink-0 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-glass-hover hover:text-holo-text',
                            'group-hover/table:opacity-100',
                            activeColMenu === col.id && 'bg-holo-glass-hover opacity-100',
                          )}
                          aria-label={`Options colonne ${col.title || colIdx + 1}`}
                        >
                          <ChevronDown size={13} />
                        </button>

                        {activeColMenu === col.id && colMenuPos && createPortal(
                          <div
                            ref={menuRef}
                            style={{ position: 'fixed', top: colMenuPos.top, left: colMenuPos.left }}
                            className="z-[9999] w-52 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 text-left shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
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
                          </div>,
                          document.body
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
                        <span
                          onMouseDown={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return
                            e.preventDefault()
                            const anchor = e.shiftKey && selectionAnchor
                              ? { rowIdx: selectionAnchor.rowIdx, colIdx: 0 }
                              : { rowIdx, colIdx: 0 }
                            setRectSelection(anchor, { rowIdx, colIdx: table.columns.length - 1 })
                          }}
                          className={cn(
                            'text-xs font-medium tabular-nums text-holo-text-faint transition cursor-pointer px-2 py-1 rounded-holo-sm hover:bg-white/[0.04]',
                            hoveredRowId === row.id && 'opacity-0',
                          )}
                        >
                          {rowIdx + 1}
                        </span>

                        <button
                          onClick={() => removeRow(row.id)}
                          disabled={table.rows.length <= 1}
                          className="absolute inset-0 m-auto flex size-7 items-center justify-center rounded-holo-sm text-holo-text-faint opacity-0 transition hover:bg-holo-danger/10 hover:text-holo-danger group-hover/row:opacity-100 disabled:pointer-events-none disabled:opacity-20"
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
                      const cellContentVersion = getCellContentVersion(row.cells[col.id])
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
                            isCellSelected(rowIdx, colIdx) && 'bg-holo-primary/12 ring-1 ring-inset ring-holo-primary/35',
                            isActive && !isCellSelected(rowIdx, colIdx) && 'bg-holo-primary-surface/25',
                          )}
                          style={col.manualWidth ? { width: col.width, minWidth: col.width } : { minWidth: col.width }}
                        >
                          <div
                            onFocus={() => setActiveCell({ rowId: row.id, colId: col.id })}
                            onBlur={() => setActiveCell(null)}
                            onMouseDown={(e) => {
                              const clickedSelectedCell = isCellSelected(rowIdx, colIdx)

                              if (!e.shiftKey) {
                                dragSelectRef.current = { anchor: { rowIdx, colIdx }, active: false }
                                if (hasSelection && clickedSelectedCell) {
                                  e.preventDefault()
                                  focusSelectionLayer()
                                  return
                                }
                                if (hasSelection) clearSelection()
                                return
                              }
                              const anchor = selectionAnchor
                                ?? (activeCell
                                  ? {
                                      rowIdx: table.rows.findIndex((candidate) => candidate.id === activeCell.rowId),
                                      colIdx: table.columns.findIndex((candidate) => candidate.id === activeCell.colId),
                                    }
                                  : { rowIdx, colIdx })
                              if (anchor.rowIdx < 0 || anchor.colIdx < 0) return
                              e.preventDefault()
                              setRectSelection(anchor, { rowIdx, colIdx })
                            }}
                            onMouseEnter={(e) => {
                              if (e.buttons !== 1) return
                              const dragState = dragSelectRef.current
                              if (!dragState) return
                              if (dragState.anchor.rowIdx === rowIdx && dragState.anchor.colIdx === colIdx) return
                              if (!dragState.active) {
                                dragState.active = true
                              }
                              setRectSelection(dragState.anchor, { rowIdx, colIdx })
                            }}
                            onKeyDown={(e) => {
                              if (hasSelection && (e.key === 'Delete' || e.key === 'Backspace')) {
                                e.preventDefault()
                                e.stopPropagation()
                                clearSelectedCells()
                                return
                              }

                              if (hasSelection && e.key === 'Escape') {
                                e.preventDefault()
                                e.stopPropagation()
                                clearSelection()
                                return
                              }

                              if (e.key === 'Tab' && !e.shiftKey) {
                                e.preventDefault()
                                if (colIdx < table.columns.length - 1) focusCell(rowIdx, colIdx + 1)
                                else if (rowIdx < table.rows.length - 1) focusCell(rowIdx + 1, 0)
                                else if (onTabExit) onTabExit()
                                else addRowAt(table.rows.length)
                              } else if (e.key === 'Tab' && e.shiftKey) {
                                e.preventDefault()
                                if (colIdx > 0) focusCell(rowIdx, colIdx - 1)
                                else if (rowIdx > 0) focusCell(rowIdx - 1, table.columns.length - 1)
                              } else if (e.key === 'Escape' && onTabExit) {
                                e.preventDefault()
                                onTabExit()
                              }
                            }}
                          >
                            <InlineEditor
                              key={`${cellKey}:${cellContentVersion}`}
                              ref={(handle) => {
                                if (handle) cellRefs.current.set(cellKey, handle)
                                else cellRefs.current.delete(cellKey)
                              }}
                              initialContent={row.cells[col.id] ?? []}
                              onSave={(nodes) => saveCell(row.id, col.id, nodes)}
                              onEnterAtEnd={() => {
                                if (rowIdx < table.rows.length - 1) focusCell(rowIdx + 1, colIdx)
                                else addRowAt(table.rows.length, col.id)
                              }}
                              onBackspaceAtStart={() => {
                                const rowEmpty = table.columns.every(c => (table.rows[rowIdx]?.cells[c.id] ?? []).length === 0)
                                if (rowEmpty && table.rows.length > 1) removeRow(row.id)
                              }}
                              onArrowUp={(x) => rowIdx > 0 ? focusCell(rowIdx - 1, colIdx) : onArrowUp?.(x)}
                              onArrowDown={(x) => rowIdx < table.rows.length - 1 ? focusCell(rowIdx + 1, colIdx) : onArrowDown?.(x)}
                              blockType="table-cell"
                              placeholder="Saisir…"
                              className={cn(
                                'min-h-11 w-full px-3 py-3 leading-6 text-holo-text-soft outline-none',
                                'hover:bg-white/[0.012] focus-within:bg-white/[0.02]',
                                alignClass(col.align),
                              )}
                            />
                          </div>
                        </td>
                      )
                    })}

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
