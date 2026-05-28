/**
 * FootnoteBlock.tsx — Bloc de note de bas de page éditable
 * Structure markdown : [^id]: contenu
 */

import { forwardRef } from 'react'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { InlineNode } from '../lib/types'

export interface FootnoteDefinitionNode {
  type: 'footnoteDefinition'
  identifier: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
}

export interface FootnoteBlockProps {
  node: FootnoteDefinitionNode
  onChange?: (node: FootnoteDefinitionNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (x: number) => void
  onArrowDown?: (x: number) => void
  onSplit?: (after: InlineNode[]) => void
  onSmartPaste?: (before: InlineNode[], after: InlineNode[], md: string) => void
}

export const FootnoteBlock = forwardRef<InlineEditorHandle, FootnoteBlockProps>(
  function FootnoteBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onSplit, onSmartPaste }, ref) {
    const firstPara = node.children[0] as { type: string; children?: InlineNode[] } | undefined
    const inlines: InlineNode[] = firstPara?.type === 'paragraph' && Array.isArray(firstPara.children) ? firstPara.children : []

    const handleSave = (newChildren: InlineNode[]) => {
      if (!onChange) return
      onChange({ ...node, children: [{ type: 'paragraph', children: newChildren }] })
    }

    return (
      <div className="my-2 flex items-start gap-2 rounded-holo-md border border-holo-border-soft/60 bg-holo-glass/20 px-3 py-2 text-sm text-holo-text-muted">
        <span className="mt-[3px] shrink-0 rounded bg-holo-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-holo-accent">
          [{node.identifier}]
        </span>
        <div className="flex-1">
          <InlineEditor
            ref={ref}
            initialContent={inlines}
            onSave={handleSave}
            onEnterAtEnd={onEnterAtEnd}
            onBackspaceAtStart={onBackspaceAtStart}
            onArrowUp={onArrowUp}
            onArrowDown={onArrowDown}
            onSplit={onSplit}
            onSmartPaste={onSmartPaste}
            blockType="footnoteDefinition"
            placeholder="Contenu de la note…"
          />
        </div>
      </div>
    )
  },
)
