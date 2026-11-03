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
  type CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  type ElementType,
} from 'react'
import { createPortal } from 'react-dom'
import { AlignCenter, AlignLeft, AlignRight, ArrowDownAZ, ArrowUpAZ, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { cn } from '../../../utils/global'
import { getCaretHint, registerPendingEditFlusher } from '../../../lib/editorFlush'
import { visibleOffset } from '../../../lib/realtime/caretAnchor'
import { alignSequences } from '../../../lib/alignSequences'
import { sameSpaces, singleSpliceDiff } from '../../../lib/realtime/encoding'
import { inlinesToMarkdown } from '../lib/inlinesToMarkdown'
import { ensureTableIds } from '../lib/sharedSnapshot'
import { InlineEditor } from '../InlineEditor'
import { setClipboardEventData } from '../lib/clipboard'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'
import type { InlineNode, TableColumnAggregation, TableColumnType, TableMetadata, TableNode } from '../lib/types'

type ColAlign = 'left' | 'center' | 'right'

type InternalColumn = {
  id: string
  title: string
  /** Contenu d'origine de l'en-tête (gras, lien…), réécrit tel quel tant que le titre n'est pas modifié. */
  titleNodes?: InlineNode[]
  /** null = alignement par défaut (`---` dans le markdown), conservé tel quel pour limiter le diff git */
  align: ColAlign | null
  type: TableColumnType
  aggregation: TableColumnAggregation
  color: string | null
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

type ColumnSortDirection = 'asc' | 'desc'
type ColumnMenuSubmenu = 'color' | 'aggregation' | 'type' | 'align'

const DEFAULT_TABLE_COLUMN_TYPE: TableColumnType = 'text'
const DEFAULT_TABLE_COLUMN_AGGREGATION: TableColumnAggregation = 'none'

const COLUMN_COLOR_OPTIONS: Array<{
  value: string | null
  label: string
  swatchClassName: string
  headerBackground: string | null
  cellBackground: string | null
  summaryAccent: string | null
}> = [
  {
    value: null,
    label: 'Aucune',
    swatchClassName: 'border border-holo-border-soft bg-transparent',
    headerBackground: null,
    cellBackground: null,
    summaryAccent: null,
  },
  {
    value: 'amber',
    label: 'Ambre',
    swatchClassName: 'bg-[#f59e0b]',
    headerBackground: 'rgba(245, 158, 11, 0.16)',
    cellBackground: 'rgba(245, 158, 11, 0.07)',
    summaryAccent: 'rgba(245, 158, 11, 0.45)',
  },
  {
    value: 'mint',
    label: 'Menthe',
    swatchClassName: 'bg-[#10b981]',
    headerBackground: 'rgba(16, 185, 129, 0.16)',
    cellBackground: 'rgba(16, 185, 129, 0.07)',
    summaryAccent: 'rgba(16, 185, 129, 0.45)',
  },
  {
    value: 'sky',
    label: 'Azur',
    swatchClassName: 'bg-[#38bdf8]',
    headerBackground: 'rgba(56, 189, 248, 0.16)',
    cellBackground: 'rgba(56, 189, 248, 0.07)',
    summaryAccent: 'rgba(56, 189, 248, 0.45)',
  },
  {
    value: 'rose',
    label: 'Rose',
    swatchClassName: 'bg-[#fb7185]',
    headerBackground: 'rgba(251, 113, 133, 0.16)',
    cellBackground: 'rgba(251, 113, 133, 0.07)',
    summaryAccent: 'rgba(251, 113, 133, 0.45)',
  },
]

const MAX_TABLE_COLUMN_WIDTH = 360
// Bornes d'un redimensionnement manuel (px)
const MIN_MANUAL_COLUMN_WIDTH = 56
const MAX_MANUAL_COLUMN_WIDTH = 960
const ROW_HANDLE_COLUMN_WIDTH = 42

const clampManualWidth = (width: number) =>
  Math.round(Math.min(MAX_MANUAL_COLUMN_WIDTH, Math.max(MIN_MANUAL_COLUMN_WIDTH, width)))

// Identifiants partagés d'un poste à l'autre (édition en temps réel) : aléatoires.
const newColId = () => `c-${crypto.randomUUID()}`
const newRowId = () => `r-${crypto.randomUUID()}`

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cellText = (cell: any): string =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cell?.children ?? []).map((n: any) => n.value ?? '').join('')

const toColAlign = (value: unknown): ColAlign | null => {
  if (value === 'left' || value === 'center' || value === 'right') return value
  return null
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
        case 'superscript':
        case 'subscript':
      case 'link':
        return inlineNodesToPlainText(node.children)
      case 'image':
        return node.alt ?? ''
      case 'inlineMath':
        return node.value
      case 'html':
        return /^<br\s*\/?>$/i.test(node.value.trim()) ? '\n' : ''
      default:
        return ''
    }
  }).join('')
}

/**
 * Un saut de ligne markdown ne peut pas exister dans une cellule GFM
 * (remark le transforme en espace) : on l'écrit `<br>`, la forme reconnue
 * par GitHub, VS Code et Obsidian.
 */
function breaksToHtmlLineBreaks(nodes: InlineNode[]): InlineNode[] {
  return nodes.map((node) => {
    if (node.type === 'break') return { type: 'html', value: '<br>' }
    if ('children' in node && Array.isArray(node.children)) {
      return { ...node, children: breaksToHtmlLineBreaks(node.children as InlineNode[]) } as InlineNode
    }
    return node
  })
}

/** Contenu d'une cellule, tel qu'il est écrit dans le markdown. */
function cellSignature(nodes: InlineNode[] | undefined): string {
  return inlinesToMarkdown(breaksToHtmlLineBreaks((nodes ?? []) as InlineNode[]))
}

function columnSignature(table: InternalTable, column: InternalColumn): string {
  return JSON.stringify([column.title, column.type, ...table.rows.map((row) => cellSignature(row.cells[column.id]))])
}

function rowSignature(columns: InternalColumn[], row: InternalRow): string {
  return JSON.stringify(columns.map((column) => cellSignature(row.cells[column.id])))
}

function sameColumnSettings(left: InternalColumn, right: InternalColumn): boolean {
  return left.title === right.title && left.align === right.align && left.type === right.type
    && left.aggregation === right.aggregation && left.color === right.color
    && left.width === right.width && Boolean(left.manualWidth) === Boolean(right.manualWidth)
}

/** Nouvelles lignes et colonnes, et cellules à redessiner (null : rien n'a changé). */
function describeTableChanges(current: InternalTable, columns: InternalColumn[], rows: InternalRow[]): { table: InternalTable; changedCells: string[] } | null {
  const currentRows = new Map(current.rows.map((row) => [row.id, row]))
  const changedCells: string[] = []
  for (const row of rows) {
    const previous = currentRows.get(row.id)
    for (const column of columns) {
      const before = previous?.cells[column.id]
      if (before === undefined || cellSignature(before) !== cellSignature(row.cells[column.id])) {
        changedCells.push(`${row.id}-${column.id}`)
      }
    }
  }
  const unchanged = changedCells.length === 0
    && rows.length === current.rows.length
    && rows.every((row, index) => row.id === current.rows[index].id)
    && columns.length === current.columns.length
    && columns.every((column, index) => column.id === current.columns[index].id && sameColumnSettings(column, current.columns[index]))
  return unchanged ? null : { table: { columns, rows }, changedCells }
}

/**
 * Applique le tableau reçu (modification d'un collègue) au tableau affiché :
 * les lignes et colonnes qui se correspondent gardent leur identifiant, une
 * ligne insérée au-dessus ne décale donc pas celle où l'on tape. Renvoie
 * null si rien n'a changé, sinon le tableau et les cellules à rafraîchir.
 */
function mergeIncomingTable(current: InternalTable, incoming: InternalTable): { table: InternalTable; changedCells: string[] } | null {
  // Identifiants partagés : lignes et colonnes se reconnaissent par identifiant.
  const currentIds = new Set([...current.columns.map((column) => column.id), ...current.rows.map((row) => row.id)])
  if ([...incoming.columns, ...incoming.rows].some((entry) => currentIds.has(entry.id))) {
    return describeTableChanges(current, incoming.columns, incoming.rows)
  }
  // Sinon (tableau lu sans identifiants) : par le contenu.
  const columnAlignment = alignSequences(
    current.columns.map((column) => columnSignature(current, column)),
    incoming.columns.map((column) => columnSignature(incoming, column)),
  )
  const columns = incoming.columns.map((column, index) => {
    const match = columnAlignment.matches[index]
    return match === -1 ? column : { ...column, id: current.columns[match].id }
  })
  const rowAlignment = alignSequences(
    current.rows.map((row) => rowSignature(current.columns, row)),
    incoming.rows.map((row) => rowSignature(incoming.columns, row)),
  )
  const rows = incoming.rows.map((row, index) => {
    const match = rowAlignment.matches[index]
    const cells: Record<string, InlineNode[]> = {}
    incoming.columns.forEach((column, columnIndex) => {
      cells[columns[columnIndex].id] = row.cells[column.id] ?? []
    })
    return { id: match === -1 ? row.id : current.rows[match].id, cells }
  })

  return describeTableChanges(current, columns, rows)
}

/** Position du curseur dans le texte d'un élément éditable. */
function caretTextOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const caret = selection.getRangeAt(0)
  if (!element.contains(caret.endContainer)) return 0
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(caret.endContainer, caret.endOffset)
  return range.toString().length
}

// Montant « pur » (chiffres, séparateurs, devise éventuelle) : seul ce cas est
// reformaté ; un texte libre comme « env. 1200 CHF » ou « 1,5k » est conservé.
const PLAIN_AMOUNT_PATTERN = /^(?:chf|eur|usd|fr\.?|€|\$)?\s*[+-]?\s*\d[\d'\s]*(?:[.,]\d+)?(?:\.-)?\s*(?:chf|eur|usd|fr\.?|€|\$)?$/i

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

function compareTableCellText(left: InlineNode[] | undefined, right: InlineNode[] | undefined, direction: ColumnSortDirection): number {
  const leftText = inlineNodesToPlainText(left ?? []).trim()
  const rightText = inlineNodesToPlainText(right ?? []).trim()

  if (!leftText && !rightText) return 0
  if (!leftText) return 1
  if (!rightText) return -1

  const order = leftText.localeCompare(rightText, 'fr', {
    numeric: true,
    sensitivity: 'base',
  })

  return direction === 'asc' ? order : -order
}

function toTableColumnType(value: unknown): TableColumnType {
  if (value === 'number' || value === 'currency' || value === 'date' || value === 'checkbox') return value
  return DEFAULT_TABLE_COLUMN_TYPE
}

function defaultAlignForColumnType(type: TableColumnType): ColAlign | null {
  if (type === 'number' || type === 'currency') return 'right'
  if (type === 'checkbox') return 'center'
  return null
}

function parseNumericLikeValue(value: string): number | null {
  const normalized = value
    .replace(/\s+/g, '')
    .replace(/€/g, '')
    .replace(/\$/g, '')
    .replace(/'/g, '')
    .replace(/,/g, '.')
    .replace(/\.-$/g, '')
    .replace(/[^0-9.+-]/g, '')

  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function parseDateLikeValue(value: string): number | null {
  const normalized = value.trim()
  if (!normalized) return null

  const isoLike = normalized.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoLike) {
    const year = Number(isoLike[1])
    const month = Number(isoLike[2])
    const day = Number(isoLike[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime()
    }
  }

  const frLike = normalized.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (frLike) {
    const day = Number(frLike[1])
    const month = Number(frLike[2])
    const year = Number(frLike[3])
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime()
    }
  }

  return null
}

function formatDateValue(timestamp: number): string {
  const date = new Date(timestamp)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

function formatCurrencyValue(value: number): string {
  const sign = value < 0 ? '-' : ''
  const absoluteValue = Math.abs(value)
  const rounded = Math.round(absoluteValue * 100) / 100
  const integerPart = Math.trunc(rounded)
  const decimalPart = Math.round((rounded - integerPart) * 100)
  const groupedInteger = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  if (decimalPart === 0) {
    return `${sign}${groupedInteger}.-`
  }
  return `${sign}${groupedInteger}.${String(decimalPart).padStart(2, '0')}`
}

function normalizeNodesForColumnType(type: TableColumnType, nodes: InlineNode[]): InlineNode[] {
  const text = inlineNodesToPlainText(nodes).trim()
  if (!text) return []

  if (type === 'currency') {
    if (!PLAIN_AMOUNT_PATTERN.test(text)) return nodes
    const numericValue = parseNumericLikeValue(text)
    if (numericValue === null) return nodes
    return plainTextToInlineNodes(formatCurrencyValue(numericValue))
  }

  if (type === 'date') {
    const dateValue = parseDateLikeValue(text)
    if (dateValue === null) return nodes
    return plainTextToInlineNodes(formatDateValue(dateValue))
  }

  return nodes
}

function parseCheckboxValue(value: string): number | null {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return 0
  if (['true', 'yes', 'oui', '1', 'x', '[x]', 'checked'].includes(normalized)) return 1
  if (['false', 'no', 'non', '0', '[ ]', 'unchecked'].includes(normalized)) return 0
  return null
}

function isCheckboxCellChecked(nodes: InlineNode[] | undefined): boolean {
  return parseCheckboxValue(inlineNodesToPlainText(nodes ?? [])) === 1
}

function checkboxCellNodes(checked: boolean): InlineNode[] {
  return checked ? [{ type: 'text', value: 'x' }] : []
}

// ─── DateCellInput ─────────────────────────────────────────────────────────────
// Champ texte libre qui formate la date on-blur.
// Accepte "01051988" (ddmmyyyy), "01/05/1988", "2025-05-01", etc.
function parseDateFreeText(raw: string): number | null {
  const digits = raw.replace(/\D/g, '')
  // Format compact ddmmyyyy (8 chiffres)
  if (digits.length === 8) {
    const day = Number(digits.slice(0, 2))
    const month = Number(digits.slice(2, 4))
    const year = Number(digits.slice(4, 8))
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime()
    }
  }
  // Format jour.mois sans année (ex. "01.05", "1.1") → année courante
  const dayMonth = raw.trim().match(/^(\d{1,2})[-/.](\d{1,2})$/)
  if (dayMonth) {
    const day = Number(dayMonth[1])
    const month = Number(dayMonth[2])
    const year = new Date().getFullYear()
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return date.getTime()
    }
  }
  return parseDateLikeValue(raw)
}

interface DateCellInputProps {
  storedNodes: InlineNode[] | undefined
  onSave: (nodes: InlineNode[]) => void
  onTab: () => void
  onShiftTab: () => void
  onEscape?: () => void
  cellRefKey: string
  cellRefs: React.MutableRefObject<Map<string, { focus(): void; clear(): void; clearSlash(): InlineNode[]; flush(): void; getContent(): InlineNode[] }>>
  ariaLabel: string
  alignClassName: string
}

function DateCellInput({ storedNodes, onSave, onTab, onShiftTab, onEscape, cellRefKey, cellRefs, ariaLabel, alignClassName }: DateCellInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayValue = useMemo(() => {
    const text = inlineNodesToPlainText(storedNodes ?? [])
    const ts = parseDateLikeValue(text)
    return ts === null ? text : formatDateValue(ts)
  }, [storedNodes])

  const [localValue, setLocalValue] = useState(displayValue)
  const [isFocused, setIsFocused] = useState(false)

  // Sync display when stored value changes externally
  const prevDisplayRef = useRef(displayValue)
  if (!isFocused && prevDisplayRef.current !== displayValue) {
    prevDisplayRef.current = displayValue
    setLocalValue(displayValue)
  }

  useEffect(() => {
    const cellRefEntry = {
      focus() { inputRef.current?.focus({ preventScroll: true }) },
      clear() { onSave([]); setLocalValue('') },
      clearSlash() { return [] as InlineNode[] },
      flush() {},
      getContent() { return [] as InlineNode[] },
    }
    cellRefs.current.set(cellRefKey, cellRefEntry)
    return () => { cellRefs.current.delete(cellRefKey) }
  }, [cellRefKey, cellRefs, onSave])

  const commitValue = useCallback((value: string) => {
    const ts = parseDateFreeText(value)
    if (!value.trim()) {
      onSave([])
    } else if (ts !== null) {
      onSave(plainTextToInlineNodes(formatDateValue(ts)))
    } else {
      // Texte libre non reconnu comme date (« fin mars », « à définir »…) :
      // on le conserve tel quel plutôt que de le perdre silencieusement.
      onSave(plainTextToInlineNodes(value.trim()))
    }
  }, [onSave])

  // Enregistrement forcé (Ctrl+S, pull, fermeture) pendant la saisie.
  useEffect(() => registerPendingEditFlusher(() => {
    if (isFocused && localValue !== displayValue) commitValue(localValue)
  }), [commitValue, displayValue, isFocused, localValue])

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={isFocused ? localValue : displayValue}
      placeholder="jj/mm/aaaa"
      aria-label={ariaLabel}
      onFocus={() => { setLocalValue(displayValue); setIsFocused(true) }}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={() => { setIsFocused(false); commitValue(localValue) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commitValue(localValue); inputRef.current?.blur() }
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); commitValue(localValue); requestAnimationFrame(onTab) }
        if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); commitValue(localValue); requestAnimationFrame(onShiftTab) }
        if (e.key === 'Escape' && onEscape) { e.preventDefault(); onEscape() }
      }}
      className={cn(
        'w-full min-w-0 rounded-holo-sm border border-white/10 bg-white/[0.03] px-2.5 py-2 text-sm text-holo-text-soft outline-none transition',
        'hover:bg-white/[0.05] focus:border-holo-border-soft focus:bg-white/[0.06] placeholder:text-holo-text-faint/50',
        alignClassName,
      )}
    />
  )
}

function getColumnColorStyles(color: string | null): { header: CSSProperties; cell: CSSProperties; summary: CSSProperties } {
  const option = COLUMN_COLOR_OPTIONS.find((entry) => entry.value === color)
  if (!option || !option.headerBackground || !option.cellBackground) {
    return { header: {}, cell: {}, summary: {} }
  }
  return {
    header: { backgroundColor: option.headerBackground },
    cell: { backgroundColor: option.cellBackground },
    summary: {
      boxShadow: option.summaryAccent ? `inset 0 1px 0 ${option.summaryAccent}` : undefined,
      color: option.summaryAccent ?? undefined,
    },
  }
}

function getColumnColorLabel(color: string | null): string {
  return COLUMN_COLOR_OPTIONS.find((entry) => entry.value === color)?.label ?? 'Aucune'
}

function toTableColumnAggregation(value: unknown): TableColumnAggregation {
  if (value === 'count' || value === 'sum' || value === 'avg' || value === 'min' || value === 'max' || value === 'checked') return value
  return DEFAULT_TABLE_COLUMN_AGGREGATION
}

function formatSummaryNumber(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function getAllowedAggregations(type: TableColumnType): TableColumnAggregation[] {
  if (type === 'number' || type === 'currency') return ['none', 'sum', 'avg', 'min', 'max', 'count']
  if (type === 'date') return ['none', 'min', 'max', 'count']
  if (type === 'checkbox') return ['none', 'checked', 'count']
  return ['none', 'count']
}

const AGGREGATION_LABELS: Record<TableColumnAggregation, string> = {
  none: 'Aucun',
  count: 'Compte',
  sum: 'Somme',
  avg: 'Moyenne',
  min: 'Min',
  max: 'Max',
  checked: 'Coches',
}

function computeColumnSummaryValue(column: InternalColumn, rows: InternalRow[]): string {
  const cellTexts = rows.map((row) => inlineNodesToPlainText(row.cells[column.id] ?? []).trim())
  const nonEmptyTexts = cellTexts.filter(Boolean)

  switch (column.aggregation) {
    case 'count':
      return `${AGGREGATION_LABELS.count} : ${nonEmptyTexts.length}`
    case 'sum': {
      const values = nonEmptyTexts.map(parseNumericLikeValue).filter((value): value is number => value !== null)
      const total = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0)
      const formatted = column.type === 'currency' ? formatCurrencyValue(total) : formatSummaryNumber(total)
      return `${AGGREGATION_LABELS.sum} : ${formatted}`
    }
    case 'avg': {
      const values = nonEmptyTexts.map(parseNumericLikeValue).filter((value): value is number => value !== null)
      const average = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
      const formatted = column.type === 'currency' ? formatCurrencyValue(average) : formatSummaryNumber(average)
      return `${AGGREGATION_LABELS.avg} : ${formatted}`
    }
    case 'min': {
      if (column.type === 'date') {
        const values = nonEmptyTexts.map(parseDateLikeValue).filter((value): value is number => value !== null)
        if (values.length === 0) return `${AGGREGATION_LABELS.min} : -`
        return `${AGGREGATION_LABELS.min} : ${formatDateValue(Math.min(...values))}`
      }
      const values = nonEmptyTexts.map(parseNumericLikeValue).filter((value): value is number => value !== null)
      if (values.length === 0) return `${AGGREGATION_LABELS.min} : 0`
      const minValue = Math.min(...values)
      const formatted = column.type === 'currency' ? formatCurrencyValue(minValue) : formatSummaryNumber(minValue)
      return `${AGGREGATION_LABELS.min} : ${formatted}`
    }
    case 'max': {
      if (column.type === 'date') {
        const values = nonEmptyTexts.map(parseDateLikeValue).filter((value): value is number => value !== null)
        if (values.length === 0) return `${AGGREGATION_LABELS.max} : -`
        return `${AGGREGATION_LABELS.max} : ${formatDateValue(Math.max(...values))}`
      }
      const values = nonEmptyTexts.map(parseNumericLikeValue).filter((value): value is number => value !== null)
      if (values.length === 0) return `${AGGREGATION_LABELS.max} : 0`
      const maxValue = Math.max(...values)
      const formatted = column.type === 'currency' ? formatCurrencyValue(maxValue) : formatSummaryNumber(maxValue)
      return `${AGGREGATION_LABELS.max} : ${formatted}`
    }
    case 'checked': {
      const checkedCount = cellTexts.filter((value) => parseCheckboxValue(value) === 1).length
      return `${AGGREGATION_LABELS.checked} : ${checkedCount} / ${rows.length}`
    }
    case 'none':
    default:
      return ''
  }
}

function compareTableCellValue(
  left: InlineNode[] | undefined,
  right: InlineNode[] | undefined,
  type: TableColumnType,
  direction: ColumnSortDirection,
): number {
  const leftText = inlineNodesToPlainText(left ?? []).trim()
  const rightText = inlineNodesToPlainText(right ?? []).trim()

  if (type === 'checkbox') {
    const leftCheckbox = parseCheckboxValue(leftText)
    const rightCheckbox = parseCheckboxValue(rightText)
    if (leftCheckbox !== null && rightCheckbox !== null) {
      return direction === 'asc' ? leftCheckbox - rightCheckbox : rightCheckbox - leftCheckbox
    }
  }

  if (type === 'date') {
    const leftDate = parseDateLikeValue(leftText)
    const rightDate = parseDateLikeValue(rightText)
    if (leftDate !== null && rightDate !== null) {
      return direction === 'asc' ? leftDate - rightDate : rightDate - leftDate
    }
  }

  if (!leftText && !rightText) return 0
  if (!leftText) return 1
  if (!rightText) return -1

  if (type === 'number' || type === 'currency') {
    const leftNumber = parseNumericLikeValue(leftText)
    const rightNumber = parseNumericLikeValue(rightText)
    if (leftNumber !== null && rightNumber !== null) {
      return direction === 'asc' ? leftNumber - rightNumber : rightNumber - leftNumber
    }
  }

  return compareTableCellText(left, right, direction)
}

function normalizeTableMetadata(metadata: TableMetadata | undefined, columnCount: number): TableMetadata | undefined {
  if (!metadata) return undefined

  const columnTypes = Array.from({ length: columnCount }, (_value, index) =>
    toTableColumnType(metadata.columnTypes?.[index]),
  )
  const columnColors = Array.from({ length: columnCount }, (_value, index) => metadata.columnColors?.[index] ?? null)
  const columnAggregations = Array.from({ length: columnCount }, (_value, index) =>
    toTableColumnAggregation(metadata.columnAggregations?.[index]),
  )
  const columnWidths = Array.from({ length: columnCount }, (_value, index) => {
    const width = metadata.columnWidths?.[index]
    return typeof width === 'number' && width > 0 ? clampManualWidth(width) : null
  })

  return {
    columnTypes,
    columnColors,
    columnAggregations,
    columnWidths,
  }
}

function isMarkdownTableSeparatorRow(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function splitMarkdownTableRow(line: string): string[] {
  let source = line.trim()
  if (source.startsWith('|')) source = source.slice(1)
  if (source.endsWith('|')) source = source.slice(0, -1)

  const cells: string[] = []
  let current = ''

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const next = source[index + 1]

    if (char === '\\' && (next === '|' || next === '\\')) {
      current += next
      index += 1
      continue
    }

    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function parseClipboardGridData(text: string): string[][] {
  const normalized = text.replace(/\r/g, '')
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (
    lines.length >= 2
    && /\|/.test(lines[0])
    && isMarkdownTableSeparatorRow(lines[1])
  ) {
    return lines
      .filter((line, index) => !(index === 1 && isMarkdownTableSeparatorRow(line)))
      .map(splitMarkdownTableRow)
  }

  return normalized.split('\n').map((line) => line.split('\t'))
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
  const maxWidth = Math.min(MAX_TABLE_COLUMN_WIDTH, totalColumns <= 2 ? 360 : totalColumns === 3 ? 240 : 200)
  const estimated = 56 + longest * 8
  return Math.max(minWidth, Math.min(maxWidth, estimated))
}

function recalculateAutoColumnWidths(table: InternalTable): InternalTable {
  const totalColumns = Math.max(1, table.columns.length)
  return {
    ...table,
    columns: table.columns.map((column) => {
      if (column.manualWidth) return column
      return {
        ...column,
        width: estimateColumnWidth(
          column.title,
          table.rows.map((row) => row.cells[column.id] ?? []),
          totalColumns,
        ),
      }
    }),
  }
}

function nodeToInternal(node: TableNode): InternalTable {
  const headerRow = node.children[0]

  const headerCells = headerRow?.children ?? []
  const bodyRows = node.children.slice(1)
  const totalColumns = Math.max(1, headerCells.length)
  const metadata = normalizeTableMetadata(node.data?.holoTable, totalColumns)
  // Identifiants des colonnes et lignes, rangés dans le nœud (partagés en temps réel).
  const ids = ensureTableIds(node)

  const columns: InternalColumn[] = headerCells.map((cell, i) => ({
    id: ids.columns[i],
    title: inlineNodesToPlainText((cell?.children ?? []) as InlineNode[]),
    titleNodes: (cell?.children ?? []) as InlineNode[],
    align: toColAlign(node.align?.[i]),
    type: metadata?.columnTypes?.[i] ?? DEFAULT_TABLE_COLUMN_TYPE,
    aggregation: metadata?.columnAggregations?.[i] ?? DEFAULT_TABLE_COLUMN_AGGREGATION,
    color: metadata?.columnColors?.[i] ?? null,
    width: metadata?.columnWidths?.[i] ?? estimateColumnWidth(
      cellText(cell),
      bodyRows.map((row) => (row.children[i]?.children ?? []) as InlineNode[]),
      totalColumns,
    ),
    manualWidth: typeof metadata?.columnWidths?.[i] === 'number',
  }))

  if (columns.length === 0) {
    columns.push({ id: ids.columns[0] ?? newColId(), title: '', align: null, type: DEFAULT_TABLE_COLUMN_TYPE, aggregation: DEFAULT_TABLE_COLUMN_AGGREGATION, color: null, width: 180, manualWidth: false })
  }

  const rows: InternalRow[] = node.children.slice(1).map((row, rowIndex) => {
    const cells: Record<string, InlineNode[]> = {}

    columns.forEach((column, ci) => {
      cells[column.id] = (row.children[ci]?.children ?? []) as InlineNode[]
    })

    return {
      id: ids.rows[rowIndex] ?? newRowId(),
      cells,
    }
  })

  if (rows.length === 0) {
    rows.push({ id: newRowId(), cells: Object.fromEntries(columns.map((c) => [c.id, [] as InlineNode[]])) })
  }

  return { columns, rows }
}

function internalToNode(t: InternalTable): TableNode {
  const metadata: TableMetadata = {
    columnTypes: t.columns.map((column) => column.type),
    columnColors: t.columns.map((column) => column.color),
    columnAggregations: t.columns.map((column) => column.aggregation),
    columnWidths: t.columns.map((column) => (column.manualWidth ? clampManualWidth(column.width) : null)),
  }

  return {
    type: 'table',
    align: t.columns.map((c) => c.align),
    data: {
      holoTable: metadata,
      holoIds: { columns: t.columns.map((column) => column.id), rows: t.rows.map((row) => row.id) },
    },
    children: [
      {
        type: 'tableRow' as const,
        children: t.columns.map((c) => ({
          type: 'tableCell' as const,
          children: c.titleNodes && inlineNodesToPlainText(c.titleNodes) === c.title
            ? breaksToHtmlLineBreaks(c.titleNodes)
            : c.title ? [{ type: 'text' as const, value: c.title }] : [],
        })),
      },
      ...t.rows.map((row) => ({
        type: 'tableRow' as const,
        children: t.columns.map((c) => ({
          type: 'tableCell' as const,
          children: breaksToHtmlLineBreaks((row.cells[c.id] ?? []) as InlineNode[]),
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

const COLUMN_TYPE_OPTIONS: { value: TableColumnType; label: string }[] = [
  { value: 'text', label: 'Texte' },
  { value: 'number', label: 'Nombre' },
  { value: 'currency', label: 'Monetaire' },
  { value: 'date', label: 'Date' },
  { value: 'checkbox', label: 'Checkbox' },
]

function getColumnTypeLabel(type: TableColumnType): string {
  return COLUMN_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? 'Texte'
}

function getAlignLabel(align: ColAlign | null): string {
  return ALIGN_OPTIONS.find((option) => option.value === align)?.label ?? 'Gauche'
}

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
    const [activeColSubmenu, setActiveColSubmenu] = useState<ColumnMenuSubmenu | null>(null)
    const [colMenuPos, setColMenuPos] = useState<{ top: number; left: number } | null>(null)
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null)
    const [selectionAnchor, setSelectionAnchor] = useState<CellCoord | null>(null)
    const [selectionFocus, setSelectionFocus] = useState<CellCoord | null>(null)

    const cellRefs = useRef<Map<string, InlineEditorHandle>>(new Map())
    const headerRefs = useRef<Map<string, HTMLInputElement>>(new Map())

    // Modification reçue d'un collègue : le bloc garde son identité et le
    // tableau est mis à jour sur place. Seules les cellules modifiées sont
    // remontées ; si c'est celle où l'on tape, le curseur est replacé au même
    // endroit du texte.
    const [cellRevisions, setCellRevisions] = useState<Record<string, number>>({})
    const pendingCellFocusRef = useRef<{ cellKey: string; offset: number; text: string } | null>(null)
    const lastNodeRef = useRef(node)
    useLayoutEffect(() => {
      if (lastNodeRef.current === node) return
      lastNodeRef.current = node
      const merged = mergeIncomingTable(tableRef.current, nodeToInternal(node))
      if (!merged) return
      const active = document.activeElement as HTMLElement | null
      const activeCellKey = (active?.closest('[data-table-cell-key]') as HTMLElement | null)?.dataset.tableCellKey
      if (active && activeCellKey && merged.changedCells.includes(activeCellKey)) {
        pendingCellFocusRef.current = { cellKey: activeCellKey, offset: caretTextOffset(active), text: active.textContent ?? '' }
      }
      tableRef.current = merged.table
      setTable(merged.table)
      setCellRevisions((previous) => {
        const next = { ...previous }
        for (const key of merged.changedCells) next[key] = (next[key] ?? 0) + 1
        return next
      })
    }, [node])
    useLayoutEffect(() => {
      const pending = pendingCellFocusRef.current
      if (!pending) return
      pendingCellFocusRef.current = null
      const editable = document.querySelector<HTMLElement>(`[data-table-cell-key="${pending.cellKey}"] [contenteditable="true"]`)
      let offset = pending.offset
      // Curseur suivi par la session dans le texte partagé de la cellule, sinon estimation.
      const hint = getCaretHint()
      const cellElement = document.querySelector<HTMLElement>(`[data-table-cell-key="${pending.cellKey}"]`)
      const [hintRow, hintColumn] = [cellElement?.dataset.rowId ?? '', cellElement?.dataset.columnId ?? '']
      const hinted = hint?.field && 'cell' in hint.field && hint.field.cell.rowId === hintRow && hint.field.cell.columnId === hintColumn
        ? visibleOffset(cellSignature(tableRef.current.rows.find((row) => row.id === hintRow)?.cells[hintColumn]), hint.index)
        : null
      const splice = hinted === null && editable ? singleSpliceDiff(sameSpaces(pending.text), sameSpaces(editable.textContent ?? '')) : null
      if (hinted !== null) offset = hinted
      else if (splice && splice.index < offset) offset = Math.max(splice.index, offset + splice.insert.length - splice.remove)
      cellRefs.current.get(pending.cellKey)?.focus({ type: 'offset', offset })
    }, [cellRevisions])
    const menuRef = useRef<HTMLDivElement | null>(null)
    const resizingRef = useRef<{ colId: string; startX: number; startWidth: number; moved?: boolean } | null>(null)
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
      flush() {
        for (const editor of cellRefs.current.values()) {
          editor.flush?.()
        }
      },
      getContent() {
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
        const columnType = tableRef.current.columns.find((column) => column.id === colId)?.type ?? DEFAULT_TABLE_COLUMN_TYPE
        const normalizedNodes = normalizeNodesForColumnType(columnType, nodes)
        const next = recalculateAutoColumnWidths({
          ...tableRef.current,
          rows: tableRef.current.rows.map((r) =>
            r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: normalizedNodes } } : r,
          ),
        })
        setTable(next)
        emit(next)
      },
      [emit],
    )

    const renameColumn = useCallback(
      (colId: string, title: string) => {
        const next = recalculateAutoColumnWidths({
          ...tableRef.current,
          columns: tableRef.current.columns.map((c) => (c.id === colId ? { ...c, title } : c)),
        })
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

    const sortRowsByColumn = useCallback(
      (colId: string, direction: ColumnSortDirection) => {
        const next = {
          ...tableRef.current,
          rows: [...tableRef.current.rows].sort((leftRow, rightRow) =>
            compareTableCellValue(
              leftRow.cells[colId],
              rightRow.cells[colId],
              tableRef.current.columns.find((column) => column.id === colId)?.type ?? DEFAULT_TABLE_COLUMN_TYPE,
              direction,
            ),
          ),
        }
        setTable(next)
        emit(next)
        setSelectionAnchor(null)
        setSelectionFocus(null)
        setActiveCell(null)
        setActiveColMenu(null)
        setActiveColSubmenu(null)
        setColMenuPos(null)
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
        const next = recalculateAutoColumnWidths({
          ...prev,
          rows: [...prev.rows.slice(0, index), newRow, ...prev.rows.slice(index)],
        })
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
        const next = recalculateAutoColumnWidths({ ...prev, rows: prev.rows.filter((r) => r.id !== rowId) })
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
          align: null,
          type: DEFAULT_TABLE_COLUMN_TYPE,
          aggregation: DEFAULT_TABLE_COLUMN_AGGREGATION,
          color: null,
          width: prev.columns.length <= 1 ? 180 : 120,
          manualWidth: false,
        }
        const next = recalculateAutoColumnWidths({
          columns: [...prev.columns.slice(0, index), newCol, ...prev.columns.slice(index)],
          rows: prev.rows.map((r) => ({ ...r, cells: { ...r.cells, [newCol.id]: [] as InlineNode[] } })),
        })
        setTable(next)
        emit(next)
        requestAnimationFrame(() => {
          headerRefs.current.get(newCol.id)?.focus()
        })
        setActiveColMenu(null)
        setActiveColSubmenu(null)
      },
      [emit],
    )

    const setColumnType = useCallback(
      (colId: string, type: TableColumnType) => {
        const next = {
          ...tableRef.current,
          columns: tableRef.current.columns.map((column) =>
            column.id === colId
              ? {
                  ...column,
                  type,
                  align: defaultAlignForColumnType(type),
                  aggregation: getAllowedAggregations(type).includes(column.aggregation)
                    ? column.aggregation
                    : DEFAULT_TABLE_COLUMN_AGGREGATION,
                }
              : column,
          ),
          rows: tableRef.current.rows.map((row) => ({
            ...row,
            cells: Object.fromEntries(
              tableRef.current.columns.map((column) => [
                column.id,
                column.id === colId
                  ? normalizeNodesForColumnType(type, row.cells[column.id] ?? [])
                  : row.cells[column.id] ?? [],
              ]),
            ),
          })),
        }
        setTable(next)
        emit(next)
        setActiveColMenu(null)
        setActiveColSubmenu(null)
        setColMenuPos(null)
      },
      [emit],
    )

    const setColumnAggregation = useCallback(
      (colId: string, aggregation: TableColumnAggregation) => {
        const next = {
          ...tableRef.current,
          columns: tableRef.current.columns.map((column) =>
            column.id === colId
              ? { ...column, aggregation }
              : column,
          ),
        }
        setTable(next)
        emit(next)
        setActiveColMenu(null)
        setActiveColSubmenu(null)
        setColMenuPos(null)
      },
      [emit],
    )

    const setColumnColor = useCallback(
      (colId: string, color: string | null) => {
        const next = {
          ...tableRef.current,
          columns: tableRef.current.columns.map((column) =>
            column.id === colId
              ? { ...column, color }
              : column,
          ),
        }
        setTable(next)
        emit(next)
        setActiveColMenu(null)
        setActiveColSubmenu(null)
        setColMenuPos(null)
      },
      [emit],
    )

    const removeColumn = useCallback(
      (colId: string) => {
        const prev = tableRef.current
        if (prev.columns.length <= 1) return
        const next = recalculateAutoColumnWidths({
          columns: prev.columns.filter((c) => c.id !== colId),
          rows: prev.rows.map((r) => {
            const cells = { ...r.cells }
            delete cells[colId]
            return { ...r, cells }
          }),
        })
        setTable(next)
        emit(next)
        setActiveColMenu(null)
        setActiveColSubmenu(null)
      },
      [emit],
    )

    useEffect(() => {
      setActiveColSubmenu(null)
    }, [activeColMenu])

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
    const hasSummaryRow = table.columns.some((column) => column.aggregation !== 'none')

    const isCellSelected = useCallback((rowIdx: number, colIdx: number) => {
      const bounds = getSelectionBounds(selectionAnchor, selectionFocus)
      if (!bounds) return false
      return rowIdx >= bounds.rowStart && rowIdx <= bounds.rowEnd && colIdx >= bounds.colStart && colIdx <= bounds.colEnd
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
        html: serializeSelectionHtml(),
        markdown: serializeSelectionMarkdown(),
      }

      setClipboardEventData(clipboardData, payload)
    }, [serializeSelectionHtml, serializeSelectionMarkdown])

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
      const rows = parseClipboardGridData(text)
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
        const newWidth = clampManualWidth(r.startWidth + delta)
        r.moved = true

        setTable((prev) => {
          const next = {
            ...prev,
            columns: prev.columns.map((c) => (c.id === r.colId ? { ...c, width: newWidth, manualWidth: true } : c)),
          }
          tableRef.current = next
          return next
        })
      }

      const onMouseUp = () => {
        const r = resizingRef.current
        if (!r) return
        resizingRef.current = null
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        // Les largeurs sont enregistrées dans le commentaire holo:table du document.
        if (r.moved) emit(tableRef.current)
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)

      return () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }
    }, [emit])

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

    const alignClass = (align: ColAlign | null) =>
      align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'

    // Dès qu'une largeur a été choisie à la main, la mise en page devient fixe :
    // chaque colonne fait exactement sa largeur (elle peut donc rétrécir sous
    // la largeur de son contenu, qui passe alors à la ligne).
    const hasManualWidths = table.columns.some((column) => column.manualWidth)
    const tableWidthClass = hasManualWidths ? '' : table.columns.length <= 3 ? 'w-full' : 'w-auto'
    const tableLayoutStyle: CSSProperties = hasManualWidths
      ? {
          tableLayout: 'fixed',
          width: ROW_HANDLE_COLUMN_WIDTH + table.columns.reduce((total, column) => total + getColumnWidth(column), 0),
        }
      : { minWidth: '100%' }

    function getColumnWidth(column: InternalColumn): number {
      return column.manualWidth ? clampManualWidth(column.width) : Math.min(column.width, MAX_TABLE_COLUMN_WIDTH)
    }

    const getColumnSizeStyle = (column: InternalColumn): CSSProperties => {
      const width = getColumnWidth(column)
      return { width, minWidth: width, maxWidth: width }
    }

    const startColumnResize = (event: React.MouseEvent, colId: string) => {
      event.preventDefault()
      event.stopPropagation()
      // Première largeur manuelle : on fige toutes les colonnes à leur largeur
      // affichée pour que le tableau ne saute pas en passant en mise en page fixe.
      const headerCells = Array.from(
        (event.currentTarget.closest('tr')?.querySelectorAll<HTMLTableCellElement>('th[data-column-id]')) ?? [],
      )
      const renderedWidths = new Map(headerCells.map((cell) => [cell.dataset.columnId ?? '', cell.getBoundingClientRect().width]))
      const current = tableRef.current
      if (!current.columns.some((column) => column.manualWidth)) {
        const frozen = {
          ...current,
          columns: current.columns.map((column) => ({
            ...column,
            width: clampManualWidth(renderedWidths.get(column.id) ?? column.width),
            manualWidth: true,
          })),
        }
        tableRef.current = frozen
        setTable(frozen)
      }
      const column = tableRef.current.columns.find((entry) => entry.id === colId)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      resizingRef.current = {
        colId,
        startX: event.clientX,
        startWidth: renderedWidths.get(colId) ?? column?.width ?? 120,
      }
    }

    const resetColumnWidths = () => {
      const next = recalculateAutoColumnWidths({
        ...tableRef.current,
        columns: tableRef.current.columns.map((column) => ({ ...column, manualWidth: false })),
      })
      tableRef.current = next
      setTable(next)
      emit(next)
    }

    const toggleColumnSubmenu = (submenu: ColumnMenuSubmenu) => {
      setActiveColSubmenu((current) => current === submenu ? null : submenu)
    }

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
          <table
            className={cn('border-separate border-spacing-0 overflow-hidden rounded-holo-xl', tableWidthClass)}
            style={tableLayoutStyle}
          >
            <colgroup>
              <col style={{ width: ROW_HANDLE_COLUMN_WIDTH, minWidth: ROW_HANDLE_COLUMN_WIDTH, maxWidth: ROW_HANDLE_COLUMN_WIDTH }} />
              {table.columns.map((column) => (
                <col key={`${column.id}-col`} style={getColumnSizeStyle(column)} />
              ))}
            </colgroup>
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
                    (() => {
                      const columnColorStyles = getColumnColorStyles(col.color)
                      const columnStyle = getColumnSizeStyle(col)

                      return (
                    <th
                      key={col.id}
                      className={cn(
                        'relative border-b border-holo-border-soft bg-white/[0.055] p-0',
                        !isLastCol && 'border-r',
                        isLastCol && 'rounded-tr-holo-xl',
                        alignClass(col.align),
                      )}
                      style={{ ...columnStyle, ...columnColorStyles.header }}
                      data-column-color={col.color ?? undefined}
                      data-column-id={col.id}
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
                          title={col.title}
                          placeholder="Colonne"
                          size={1}
                        />

                        <button
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            if (activeColMenu === col.id) {
                              setActiveColMenu(null)
                              setActiveColSubmenu(null)
                              setColMenuPos(null)
                            } else {
                              const menuWidth = 208 // w-52
                              const menuHeight = Math.min(window.innerHeight * 0.8, 520)
                              const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
                              const top = rect.bottom + 4 + menuHeight > window.innerHeight
                                ? Math.max(8, rect.top - menuHeight - 4)
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
                            className="z-[9999] max-h-[80vh] w-52 overflow-y-auto overflow-x-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 text-left shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
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

                            <button
                              onClick={() => toggleColumnSubmenu('type')}
                              className="flex w-full items-center justify-between gap-2 rounded-holo-md px-2.5 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                              aria-expanded={activeColSubmenu === 'type'}
                              aria-label={`Type ${getColumnTypeLabel(col.type)}`}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span>Type</span>
                                <span className="text-[11px] text-holo-text-faint">{getColumnTypeLabel(col.type)}</span>
                              </span>
                              <ChevronDown size={13} className={cn('shrink-0 transition-transform', activeColSubmenu === 'type' && 'rotate-180')} />
                            </button>

                            {activeColSubmenu === 'type' && (
                              <div className="mt-1 space-y-0.5 pl-2">
                                {COLUMN_TYPE_OPTIONS.map(({ value, label }) => (
                                  <button
                                    key={value}
                                    onClick={() => setColumnType(col.id, value)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm transition',
                                      col.type === value
                                        ? 'bg-holo-primary-surface text-holo-primary-soft'
                                        : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                                    )}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}

                            <button
                              onClick={() => toggleColumnSubmenu('aggregation')}
                              className="mt-1 flex w-full items-center justify-between gap-2 rounded-holo-md px-2.5 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                              aria-expanded={activeColSubmenu === 'aggregation'}
                              aria-label={`Résumé ${AGGREGATION_LABELS[col.aggregation]}`}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span>Résumé</span>
                                <span className="text-[11px] text-holo-text-faint">{AGGREGATION_LABELS[col.aggregation]}</span>
                              </span>
                              <ChevronDown size={13} className={cn('shrink-0 transition-transform', activeColSubmenu === 'aggregation' && 'rotate-180')} />
                            </button>

                            {activeColSubmenu === 'aggregation' && (
                              <div className="mt-1 space-y-0.5 pl-2">
                                {getAllowedAggregations(col.type).map((value) => (
                                  <button
                                    key={value}
                                    onClick={() => setColumnAggregation(col.id, value)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm transition',
                                      col.aggregation === value
                                        ? 'bg-holo-primary-surface text-holo-primary-soft'
                                        : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                                    )}
                                  >
                                    {AGGREGATION_LABELS[value]}
                                  </button>
                                ))}
                              </div>
                            )}

                            <button
                              onClick={() => toggleColumnSubmenu('color')}
                              className="mt-1 flex w-full items-center justify-between gap-2 rounded-holo-md px-2.5 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                              aria-expanded={activeColSubmenu === 'color'}
                              aria-label={`Couleur ${getColumnColorLabel(col.color)}`}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span>Couleur</span>
                                <span className="text-[11px] text-holo-text-faint">{getColumnColorLabel(col.color)}</span>
                              </span>
                              <ChevronDown size={13} className={cn('shrink-0 transition-transform', activeColSubmenu === 'color' && 'rotate-180')} />
                            </button>

                            {activeColSubmenu === 'color' && (
                              <div className="mt-1 space-y-0.5 pl-2">
                                {COLUMN_COLOR_OPTIONS.map(({ value, label, swatchClassName }) => (
                                  <button
                                    key={value ?? 'none'}
                                    onClick={() => setColumnColor(col.id, value)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm transition',
                                      col.color === value
                                        ? 'bg-holo-primary-surface text-holo-primary-soft'
                                        : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                                    )}
                                  >
                                    <span className={cn('size-3 rounded-full', swatchClassName)} />
                                    {label}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="my-1 h-px bg-holo-border-soft" />

                            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
                              Tri
                            </div>

                            <button
                              onClick={() => sortRowsByColumn(col.id, 'asc')}
                              className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                            >
                              <ArrowUpAZ size={13} /> Trier A-Z
                            </button>

                            <button
                              onClick={() => sortRowsByColumn(col.id, 'desc')}
                              className="flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                            >
                              <ArrowDownAZ size={13} /> Trier Z-A
                            </button>

                            <div className="my-1 h-px bg-holo-border-soft" />

                            <button
                              onClick={() => toggleColumnSubmenu('align')}
                              className="flex w-full items-center justify-between gap-2 rounded-holo-md px-2.5 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
                              aria-expanded={activeColSubmenu === 'align'}
                              aria-label={`Alignement ${getAlignLabel(col.align)}`}
                            >
                              <span className="flex min-w-0 flex-col">
                                <span>Alignement</span>
                                <span className="text-[11px] text-holo-text-faint">{getAlignLabel(col.align)}</span>
                              </span>
                              <ChevronDown size={13} className={cn('shrink-0 transition-transform', activeColSubmenu === 'align' && 'rotate-180')} />
                            </button>

                            {activeColSubmenu === 'align' && (
                              <div className="mt-1 space-y-0.5 pl-2">
                                {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
                                  <button
                                    key={value}
                                    onClick={() => setColumnAlign(col.id, value)}
                                    className={cn(
                                      'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-sm transition',
                                      (col.align ?? 'left') === value
                                        ? 'bg-holo-primary-surface text-holo-primary-soft'
                                        : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                                    )}
                                  >
                                    <Icon size={13} /> {label}
                                  </button>
                                ))}
                              </div>
                            )}

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
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionner la colonne ${col.title || colIdx + 1}`}
                        title="Glisser pour redimensionner · double-clic pour revenir aux largeurs automatiques"
                        className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize opacity-0 transition after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full hover:opacity-100 hover:after:bg-holo-primary/60 group-hover/table:opacity-100"
                        onMouseDown={(e) => startColumnResize(e, col.id)}
                        onDoubleClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          resetColumnWidths()
                        }}
                      />
                    </th>
                      )
                    })()
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
                      const isActive = activeCell?.rowId === row.id && activeCell.colId === col.id
                      const isLastCol = colIdx === table.columns.length - 1
                      const isCheckboxColumn = col.type === 'checkbox'
                      const isDateColumn = col.type === 'date'
                      const isChecked = isCheckboxCellChecked(row.cells[col.id])
                      const columnColorStyles = getColumnColorStyles(col.color)

                      return (
                        <td
                          key={`${cellKey}:${cellRevisions[cellKey] ?? 0}`}
                          data-table-cell-key={cellKey}
                          data-row-id={row.id}
                          data-column-id={col.id}
                          className={cn(
                            'bg-transparent p-0',
                            !isLastRow && 'border-b border-holo-border-soft',
                            !isLastCol && 'border-r border-holo-border-soft',
                            isLastRow && isLastCol && 'rounded-br-holo-xl',
                            isCellSelected(rowIdx, colIdx) && 'bg-holo-primary/12 ring-1 ring-inset ring-holo-primary/35',
                            isActive && !isCellSelected(rowIdx, colIdx) && 'bg-holo-primary-surface/25',
                          )}
                          style={{ ...getColumnSizeStyle(col), ...columnColorStyles.cell }}
                          data-column-color={col.color ?? undefined}
                        >
                          <div
                            onFocus={() => setActiveCell({ rowId: row.id, colId: col.id })}
                            onBlur={() => setActiveCell(null)}
                            onMouseDown={(e) => {
                              const clickedSelectedCell = isCellSelected(rowIdx, colIdx)

                              if (!e.shiftKey) {
                                dragSelectRef.current = { anchor: { rowIdx, colIdx }, active: false }
                                if (hasSelection && clickedSelectedCell) {
                                  clearSelection()
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
                            {isCheckboxColumn ? (
                              <label
                                className="flex min-h-11 w-full cursor-pointer items-center justify-center px-3 py-3"
                              >
                                <input
                                  ref={(el) => {
                                    if (el) {
                                      cellRefs.current.set(cellKey, {
                                        focus() {
                                          el.focus({ preventScroll: true })
                                        },
                                        clear() {
                                          el.checked = false
                                        },
                                        clearSlash() {
                                          return []
                                        },
                                        flush() {},
                                        getContent() {
                                          return []
                                        },
                                      })
                                    } else {
                                      cellRefs.current.delete(cellKey)
                                    }
                                  }}
                                  type="checkbox"
                                  checked={isChecked}
                                  aria-label={`${col.title || `Colonne ${colIdx + 1}`} ligne ${rowIdx + 1}`}
                                  onChange={(event) => saveCell(row.id, col.id, checkboxCellNodes(event.currentTarget.checked))}
                                  onKeyDown={(e) => {
                                    // Cellule cible existante : focus immédiat (un focus différé
                                    // pourrait reprendre la main après une action ultérieure).
                                    if (e.key === 'Tab' && !e.shiftKey) {
                                      e.preventDefault()
                                      if (colIdx < table.columns.length - 1) focusCell(rowIdx, colIdx + 1)
                                      else if (rowIdx < table.rows.length - 1) focusCell(rowIdx + 1, 0)
                                      else if (onTabExit) requestAnimationFrame(onTabExit)
                                      else requestAnimationFrame(() => addRowAt(table.rows.length))
                                      return
                                    }

                                    if (e.key === 'Tab' && e.shiftKey) {
                                      e.preventDefault()
                                      if (colIdx > 0) focusCell(rowIdx, colIdx - 1)
                                      else if (rowIdx > 0) focusCell(rowIdx - 1, table.columns.length - 1)
                                      return
                                    }

                                    if (e.key === 'Escape' && onTabExit) {
                                      e.preventDefault()
                                      onTabExit()
                                    }
                                  }}
                                  className={cn(
                                    'size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-white/30 bg-white/[0.03] shadow-[0_0_0_0_rgba(123,97,255,0.0)] transition-all duration-150',
                                    'checked:border-holo-primary checked:bg-holo-primary checked:shadow-[0_0_0_3px_rgba(123,97,255,0.15)]',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-holo-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-holo-bg',
                                  )}
                                />
                              </label>
                            ) : isDateColumn ? (
                              <div className="relative flex min-h-11 w-full items-center px-3 py-2">
                                <DateCellInput
                                  storedNodes={row.cells[col.id]}
                                  onSave={(nodes) => saveCell(row.id, col.id, nodes)}
                                  onTab={() => {
                                    if (colIdx < table.columns.length - 1) focusCell(rowIdx, colIdx + 1)
                                    else if (rowIdx < table.rows.length - 1) focusCell(rowIdx + 1, 0)
                                    else if (onTabExit) onTabExit()
                                    else addRowAt(table.rows.length)
                                  }}
                                  onShiftTab={() => {
                                    if (colIdx > 0) focusCell(rowIdx, colIdx - 1)
                                    else if (rowIdx > 0) focusCell(rowIdx - 1, table.columns.length - 1)
                                  }}
                                  onEscape={onTabExit}
                                  cellRefKey={cellKey}
                                  cellRefs={cellRefs}
                                  ariaLabel={`${col.title || `Colonne ${colIdx + 1}`} ligne ${rowIdx + 1}`}
                                  alignClassName={alignClass(col.align)}
                                />
                              </div>
                            ) : (
                              <InlineEditor
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
                                selectAllOnFocus
                                className={cn(
                                  'min-h-11 w-full min-w-0 max-w-full whitespace-normal px-3 py-3 leading-6 text-holo-text-soft outline-none [overflow-wrap:anywhere]',
                                  'hover:bg-white/[0.012] focus-within:bg-white/[0.02]',
                                  alignClass(col.align),
                                )}
                              />
                            )}
                          </div>
                        </td>
                      )
                    })}

                  </tr>
                )
              })}
            </tbody>

          </table>
          {hasSummaryRow && (
            <table
              className={cn('mt-2 border-separate border-spacing-0', tableWidthClass)}
              style={tableLayoutStyle}
            >
              <colgroup>
                <col style={{ width: ROW_HANDLE_COLUMN_WIDTH, minWidth: ROW_HANDLE_COLUMN_WIDTH, maxWidth: ROW_HANDLE_COLUMN_WIDTH }} />
                {table.columns.map((column) => (
                  <col key={`${column.id}-summary-col`} style={getColumnSizeStyle(column)} />
                ))}
              </colgroup>
              <tbody>
                <tr>
                  <td className="p-0" aria-hidden="true" />
                  {table.columns.map((col) => {
                    const summaryValue = computeColumnSummaryValue(col, table.rows)
                    const columnColorStyles = getColumnColorStyles(col.color)
                    const isSummaryVisible = col.aggregation !== 'none'
                    return (
                      <td
                        key={`${col.id}-summary`}
                        className={cn(
                          'border-t border-white/6 px-3 pt-2 text-[10px] font-medium tracking-[0.01em] text-holo-text-faint/72',
                          alignClass(col.align),
                          (col.type === 'number' || col.type === 'currency') && 'tabular-nums',
                          !isSummaryVisible && 'pointer-events-none select-none opacity-0',
                        )}
                        style={columnColorStyles.summary}
                        data-summary-aggregation={col.aggregation}
                        aria-hidden={isSummaryVisible ? undefined : true}
                      >
                        {isSummaryVisible ? summaryValue : ''}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex items-center gap-1 pl-3">
          <button
            onClick={() => addRowAt(table.rows.length)}
            className="inline-flex items-center gap-2 rounded-holo-md px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
          >
            <Plus size={14} />
            Ajouter une ligne
          </button>
          {/* Les colonnes s'insèrent aussi avant/après depuis le menu de chaque colonne. */}
          <button
            onClick={() => addColumnAt(table.columns.length)}
            className="inline-flex items-center gap-2 rounded-holo-md px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
          >
            <Plus size={14} />
            Ajouter une colonne
          </button>
        </div>
      </div>
    )
  },
)
