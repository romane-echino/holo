/**
 * Correspondance entre la sélection du navigateur et une position de curseur
 * partageable (bloc, champ éditable du bloc, position dans le texte).
 */
import type { RealtimeCursor } from './session'

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

/** Rectangle (coordonnées écran) où dessiner le curseur d'un autre participant. */
export function locateCursorRect(cursor: RealtimeCursor): DOMRect | null {
  const root = document.querySelector(EDITOR_ROOT_SELECTOR)
  if (!root) return null
  const block = topLevelBlocks(root)[cursor.block]
  const editable = block?.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR)[cursor.field]
  if (!editable) return null
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
  let remaining = cursor.offset
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(node, remaining)
      range.collapse(true)
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect()
      if (rect && (rect.height > 0 || rect.width > 0)) return rect
      break
    }
    remaining -= length
  }
  // Champ vide (ou position au-delà du texte) : début du champ.
  const box = editable.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(editable).lineHeight) || 24
  const paddingTop = parseFloat(getComputedStyle(editable).paddingTop) || 0
  const paddingLeft = parseFloat(getComputedStyle(editable).paddingLeft) || 0
  return new DOMRect(box.left + paddingLeft, box.top + paddingTop, 0, lineHeight)
}
