/**
 * BlockquoteBlock.tsx — Bloc citation (blockquote)
 *
 * Rendu avec bordure gauche colorée et typographie adaptée.
 * Les blocs enfants sont rendus en lecture seule.
 */

import type { BlockquoteNode, ParagraphNode, InlineNode } from '../lib/types'
import { cn } from '../../../utils/global'

// Rendu simple des inlines en texte
function renderInlines(nodes: InlineNode[]): string {
  return nodes.map((n) => {
    if (n.type === 'text') return n.value
    if (n.type === 'strong' || n.type === 'emphasis') return renderInlines(n.children)
    if (n.type === 'inlineCode') return n.value
    return ''
  }).join('')
}

interface BlockquoteBlockProps {
  node: BlockquoteNode
  className?: string
}

export function BlockquoteBlock({ node, className }: BlockquoteBlockProps) {
  return (
    <blockquote
      className={cn(
        'my-3 border-l-[3px] border-holo-primary/50 pl-4 py-1',
        className,
      )}
    >
      {node.children.map((child, i) => {
        if (child.type === 'paragraph') {
          const para = child as ParagraphNode
          return (
            <p key={i} className="text-holo-text-muted italic leading-relaxed">
              {renderInlines(para.children)}
            </p>
          )
        }
        if (child.type === 'blockquote') {
          return <BlockquoteBlock key={i} node={child as BlockquoteNode} className="ml-2 mt-2" />
        }
        return (
          <p key={i} className="text-sm italic text-holo-text-faint">
            [{child.type}]
          </p>
        )
      })}
    </blockquote>
  )
}
