/**
 * MathBlock.tsx — Bloc LaTeX / formule mathématique
 *
 * - Vue : rendu KaTeX (display mode)
 * - Édition : cliquer → textarea avec la formule brute
 */

import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { InlineEditorHandle } from '../InlineEditor'

export interface MathNode {
  type: 'math'
  value: string
  meta?: string | null
}

interface MathBlockProps {
  node: MathNode
  onChange: (node: MathNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

export const MathBlock = forwardRef<InlineEditorHandle, MathBlockProps>(
  function MathBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(node.value)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useImperativeHandle(ref, () => ({
      focus: () => {
        setEditing(true)
        requestAnimationFrame(() => {
          textareaRef.current?.focus()
          textareaRef.current?.select()
        })
      },
      clear: () => { setDraft('') },
      clearSlash: () => [],
      flush: () => { commit() },
      getContent: () => [],
    }))

    // Sync si le nœud change depuis l'extérieur
    useEffect(() => { setDraft(node.value) }, [node.value])

    const commit = () => {
      setEditing(false)
      if (draft !== node.value) onChange({ ...node, value: draft })
    }

    const renderedHtml = (() => {
      try {
        return katex.renderToString(node.value || '\\text{formule vide}', {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        })
      } catch {
        return `<span class="text-red-400 text-sm">Erreur LaTeX</span>`
      }
    })()

    if (editing) {
      return (
        <div className="my-3 overflow-hidden rounded-holo-xl border border-holo-accent/40 bg-holo-glass/30">
          <div className="flex items-center justify-between border-b border-holo-border-soft/60 px-4 py-2">
            <span className="font-mono text-[11px] text-holo-text-faint">LaTeX</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); commit() }}
              className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-accent hover:bg-holo-accent/10"
            >
              Valider
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); commit() }
              if (e.key === 'Enter' && e.metaKey) { e.preventDefault(); commit(); onEnterAtEnd?.() }
              if (e.key === 'Backspace' && draft === '') { e.preventDefault(); onBackspaceAtStart?.() }
            }}
            placeholder="\int_0^1 x\,dx"
            className="w-full resize-none bg-transparent p-4 font-mono text-sm text-holo-text focus:outline-none holo-scrollbar"
            rows={Math.max(2, draft.split('\n').length + 1)}
            spellCheck={false}
          />
        </div>
      )
    }

    return (
      <div
        className="group my-3 cursor-pointer overflow-x-auto rounded-holo-xl border border-holo-border-soft bg-holo-glass/20 px-4 py-3 holo-scrollbar hover:border-holo-accent/40 hover:bg-holo-glass/30"
        onClick={() => setEditing(true)}
        title="Cliquer pour modifier la formule"
      >
        {node.value ? (
          <div
            className="flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <div className="text-center text-sm italic text-holo-text-faint">Formule vide — cliquer pour modifier</div>
        )}
      </div>
    )
  }
)
