/**
 * BlockquoteBlock.tsx — Bloc citation éditable (blockquote)
 */

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { BlockquoteNode, ParagraphNode, InlineNode } from '../lib/types'
import { cn } from '../../../utils/global'

export interface BlockquoteBlockProps {
  node: BlockquoteNode
  className?: string
  onChange?: (node: BlockquoteNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (x: number) => void
  onArrowDown?: (x: number) => void
  onSplit?: (after: InlineNode[]) => void
  onSmartPaste?: (before: InlineNode[], after: InlineNode[], md: string) => void
}

export const BlockquoteBlock = forwardRef<InlineEditorHandle, BlockquoteBlockProps>(
  function BlockquoteBlock({ node, className, onChange, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onSplit, onSmartPaste }, ref) {
    const firstPara = node.children[0] as ParagraphNode | undefined
    const inlines: InlineNode[] = firstPara?.type === 'paragraph' ? firstPara.children : []
    const editorRef = useRef<InlineEditorHandle | null>(null)

    useImperativeHandle(ref, () => ({
      focus: (cursor) => editorRef.current?.focus(cursor),
      clear: () => editorRef.current?.clear(),
      clearSlash: () => editorRef.current?.clearSlash() ?? [],
    }), [])

    const handleSave = (newChildren: InlineNode[]) => {
      if (!onChange) return
      const updatedPara: ParagraphNode = { type: 'paragraph', children: newChildren }
      onChange({ ...node, children: [updatedPara, ...node.children.slice(1)] })
    }

    return (
      <blockquote
        className={cn('my-3 border-l-[3px] border-holo-primary/50 pl-4 py-1 italic text-holo-text-muted', className)}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement | null
          if (!target) return
          if (target.closest('[contenteditable="true"], button, a, input, [data-format-toolbar]')) return
          event.preventDefault()
          editorRef.current?.focus()
        }}
      >
        <InlineEditor
          ref={editorRef}
          initialContent={inlines}
          onSave={handleSave}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
          blockType="blockquote"
          placeholder="Citation…"
        />
      </blockquote>
    )
  },
)
