/**
 * domToInlines.ts — DOM → InlineNode[]
 *
 * Convertit le contenu d'un contentEditable en nœuds inline mdast.
 * Seul un sous-ensemble strict d'éléments HTML est reconnu.
 * Tout élément inconnu (div, span, p injectés par le browser) est
 * "flatté" : seuls ses enfants sont traités.
 *
 * Avantage vs turndown : déterministe, pas de regex, pas de surprise.
 */

import type { InlineNode } from './types'

function nodeToInlines(node: Node): InlineNode[] {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? ''
    if (!value) return []
    return [{ type: 'text', value }]
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return []

  const el = node as Element
  const tag = el.tagName.toLowerCase()
  const children = Array.from(el.childNodes).flatMap(nodeToInlines)

  switch (tag) {
    case 'strong':
    case 'b':
      return [{ type: 'strong', children }]

    case 'em':
    case 'i':
      return [{ type: 'emphasis', children }]

    case 'code':
      // inlineCode n'a pas d'enfants, juste une valeur texte
      return [{ type: 'inlineCode', value: el.textContent ?? '' }]

    case 'a':
      return [{ type: 'link', url: el.getAttribute('href') ?? '', title: null, children }]

    case 'del':
    case 's':
    case 'strike': // produit par execCommand('strikeThrough') dans certains navigateurs
      return [{ type: 'delete', children }]

    case 'u':
      return [{ type: 'underline', children }]

    case 'br':
      return [{ type: 'break' }]

    case 'img':
      return [{ type: 'image', url: el.getAttribute('src') ?? '', alt: el.getAttribute('alt') ?? '', title: el.getAttribute('title') ?? null }]

    default:
      // Éléments inconnus : flatten (récupère les enfants)
      return children
  }
}

export function domToInlines(el: HTMLElement): InlineNode[] {
  const nodes = Array.from(el.childNodes).flatMap(nodeToInlines)
  // Chrome insère un <br> dans les contentEditable vides — on l'ignore
  if (nodes.length === 1 && nodes[0].type === 'break') return []
  return nodes
}
