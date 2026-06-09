import type { InlineNode } from './types'

function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_\[\]<>])/g, '\\$1')
}

function escapeMarkdownCode(value: string): string {
  return value.replace(/`/g, '\\`')
}

function escapeMarkdownLink(value: string): string {
  return value.replace(/[()]/g, '\\$&')
}

function inlineToMarkdown(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return escapeMarkdownText(node.value)
    case 'strong':
      return `**${node.children.map(inlineToMarkdown).join('')}**`
    case 'emphasis':
      return `*${node.children.map(inlineToMarkdown).join('')}*`
    case 'inlineCode':
      return `\`${escapeMarkdownCode(node.value)}\``
    case 'link': {
      const label = node.children.map(inlineToMarkdown).join('') || escapeMarkdownText(node.url)
      return `[${label}](${escapeMarkdownLink(node.url)})`
    }
    case 'delete':
      return `~~${node.children.map(inlineToMarkdown).join('')}~~`
    case 'underline':
      return `<u>${node.children.map(inlineToMarkdown).join('')}</u>`
    case 'superscript':
      return `<sup>${node.children.map(inlineToMarkdown).join('')}</sup>`
    case 'subscript':
      return `<sub>${node.children.map(inlineToMarkdown).join('')}</sub>`
    case 'footnoteReference':
      // anchorText is regular text in markdown, followed by the footnote reference
      return node.anchorText ? `${node.anchorText}[^${node.identifier}]` : `[^${node.identifier}]`
    case 'break':
      return '  \n'
    case 'image':
      return `![${escapeMarkdownText(node.alt ?? '')}](${escapeMarkdownLink(node.url)})`
    default:
      return ''
  }
}

export function inlinesToMarkdown(nodes: InlineNode[]): string {
  return nodes.map(inlineToMarkdown).join('')
}