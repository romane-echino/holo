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
import type { InlineNode } from '../../parts/MarkdownEditor/lib/types'

export type CaretField = { cell: { rowId: string; columnId: string } } | { item: string } | null

/** Curseur dans le texte partagé : bloc, champ éventuel (cellule, élément) et position dans son markdown. */
export type CaretAnchor = { blockId: string; field: CaretField; index: number }

export function plainText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'inlineMath') return node.value
    if (node.type === 'break') return '\n'
    if ('children' in node && Array.isArray(node.children)) return plainText(node.children as InlineNode[])
    return ''
  }).join('')
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const sameChar = (left: string, right: string) => left === right || (/\s/.test(left) && /\s/.test(right))

/** Caractères du markdown tels qu'ils s'affichent : échappements (« \* ») et entités (« &#x20; ») décodés. */
function markdownUnits(markdown: string): { value: string; start: number; end: number }[] {
  const units: { value: string; start: number; end: number }[] = []
  let index = 0
  while (index < markdown.length) {
    const char = markdown[index]
    if (char === '\\' && index + 1 < markdown.length && /[!-/:-@[-`{-~]/.test(markdown[index + 1])) {
      units.push({ value: markdown[index + 1], start: index, end: index + 2 })
      index += 2
      continue
    }
    if (char === '&') {
      const entity = /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(markdown.slice(index, index + 12))
      if (entity) {
        const body = entity[1]
        const value = body.startsWith('#x') ? String.fromCodePoint(parseInt(body.slice(2), 16))
          : body.startsWith('#') ? String.fromCodePoint(parseInt(body.slice(1), 10))
            : NAMED_ENTITIES[body.toLowerCase()]
        if (value !== undefined) {
          units.push({ value, start: index, end: index + entity[0].length })
          index += entity[0].length
          continue
        }
      }
    }
    units.push({ value: char, start: index, end: index + 1 })
    index += 1
  }
  return units
}

/**
 * Pour chaque position du texte affiché (0 … longueur), la position
 * correspondante dans son markdown : les caractères visibles sont retrouvés
 * dans l'ordre, la syntaxe (« ## », « ** », « [lien](…) », échappements,
 * entités) est sautée.
 */
function visibleToMarkdown(visible: string, markdown: string): number[] {
  const units = markdownUnits(markdown)
  const positions = new Array<number>(visible.length + 1).fill(0)
  let next = 0
  let lastEnd = 0
  for (let index = 0; index < visible.length; index += 1) {
    let match = next
    while (match < units.length && !sameChar(units[match].value, visible[index])) match += 1
    if (match < units.length) {
      if (index === 0) positions[0] = units[match].start
      lastEnd = units[match].end
      next = match + 1
    }
    positions[index + 1] = lastEnd
  }
  if (visible.length === 0) positions[0] = markdown.length
  return positions
}

/** Position dans le markdown d'un curseur placé après `offset` caractères visibles. */
export function markdownIndexOf(visible: string, markdown: string, offset: number): number {
  const positions = visibleToMarkdown(visible, markdown)
  return positions[Math.max(0, Math.min(visible.length, offset))]
}

/** Nombre de caractères visibles avant la position `index` du markdown. */
export function visibleOffsetOf(visible: string, markdown: string, index: number): number {
  const positions = visibleToMarkdown(visible, markdown)
  let offset = 0
  for (let candidate = 0; candidate < positions.length; candidate += 1) if (positions[candidate] <= index) offset = candidate
  return offset
}

/**
 * Curseur actuel dans le texte partagé, ou null (pas de curseur, sélection,
 * éditeur de code…). `blockMarkdown` donne le markdown partagé d'un bloc texte
 * (« ## Titre », « > citation »…), tel que chaque poste l'écrit.
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
  const offset = prefixRange.toString().length
  const visible = editable.textContent ?? ''
  const cell = editable.closest<HTMLElement>('td[data-row-id][data-column-id]')
  const item = editable.closest<HTMLElement>('[data-list-item-id]')
  if (cell || item) {
    // Cellules et éléments : leur markdown partagé est celui du contenu éditable.
    const holder = document.createElement('div')
    holder.appendChild(editable.cloneNode(true))
    const markdown = inlinesToMarkdown(domToInlines(holder.firstChild as HTMLElement))
    const index = markdownIndexOf(visible, markdown, offset)
    return cell
      ? { blockId, field: { cell: { rowId: cell.dataset.rowId!, columnId: cell.dataset.columnId! } }, index }
      : { blockId, field: { item: item!.dataset.listItemId! }, index }
  }
  const markdown = blockMarkdown(blockId)
  if (markdown === null) return null
  return { blockId, field: null, index: markdownIndexOf(visible, markdown, offset) }
}

/** Position à l'écran pour la position `index` d'un markdown dont le contenu affiché est `nodes`. */
export function visibleOffset(markdown: string, nodes: InlineNode[], index: number): number {
  return visibleOffsetOf(plainText(nodes), markdown, index)
}

export function sameField(left: CaretField, right: CaretField): boolean {
  if (left === null || right === null) return left === right
  if ('cell' in left && 'cell' in right) return left.cell.rowId === right.cell.rowId && left.cell.columnId === right.cell.columnId
  if ('item' in left && 'item' in right) return left.item === right.item
  return false
}
