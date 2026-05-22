/**
 * markdownBlocks.ts — Block-level Markdown splitter via remark AST
 *
 * Splits a Markdown string into top-level blocks using remark-parse → mdast[].
 * Chaque nœud racine de l'AST devient un MarkdownBlock indépendant.
 * La sérialisation retour (bloc → markdown brut) est assurée par remark-stringify.
 *
 * Avantages vs splitter string :
 * - Listes loose correctement groupées
 * - Headings setext supportés
 * - Tables GFM, footnotes, etc.
 * - Roundtrip fiable (parse → stringify → parse identique)
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'code'
  | 'blockquote'
  | 'list'
  | 'hr'
  | 'table'
  | 'html'

export type MarkdownBlock = {
  type: BlockType
  raw: string
}

export type RenderMode = 'view' | 'edit' | 'export'

// Singletons — évite de reconstruire le pipeline à chaque appel
const parser = unified().use(remarkParse).use(remarkGfm)
const serializer = unified()
  .use(remarkStringify, { bullet: '-', fence: '`', strong: '*', emphasis: '_' })
  .use(remarkGfm)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mdastTypeToBlockType(node: any): BlockType {
  switch (node.type) {
    case 'heading':       return 'heading'
    case 'code':          return 'code'
    case 'blockquote':    return 'blockquote'
    case 'list':          return 'list'
    case 'thematicBreak': return 'hr'
    case 'table':         return 'table'
    case 'html':          return 'html'
    default:              return 'paragraph'
  }
}

export function splitIntoBlocks(markdown: string): MarkdownBlock[] {
  if (!markdown.trim()) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = parser.parse(markdown) as any

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tree.children.map((node: any) => ({
    type: mdastTypeToBlockType(node),
    // Serialize just this node back to markdown (trimEnd removes trailing newline)
    raw: serializer.stringify({ type: 'root', children: [node] } as never).trimEnd(),
  }))
}

export function blocksToMarkdown(blocks: MarkdownBlock[]): string {
  return blocks.map((b) => b.raw).join('\n\n')
}
