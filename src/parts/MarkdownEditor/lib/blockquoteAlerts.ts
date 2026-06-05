import type { InlineNode } from './types'

export type BlockquoteAlertType = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export const BLOCKQUOTE_ALERT_LABELS: Record<BlockquoteAlertType, string> = {
  note: 'Note',
  tip: 'Astuce',
  important: 'Important',
  warning: 'Attention',
  caution: 'Prudence',
}

type ParsedBlockquoteAlert = {
  type: BlockquoteAlertType
  content: InlineNode[]
}

function splitInlineNodesAtFirstLineBreak(nodes: InlineNode[]): { firstLine: string; rest: InlineNode[] } {
  const rest: InlineNode[] = []
  let firstLine = ''
  let splitDone = false

  nodes.forEach((node) => {
    if (splitDone) {
      rest.push(node)
      return
    }

    if (node.type === 'break') {
      splitDone = true
      return
    }

    if (node.type === 'text' || node.type === 'inlineCode') {
      const breakIndex = node.value.indexOf('\n')
      if (breakIndex === -1) {
        firstLine += node.value
        return
      }

      firstLine += node.value.slice(0, breakIndex)
      const remainder = node.value.slice(breakIndex + 1)
      if (remainder) {
        rest.push({ ...node, value: remainder })
      }
      splitDone = true
      return
    }

    splitDone = true
    rest.push(node)
  })

  return { firstLine: firstLine.trim(), rest }
}

export function parseBlockquoteAlert(nodes: InlineNode[]): ParsedBlockquoteAlert | null {
  const { firstLine, rest } = splitInlineNodesAtFirstLineBreak(nodes)
  const match = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i)
  if (!match) return null

  return {
    type: match[1].toLowerCase() as BlockquoteAlertType,
    content: rest,
  }
}

export function buildBlockquoteAlertNodes(type: BlockquoteAlertType, content: InlineNode[]): InlineNode[] {
  const marker = `[!${type.toUpperCase()}]`
  if (content.length === 0) {
    return [{ type: 'text', value: marker }]
  }
  return [{ type: 'text', value: `${marker}\n` }, ...content]
}