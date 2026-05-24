/**
 * HeadingBlock.tsx — Bloc titre (h1–h4)
 *
 * Toujours rendu comme un InlineEditor (contentEditable).
 * Le mode export reste un élément <hN> statique.
 */

import { forwardRef } from 'react'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { HeadingNode, InlineNode } from '../lib/types'

interface HeadingBlockProps {
  node: HeadingNode
  mode?: 'view' | 'export'
  onChange: (node: HeadingNode) => void
  onEnterAtStart?: () => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  onConvert?: (type: string, children: InlineNode[]) => void
  onSlashCommand?: (rect: DOMRect) => void
  onSplit?: (after: InlineNode[]) => void
}

export const HeadingBlock = forwardRef<InlineEditorHandle, HeadingBlockProps>(
  function HeadingBlock({ node, mode = 'view', onChange, onEnterAtStart, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onConvert, onSlashCommand, onSplit }, ref) {
    const handleSave = (children: InlineNode[]) => onChange({ ...node, children })

    if (mode === 'export') {
      const Tag = `h${node.depth}` as 'h1' | 'h2' | 'h3' | 'h4'
      return <Tag><InlineView nodes={node.children} /></Tag>
    }

    return (
      <InlineEditor
        ref={ref}
        initialContent={node.children}
        onSave={handleSave}
        onEnterAtStart={onEnterAtStart}
        onEnterAtEnd={onEnterAtEnd}
        onBackspaceAtStart={onBackspaceAtStart}
        onArrowUp={onArrowUp}
        onArrowDown={onArrowDown}
        onConvert={onConvert}
        onSlashCommand={onSlashCommand}
        onSplit={onSplit}
        blockType={`heading-${node.depth}`}
        placeholder="Titre…"
      />
    )
  },
)

// ─── Rendu inline (export) ──────────────────────────────────────────────────

function InlineView({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((n, i) => <InlineNodeView key={i} node={n} />)}</>
}

function InlineNodeView({ node }: { node: InlineNode }) {
  switch (node.type) {
    case 'text':       return <>{node.value}</>
    case 'strong':     return <strong><InlineView nodes={node.children} /></strong>
    case 'emphasis':   return <em><InlineView nodes={node.children} /></em>
    case 'inlineCode': return <code>{node.value}</code>
    case 'link':       return <a href={node.url}><InlineView nodes={node.children} /></a>
    case 'delete':     return <del><InlineView nodes={node.children} /></del>
    case 'break':      return <br />
    default:           return null
  }
}
