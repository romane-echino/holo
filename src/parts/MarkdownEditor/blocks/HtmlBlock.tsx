import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Braces, Eye } from 'lucide-react'
import type { InlineEditorHandle } from '../InlineEditor'
import type { HtmlNode } from './DetailsBlock'

interface HtmlBlockProps {
  node: HtmlNode
  onChange: (node: HtmlNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

const DEFAULT_HTML_SOURCE = ['<div class="callout">', '  <strong>Hello HTML</strong>', '</div>'].join('\n')

export const HtmlBlock = forwardRef<InlineEditorHandle, HtmlBlockProps>(
  function HtmlBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(node.value)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const editorRootRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      setDraft(node.value)
    }, [node.value])

    const commit = () => {
      setEditing(false)
      if (draft !== node.value) {
        onChange({ ...node, value: draft })
      }
    }

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

    const handleTextareaBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
      const nextFocused = event.relatedTarget as Node | null
      if (nextFocused && editorRootRef.current?.contains(nextFocused)) return
      commit()
    }

    if (editing) {
      return (
        <div ref={editorRootRef} className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
          <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint">
              <Braces size={12} className="text-holo-primary-soft" />
              html
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
                onBlur={handleTextareaBlur}
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
                placeholder={DEFAULT_HTML_SOURCE}
                className="min-h-[240px] w-full resize-y border-0 bg-transparent px-4 py-4 font-mono text-sm leading-6 text-holo-text focus:outline-none holo-scrollbar"
                spellCheck={false}
              />
            </div>
            <div className="bg-[linear-gradient(180deg,rgba(94,234,212,0.07),rgba(0,0,0,0))] p-4">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-black/10 px-2.5 py-1 text-[11px] text-holo-text-faint">
                <Eye size={11} className="text-teal-300" />
                Aperçu HTML
              </div>
              <div className="rounded-holo-lg border border-holo-border-soft bg-white/[0.025] p-4 text-sm text-holo-text" dangerouslySetInnerHTML={{ __html: draft || DEFAULT_HTML_SOURCE }} />
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
            title="Cliquer pour modifier le bloc HTML"
          >
            <Braces size={12} className="text-holo-primary-soft" />
            html
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left p-4"
          title="Cliquer pour modifier le HTML"
        >
          <div className="rounded-holo-lg border border-holo-border-soft bg-white/[0.025] p-4 text-sm text-holo-text" dangerouslySetInnerHTML={{ __html: node.value || DEFAULT_HTML_SOURCE }} />
        </button>
      </div>
    )
  },
)