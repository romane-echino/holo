import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Braces, Eye, Pencil } from 'lucide-react'
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
        <div ref={editorRootRef} className="group relative my-5 overflow-hidden rounded-holo-2xl border border-holo-border-soft/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] shadow-[0_18px_60px_rgba(0,0,0,.10)]">
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-400/8 px-2.5 py-1 text-[11px] text-holo-text-faint ring-1 ring-teal-300/15">
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

          <div className="grid gap-5 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <div className="overflow-hidden rounded-holo-xl bg-black/10 ring-1 ring-white/5">
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
            <div className="rounded-holo-xl bg-[linear-gradient(180deg,rgba(94,234,212,0.07),rgba(0,0,0,0))] p-4 ring-1 ring-white/5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-black/10 px-2.5 py-1 text-[11px] text-holo-text-faint ring-1 ring-white/5">
                <Eye size={11} className="text-teal-300" />
                Aperçu HTML
              </div>
              <div className="rounded-holo-xl bg-white/[0.03] p-5 text-sm text-holo-text ring-1 ring-white/6" dangerouslySetInnerHTML={{ __html: draft || DEFAULT_HTML_SOURCE }} />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="group relative my-5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-[11px] text-slate-800 opacity-0 shadow-[0_10px_20px_rgba(15,23,42,.10)] ring-1 ring-slate-950/6 transition hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
          title="Cliquer pour modifier le bloc HTML"
        >
          <Pencil size={12} />
          Modifier
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left"
          title="Cliquer pour modifier le HTML"
        >
          <div className="rounded-[1rem] border border-transparent bg-transparent p-3 text-sm text-holo-text transition group-hover:border-holo-border-soft/70" dangerouslySetInnerHTML={{ __html: node.value || DEFAULT_HTML_SOURCE }} />
        </button>
      </div>
    )
  },
)