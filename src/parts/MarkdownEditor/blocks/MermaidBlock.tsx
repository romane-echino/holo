import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { GitBranch, Play, WandSparkles } from 'lucide-react'
import { MermaidDiagram } from '../../../components/MermaidDiagram'
import { cn } from '../../../utils/global'
import type { CodeNode } from '../lib/types'
import type { InlineEditorHandle } from '../InlineEditor'

interface MermaidBlockProps {
  node: CodeNode
  onChange: (node: CodeNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

const DEFAULT_MERMAID_SOURCE = ['flowchart TD', '  A[Depart] --> B[Arrivee]'].join('\n')

export const MermaidBlock = forwardRef<InlineEditorHandle, MermaidBlockProps>(
  function MermaidBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
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
      clear: () => setDraft(''),
      clearSlash: () => [],
      flush: () => { commit() },
      getContent: () => [],
    }))

    useEffect(() => {
      setDraft(node.value)
    }, [node.value])

    const commit = () => {
      setEditing(false)
      if (draft !== node.value || node.lang !== 'mermaid') {
        onChange({ ...node, value: draft, lang: 'mermaid' })
      }
    }

    if (editing) {
      return (
        <div className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
          <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint">
              <GitBranch size={12} className="text-holo-primary-soft" />
              mermaid
            </div>
            <div className="flex items-center gap-2">
              <button
                onMouseDown={(event) => { event.preventDefault(); commit() }}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-primary-soft hover:bg-holo-primary/10"
              >
                Valider
              </button>
              <button
                onMouseDown={(event) => {
                  event.preventDefault()
                  setDraft(node.value)
                  setEditing(false)
                }}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-text-faint hover:bg-holo-glass"
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="grid gap-px bg-holo-border-soft/50 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <div className="bg-black/10 p-0">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraft(node.value)
                    setEditing(false)
                  }
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    commit()
                    onEnterAtEnd?.()
                  }
                  if (event.key === 'Backspace' && draft === '') {
                    event.preventDefault()
                    onBackspaceAtStart?.()
                  }
                }}
                placeholder={DEFAULT_MERMAID_SOURCE}
                className="min-h-[240px] w-full resize-y border-0 bg-transparent px-4 py-4 font-mono text-sm leading-6 text-holo-text focus:outline-none holo-scrollbar"
                spellCheck={false}
              />
            </div>
            <div className="bg-[linear-gradient(180deg,rgba(123,97,255,0.08),rgba(0,0,0,0))] p-4">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-black/10 px-2.5 py-1 text-[11px] text-holo-text-faint">
                <Play size={11} className="text-emerald-300" />
                Apercu live
              </div>
              <MermaidDiagram code={draft} />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
        <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint transition hover:text-holo-text"
            title="Cliquer pour modifier le diagramme Mermaid"
          >
            <GitBranch size={12} className="text-holo-primary-soft" />
            mermaid
          </button>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-holo-text-faint opacity-0 transition group-hover:opacity-100">
            <WandSparkles size={11} className="text-holo-primary-soft" />
            Cliquer pour modifier
          </span>
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn('block w-full text-left p-4')}
          title="Cliquer pour modifier le diagramme"
        >
          <MermaidDiagram code={node.value} className="pointer-events-none" />
        </button>
      </div>
    )
  },
)