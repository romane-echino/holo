/**
 * Curseur local ↔ position dans le texte partagé d'un bloc, d'une cellule ou
 * d'un élément de liste (le markdown que contient le Y.Text correspondant).
 *
 * Avant d'appliquer une modification reçue, la session attache le curseur au
 * caractère qui le précède (position relative Yjs) ; après, Yjs donne la
 * nouvelle place de ce caractère et le curseur y est remis. Si un collègue
 * tape exactement au même endroit, chacun garde ainsi sa propre saisie d'un
 * seul tenant (sans cela, l'un se retrouverait à taper au milieu de l'autre).
 */
import { domToInlines } from '../../parts/MarkdownEditor/lib/domToInlines'
import { inlinesToMarkdown } from '../../parts/MarkdownEditor/lib/inlinesToMarkdown'
import { parseInline } from '../../parts/MarkdownEditor/lib/sharedSnapshot'
import type { InlineNode } from '../../parts/MarkdownEditor/lib/types'

export type CaretField = { cell: { rowId: string; columnId: string } } | { item: string } | null

/** Curseur dans le texte partagé : bloc, champ éventuel (cellule, élément) et position dans son markdown. */
export type CaretAnchor = { blockId: string; field: CaretField; index: number }

function plainText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'inlineMath') return node.value
    if (node.type === 'break') return '\n'
    if ('children' in node && Array.isArray(node.children)) return plainText(node.children as InlineNode[])
    return ''
  }).join('')
}

function markdownOf(container: HTMLElement, range?: Range): string {
  const holder = document.createElement('div')
  holder.appendChild(range ? range.cloneContents() : container.cloneNode(true))
  const content = range ? holder : (holder.firstChild as HTMLElement)
  return inlinesToMarkdown(domToInlines(content))
}

/**
 * Curseur actuel dans le texte partagé, ou null (pas de curseur, sélection,
 * éditeur de code…). `blockMarkdown` donne le markdown complet d'un bloc texte
 * (pour situer le contenu éditable dans « ## Titre », « > citation »…).
 */
export function readCaretAnchor(blockMarkdown: (blockId: string) => string | null): CaretAnchor | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const start = range.startContainer
  const editable = (start.nodeType === Node.ELEMENT_NODE ? (start as Element) : start.parentElement)?.closest<HTMLElement>('[contenteditable="true"]')
  if (!editable || editable.closest('.cm-editor')) return null
  const blockId = editable.closest<HTMLElement>('[data-block-id]')?.dataset.blockId
  if (!blockId) return null
  const prefixRange = document.createRange()
  prefixRange.selectNodeContents(editable)
  prefixRange.setEnd(range.startContainer, range.startOffset)
  const prefix = markdownOf(editable, prefixRange)
  const cell = editable.closest<HTMLElement>('td[data-row-id][data-column-id]')
  if (cell) return { blockId, field: { cell: { rowId: cell.dataset.rowId!, columnId: cell.dataset.columnId! } }, index: prefix.length }
  const item = editable.closest<HTMLElement>('[data-list-item-id]')
  if (item) return { blockId, field: { item: item.dataset.listItemId! }, index: prefix.length }
  const full = blockMarkdown(blockId)
  if (full === null) return null
  const offset = full.indexOf(markdownOf(editable))
  return offset === -1 ? null : { blockId, field: null, index: offset + prefix.length }
}

/**
 * Position à l'écran (nombre de caractères visibles avant le curseur) pour une
 * position `index` dans le markdown d'un bloc, d'une cellule ou d'un élément.
 * `inlineMarkdown` est le markdown du contenu éditable, `prefixLength` la
 * longueur de ce qui le précède dans le texte partagé (« ## », « > »…).
 */
export function visibleOffset(inlineMarkdown: string, index: number, prefixLength = 0): number {
  const within = Math.max(0, Math.min(inlineMarkdown.length, index - prefixLength))
  return plainText(parseInline(inlineMarkdown.slice(0, within))).length
}

export function sameField(left: CaretField, right: CaretField): boolean {
  if (left === null || right === null) return left === right
  if ('cell' in left && 'cell' in right) return left.cell.rowId === right.cell.rowId && left.cell.columnId === right.cell.columnId
  if ('item' in left && 'item' in right) return left.item === right.item
  return false
}
