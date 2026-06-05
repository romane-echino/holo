import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ChevronDown, ChevronRight, FoldVertical, Pencil, TextQuote } from 'lucide-react'
import type { InlineEditorHandle } from '../InlineEditor'

export interface HtmlNode {
  type: 'html'
  value: string
}

interface DetailsBlockProps {
  node: HtmlNode
  onChange: (node: HtmlNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

interface ParsedDetailsBlock {
  summary: string
  content: string
  open: boolean
}

const DETAILS_BLOCK_REGEX = /^<details(?<attrs>[^>]*)>\s*<summary>(?<summary>[\s\S]*?)<\/summary>\s*(?<content>[\s\S]*?)\s*<\/details>\s*$/i
const DEFAULT_DETAILS_SUMMARY = 'Click me'
const DEFAULT_DETAILS_CONTENT = 'Content'

function decodeHtml(value: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function parseDetailsHtml(value: string): ParsedDetailsBlock | null {
  const match = value.trim().match(DETAILS_BLOCK_REGEX)
  if (!match?.groups) return null

  return {
    summary: decodeHtml(match.groups.summary).trim() || DEFAULT_DETAILS_SUMMARY,
    content: match.groups.content.replace(/^\n+|\n+$/g, '') || DEFAULT_DETAILS_CONTENT,
    open: /\sopen(?:\s|=|$)/i.test(match.groups.attrs ?? ''),
  }
}

export function isDetailsHtmlNode(node: unknown): node is HtmlNode {
  return Boolean(
    node
    && typeof node === 'object'
    && 'type' in node
    && 'value' in node
    && (node as { type?: string }).type === 'html'
    && typeof (node as { value?: string }).value === 'string'
    && parseDetailsHtml((node as { value: string }).value),
  )
}

export function buildDetailsHtml(summary: string, content: string, open = false): string {
  const normalizedSummary = summary.trim() || DEFAULT_DETAILS_SUMMARY
  const normalizedContent = content.replace(/^\n+|\n+$/g, '').trim() || DEFAULT_DETAILS_CONTENT

  return [
    `<details${open ? ' open' : ''}>`,
    `<summary>${escapeHtml(normalizedSummary)}</summary>`,
    '',
    normalizedContent,
    '</details>',
  ].join('\n')
}

export const DetailsBlock = forwardRef<InlineEditorHandle, DetailsBlockProps>(
  function DetailsBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const parsed = useMemo(() => parseDetailsHtml(node.value), [node.value])
    const [editing, setEditing] = useState(false)
    const [draftSummary, setDraftSummary] = useState(parsed?.summary ?? DEFAULT_DETAILS_SUMMARY)
    const [draftContent, setDraftContent] = useState(parsed?.content ?? DEFAULT_DETAILS_CONTENT)
    const [previewOpen, setPreviewOpen] = useState(parsed?.open ?? false)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const summaryInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      setDraftSummary(parsed?.summary ?? DEFAULT_DETAILS_SUMMARY)
      setDraftContent(parsed?.content ?? DEFAULT_DETAILS_CONTENT)
      setPreviewOpen(parsed?.open ?? false)
    }, [parsed?.content, parsed?.open, parsed?.summary])

    const commit = () => {
      setEditing(false)
      const nextValue = buildDetailsHtml(draftSummary, draftContent, previewOpen)
      if (nextValue !== node.value) {
        onChange({ ...node, value: nextValue })
      }
    }

    useImperativeHandle(ref, () => ({
      focus: () => {
        setEditing(true)
        requestAnimationFrame(() => {
          summaryInputRef.current?.focus()
          summaryInputRef.current?.select()
        })
      },
      clear: () => setDraftContent(''),
      clearSlash: () => [],
      flush: () => { commit() },
      getContent: () => [],
    }))

    const handleEditorBlur = (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocused = event.relatedTarget as Node | null
      if (nextFocused && editorRootRef.current?.contains(nextFocused)) return
      commit()
    }

    if (!parsed && !editing) {
      return (
        <div className="rounded-holo-xl border border-dashed border-holo-border-soft px-3 py-2 text-sm text-holo-text-faint">
          Bloc HTML non pris en charge
        </div>
      )
    }

    if (editing) {
      return (
        <div
          ref={editorRootRef}
          onBlur={handleEditorBlur}
          className="group relative my-5 overflow-hidden rounded-holo-2xl border border-holo-border-soft/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0.012))] shadow-[0_18px_54px_rgba(0,0,0,.08)]"
        >
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-400/8 px-2.5 py-1 text-[11px] text-holo-text-faint ring-1 ring-sky-300/15">
              <FoldVertical size={12} className="text-holo-primary-soft" />
              details
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
                  setDraftSummary(parsed?.summary ?? DEFAULT_DETAILS_SUMMARY)
                  setDraftContent(parsed?.content ?? DEFAULT_DETAILS_CONTENT)
                  setPreviewOpen(parsed?.open ?? false)
                  setEditing(false)
                }}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-text-faint hover:bg-holo-glass"
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="grid gap-5 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
            <div className="space-y-3 rounded-holo-xl bg-white/[0.015] p-4 ring-1 ring-white/5">
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-holo-text-faint">Résumé</span>
                <input
                  ref={summaryInputRef}
                  value={draftSummary}
                  onChange={(event) => setDraftSummary(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setDraftSummary(parsed?.summary ?? DEFAULT_DETAILS_SUMMARY)
                      setDraftContent(parsed?.content ?? DEFAULT_DETAILS_CONTENT)
                      setPreviewOpen(parsed?.open ?? false)
                      setEditing(false)
                    }
                  }}
                  placeholder={DEFAULT_DETAILS_SUMMARY}
                  className="w-full rounded-holo-md border border-holo-border-soft bg-holo-bg px-3 py-2 text-sm text-holo-text outline-none"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-[0.18em] text-holo-text-faint">Contenu</span>
                <textarea
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault()
                      commit()
                      onEnterAtEnd?.()
                    }
                    if (event.key === 'Backspace' && draftSummary.trim() === '' && draftContent === '') {
                      event.preventDefault()
                      onBackspaceAtStart?.()
                    }
                  }}
                  placeholder={DEFAULT_DETAILS_CONTENT}
                  className="min-h-[220px] w-full resize-y rounded-holo-md border border-holo-border-soft bg-transparent px-3 py-3 font-mono text-sm leading-6 text-holo-text outline-none holo-scrollbar"
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="rounded-holo-xl bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.08),transparent_62%)] p-4 ring-1 ring-white/5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint ring-1 ring-white/5">
                <TextQuote size={11} className="text-sky-300" />
                Aperçu GitHub details
              </div>
              <details open={previewOpen} className="rounded-holo-xl bg-white/[0.03] px-4 py-3 text-sm text-holo-text ring-1 ring-white/6">
                <summary className="cursor-pointer select-none font-medium marker:text-holo-primary-soft">{draftSummary.trim() || DEFAULT_DETAILS_SUMMARY}</summary>
                <div className="mt-3 border-l border-holo-border-soft/60 pl-4 text-holo-text-muted">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{draftContent || DEFAULT_DETAILS_CONTENT}</ReactMarkdown>
                </div>
              </details>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="group relative my-5 px-1 py-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-2 top-0 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/82 px-3 py-1.5 text-[11px] text-slate-800 opacity-0 shadow-[0_10px_20px_rgba(15,23,42,.10)] ring-1 ring-slate-950/6 transition hover:bg-white group-hover:opacity-100 group-focus-within:opacity-100"
          title="Cliquer pour modifier la section repliable"
        >
          <Pencil size={12} />
          Modifier
        </button>

        <details
          open={previewOpen}
          className="text-sm text-holo-text"
          onToggle={(event) => setPreviewOpen((event.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none font-medium marker:text-holo-primary-soft">
            <span className="inline-flex items-center gap-2">
              {previewOpen ? <ChevronDown size={14} className="text-holo-primary-soft" /> : <ChevronRight size={14} className="text-holo-primary-soft" />}
              {parsed?.summary ?? DEFAULT_DETAILS_SUMMARY}
            </span>
          </summary>
          <div className="mt-3 ml-3 border-l-2 border-holo-border-soft/70 pl-5 text-holo-text-muted">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed?.content ?? DEFAULT_DETAILS_CONTENT}</ReactMarkdown>
          </div>
        </details>
      </div>
    )
  },
)