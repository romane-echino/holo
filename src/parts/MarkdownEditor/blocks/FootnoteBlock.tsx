/**
 * FootnoteBlock.tsx — Bloc de définition de note de bas de page
 *
 * Rendu visuel d'un footnoteDefinition.
 * Structure markdown : [^id]: contenu
 */

import { forwardRef, useImperativeHandle } from 'react'
import type { InlineEditorHandle } from '../InlineEditor'

export interface FootnoteDefinitionNode {
  type: 'footnoteDefinition'
  identifier: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
}

interface FootnoteBlockProps {
  node: FootnoteDefinitionNode
}

function extractText(node: FootnoteDefinitionNode): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getText(n: any): string {
    if (n.value) return n.value
    if (n.children) return n.children.map(getText).join('')
    return ''
  }
  return node.children.map(getText).join(' ').trim()
}

export const FootnoteBlock = forwardRef<InlineEditorHandle, FootnoteBlockProps>(
  function FootnoteBlock({ node }, ref) {
    useImperativeHandle(ref, () => ({
      focus: () => {},
      clear: () => {},
      clearSlash: () => [],
    }))

    const text = extractText(node)

    return (
      <div className="my-2 flex items-start gap-2 rounded-holo-md border border-holo-border-soft/60 bg-holo-glass/20 px-3 py-2 text-sm text-holo-text-muted">
        <span className="shrink-0 rounded bg-holo-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-medium text-holo-accent">
          [{node.identifier}]
        </span>
        <span className="leading-relaxed">{text || <em className="text-holo-text-faint">Note vide</em>}</span>
      </div>
    )
  }
)
