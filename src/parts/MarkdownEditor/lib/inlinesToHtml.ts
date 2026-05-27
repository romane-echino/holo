/**
 * inlinesToHtml.ts — InlineNode[] → HTML string
 *
 * Sérialise les nœuds inline en HTML pour initialiser un contentEditable.
 * L'HTML produit est le miroir exact de ce que domToInlines() sait parser :
 * roundtrip garanti sans perte.
 */

import type { InlineNode } from './types'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inlineToHtml(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value)

    case 'strong':
      return `<strong>${node.children.map(inlineToHtml).join('')}</strong>`

    case 'emphasis':
      return `<em>${node.children.map(inlineToHtml).join('')}</em>`

    case 'inlineCode':
      return `<code>${escapeHtml(node.value)}</code>`

    case 'link': {
      const href = escapeHtml(node.url)
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      return `<a href="${href}"${title}>${node.children.map(inlineToHtml).join('')}</a>`
    }

    case 'delete':
      return `<del>${node.children.map(inlineToHtml).join('')}</del>`

    case 'underline':
      return `<u>${node.children.map(inlineToHtml).join('')}</u>`

    case 'break':
      return '<br>'

    case 'image': {
      const src = escapeHtml(node.url)
      const alt = escapeHtml(node.alt ?? '')
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      return `<img src="${src}" alt="${alt}"${title} data-md-image>`
    }

    default:
      return ''
  }
}

export function inlinesToHtml(nodes: InlineNode[]): string {
  return nodes.map(inlineToHtml).join('')
}
