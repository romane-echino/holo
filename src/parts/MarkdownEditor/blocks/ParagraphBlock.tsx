/**
 * ParagraphBlock.tsx — Bloc paragraphe
 *
 * Toujours rendu comme un InlineEditor (contentEditable).
 * Le mode export reste un <p> statique sans interactivité.
 */

import { forwardRef } from 'react'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { ParagraphNode, InlineNode } from '../lib/types'

interface ParagraphBlockProps {
  node: ParagraphNode
  mode?: 'view' | 'export'
  onChange: (node: ParagraphNode) => void
  onEnterAtStart?: () => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  onConvert?: (type: string, children: InlineNode[]) => void
  onSlashCommand?: () => void
  onSplit?: (after: InlineNode[]) => void
  alwaysShowPlaceholder?: boolean
}

export const ParagraphBlock = forwardRef<InlineEditorHandle, ParagraphBlockProps>(
  function ParagraphBlock({ node, mode = 'view', onChange, onEnterAtStart, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onConvert, onSlashCommand, onSplit, alwaysShowPlaceholder }, ref) {
    const handleSave = (children: InlineNode[]) => onChange({ ...node, children })

    if (mode === 'export') {
      return (
        <p>
          <InlineView nodes={node.children} />
        </p>
      )
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
        blockType="paragraph"
        placeholder={alwaysShowPlaceholder ? 'Commencez à taper  —  / ou Ctrl+Espace pour les commandes' : 'Commencez à taper…'}
        alwaysShowPlaceholder={alwaysShowPlaceholder}
      />
    )
  },
)

// ─── Rendu inline (view / export) ──────────────────────────────────────────

function InlineView({ nodes }: { nodes: InlineNode[] }) {
  return <>{nodes.map((n, i) => <InlineNodeView key={i} node={n} />)}</>
}

function InlineNodeView({ node }: { node: InlineNode }) {
  switch (node.type) {
    case 'text':       return <>{node.value}</>
    case 'strong':     return <strong><InlineView nodes={node.children} /></strong>
    case 'emphasis':   return <em><InlineView nodes={node.children} /></em>
    case 'inlineCode': return <code>{node.value}</code>
    case 'link':       return <a href={node.url} onClick={(e) => e.stopPropagation()}><InlineView nodes={node.children} /></a>
    case 'delete':     return <del><InlineView nodes={node.children} /></del>
    case 'break':      return <br />
    default:           return null
  }
}
