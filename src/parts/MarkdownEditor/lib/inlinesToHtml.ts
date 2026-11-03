/**
 * inlinesToHtml.ts — InlineNode[] → HTML string
 *
 * Sérialise les nœuds inline en HTML pour initialiser un contentEditable.
 * L'HTML produit est le miroir exact de ce que domToInlines() sait parser :
 * roundtrip garanti sans perte.
 */

import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { InlineNode } from './types'
import { getInlineColorPreview } from '../../../lib/inlineColor'

const HTML_LINE_BREAK = /^<br\s*\/?>$/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

function renderInlineMath(value: string): string {
  try {
    return katex.renderToString(value, { throwOnError: false, displayMode: false })
  } catch {
    return escapeHtml(`$${value}$`)
  }
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
      return (() => {
        const previewColor = getInlineColorPreview(node.value)
        if (!previewColor) return `<code>${escapeHtml(node.value)}</code>`
        return `<code class="inline-color-code" data-inline-color="${escapeHtml(previewColor)}" style="--inline-color-preview:${escapeHtml(previewColor)}">${escapeHtml(node.value)}</code>`
      })()

    case 'link': {
      const href = escapeHtml(node.url)
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      return `<a href="${href}"${title}>${node.children.map(inlineToHtml).join('')}</a>`
    }

    case 'delete':
      return `<del>${node.children.map(inlineToHtml).join('')}</del>`

    case 'underline':
      return `<u>${node.children.map(inlineToHtml).join('')}</u>`

    case 'superscript':
      return `<sup>${node.children.map(inlineToHtml).join('')}</sup>`

    case 'subscript':
      return `<sub>${node.children.map(inlineToHtml).join('')}</sub>`

    case 'footnoteReference': {
      const identifier = escapeHtml(node.identifier)
      const label = escapeHtml(node.label ?? node.identifier)
      if (node.anchorText) {
        const anchor = escapeHtml(node.anchorText)
        return `<span data-footnote-anchor="${identifier}" data-footnote-label="${label}" contenteditable="false" class="holo-footnote-anchor">${anchor}<sup class="holo-footnote-badge">[${identifier}]</sup></span>`
      }
      return `<sup data-footnote-ref="${identifier}" data-footnote-label="${label}" contenteditable="false">[${identifier}]</sup>`
    }

    case 'break':
      return '<br>'

    case 'image': {
      const src = escapeHtml(node.url)
      const alt = escapeHtml(node.alt ?? '')
      const title = node.title ? ` title="${escapeHtml(node.title)}"` : ''
      return `<img src="${src}" alt="${alt}"${title} data-md-image>`
    }

    case 'html':
      // Saut de ligne HTML (cellules de tableau GFM) : rendu comme un vrai retour.
      if (HTML_LINE_BREAK.test(node.value.trim())) {
        return `<br data-md-html="${escapeAttribute(node.value)}">`
      }
      // Autre HTML : affiché comme une étiquette non éditable, conservé à l'identique.
      return `<span class="holo-inline-raw" contenteditable="false" data-md-html="${escapeAttribute(node.value)}">${escapeHtml(node.value)}</span>`

    case 'inlineMath':
      return `<span class="holo-inline-math" contenteditable="false" data-md-math="${escapeAttribute(node.value)}" title="${escapeAttribute(`$${node.value}$`)}">${renderInlineMath(node.value)}</span>`

    default:
      return ''
  }
}

export function inlinesToHtml(nodes: InlineNode[]): string {
  return nodes.map(inlineToHtml).join('')
}
