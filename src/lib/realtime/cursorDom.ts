/**
 * Correspondance entre la sélection du navigateur et une position de curseur
 * partageable (bloc, champ éditable du bloc, position dans le texte).
 */
import type { RealtimeCursor, RealtimePeer } from './types'

const EDITOR_ROOT_SELECTOR = '[data-testid="block-editor"]'
const EDITABLE_SELECTOR = '[contenteditable="true"]'

function topLevelBlocks(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))
    .filter((block) => !block.parentElement?.closest('[data-block-id]'))
}

/** Curseur local, ou null si la sélection n'est pas dans le corps du document. */
export function readLocalCursor(): RealtimeCursor | null {
  const root = document.querySelector(EDITOR_ROOT_SELECTOR)
  const selection = window.getSelection()
  if (!root || !selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const node = range.endContainer
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
  const block = element?.closest<HTMLElement>('[data-block-id]')
  if (!element || !block || !root.contains(block)) return null
  const topBlock = topLevelBlocks(root).find((candidate) => candidate === block || candidate.contains(block))
  if (!topBlock) return null
  const editable = element.closest<HTMLElement>(EDITABLE_SELECTOR)
  if (!editable || !topBlock.contains(editable)) return null
  const field = Array.from(topBlock.querySelectorAll(EDITABLE_SELECTOR)).indexOf(editable)
  const prefix = document.createRange()
  prefix.selectNodeContents(editable)
  prefix.setEnd(range.endContainer, range.endOffset)
  return { block: topLevelBlocks(root).indexOf(topBlock), field: Math.max(0, field), offset: prefix.toString().length }
}

/** Champ éditable où se trouve le curseur d'un autre participant. */
export function locateCursorField(cursor: RealtimeCursor): HTMLElement | null {
  const root = document.querySelector(EDITOR_ROOT_SELECTOR)
  if (!root) return null
  const block = topLevelBlocks(root)[cursor.block]
  return block?.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR)[cursor.field] ?? null
}

/** Zone à encadrer autour de ce champ : la cellule de tableau, la ligne de l'élément de liste, ou le bloc de texte. */
export function cursorFieldFrame(field: HTMLElement): HTMLElement {
  const cell = field.closest<HTMLElement>('td, th')
  if (cell) return cell
  if (field.hasAttribute('data-list-text')) return field.parentElement ?? field
  return field
}

/** Événement : mettre en évidence le cadre d'un participant (detail : { clientId }). */
export const REVEAL_PEER_EVENT = 'holo:reveal-peer'

/**
 * Amène à l'écran le bloc où se trouve un participant (clic sur son avatar)
 * et le met en évidence un instant. Faux s'il n'est pas dans le texte.
 */
export function revealPeer(peer: RealtimePeer): boolean {
  const field = peer.cursor ? locateCursorField(peer.cursor) : null
  if (!field) return false
  cursorFieldFrame(field).scrollIntoView({ block: 'center', behavior: 'smooth' })
  window.dispatchEvent(new CustomEvent(REVEAL_PEER_EVENT, { detail: { clientId: peer.clientId } }))
  return true
}

/** Rectangle (coordonnées écran) où dessiner le curseur d'un autre participant. */
export function locateCursorRect(cursor: RealtimeCursor): DOMRect | null {
  const editable = locateCursorField(cursor)
  if (!editable) return null
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let remaining = cursor.offset
  let last: Text | null = null
  const rectAt = (node: Text, offset: number) => {
    const range = document.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
    return rect && (rect.height > 0 || rect.width > 0) ? rect : null
  }
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) return rectAt(node, remaining) ?? fieldStart(editable)
    remaining -= length
    if (length > 0) last = node
  }
  // Position au-delà du texte affiché : le collègue tape en fin de champ et sa
  // position arrive avant sa saisie (ou finit par une espace non affichée).
  // On reste en fin de texte plutôt que de sauter au début du champ.
  if (last) return rectAt(last, last.textContent?.length ?? 0) ?? fieldStart(editable)
  return fieldStart(editable)
}

/** Champ vide : début du champ. */
function fieldStart(editable: HTMLElement): DOMRect {
  const box = editable.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(editable).lineHeight) || 24
  const paddingTop = parseFloat(getComputedStyle(editable).paddingTop) || 0
  const paddingLeft = parseFloat(getComputedStyle(editable).paddingLeft) || 0
  return new DOMRect(box.left + paddingLeft, box.top + paddingTop, 0, lineHeight)
}
