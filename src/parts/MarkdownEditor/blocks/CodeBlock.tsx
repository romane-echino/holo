/**
 * CodeBlock.tsx — Bloc de code éditable (fenced code block)
 */

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import hljs from 'highlight.js'
import { Check, Copy } from 'lucide-react'
import { cn } from '../../../utils/global'
import type { CodeNode } from '../lib/types'
import type { InlineEditorHandle } from '../InlineEditor'

interface CodeBlockProps {
  node: CodeNode
  onChange: (node: CodeNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

const LANGUAGES = ['plaintext', 'javascript', 'typescript', 'python', 'sql', 'bash', 'html', 'css', 'json', 'markdown', 'rust', 'java', 'go', 'csharp', 'cpp'] as const

export const CodeBlock = forwardRef<InlineEditorHandle, CodeBlockProps>(
  function CodeBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(node.value)
  const [draftLang, setDraftLang] = useState(node.lang ?? 'plaintext')
  const editorRootRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbers = useMemo(() => {
    const lineCount = Math.max(1, draft.split('\n').length)
    return Array.from({ length: lineCount }, (_value, index) => index + 1)
  }, [draft])

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
    setDraftLang(node.lang ?? 'plaintext')
  }, [node.lang, node.value])

  const commit = useMemo(
    () => () => {
      setEditing(false)
      if (draft !== node.value || draftLang !== (node.lang ?? 'plaintext')) {
        onChange({ ...node, value: draft, lang: draftLang === 'plaintext' ? 'plaintext' : draftLang })
      }
    },
    [draft, draftLang, node, onChange],
  )

  const highlightedHtml = useMemo(() => {
    const source = draft || node.value || ''
    if (!source) return ''
    if (!draftLang || draftLang === 'plaintext') {
      return hljs.highlightAuto(source).value
    }
    try {
      return hljs.highlight(source, { language: draftLang, ignoreIllegals: true }).value
    } catch {
      return hljs.highlightAuto(source).value
    }
  }, [draft, draftLang, node.value])

  const handleCopy = async () => {
    try {
      await window.holo?.writeClipboardText?.(node.value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  const handleTextareaBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
    const nextFocused = event.relatedTarget as Node | null
    if (nextFocused && editorRootRef.current?.contains(nextFocused)) {
      return
    }
    commit()
  }

    if (editing) {
      return (
        <div ref={editorRootRef} className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
          <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
            <select
              value={draftLang}
              onChange={(event) => setDraftLang(event.target.value)}
              className="rounded-holo-sm border border-holo-border-soft bg-holo-bg px-2 py-1 font-mono text-[11px] text-holo-text outline-none"
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
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
                  setDraftLang(node.lang ?? 'plaintext')
                  setEditing(false)
                }}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-text-faint hover:bg-holo-glass"
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="border-b border-holo-border-soft/50 bg-black/10">
            <div className="flex min-h-[220px] items-stretch">
              <div className="flex shrink-0 select-none flex-col border-r border-holo-border-soft/40 bg-black/20 px-3 py-4 text-right font-mono text-xs leading-6 text-holo-text-faint/70">
                {lineNumbers.map((lineNumber) => (
                  <span key={lineNumber}>{lineNumber}</span>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={handleTextareaBlur}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
                    event.preventDefault()
                    event.stopPropagation()
                    event.currentTarget.select()
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraft(node.value)
                    setDraftLang(node.lang ?? 'plaintext')
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
                placeholder="console.log('Hello, Holo')"
                className="min-h-[220px] w-full resize-y border-0 bg-transparent px-4 py-4 font-mono text-sm leading-6 text-holo-text focus:outline-none holo-scrollbar"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
        <div className="flex items-center justify-between border-b border-holo-border-soft/60 px-4 py-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-mono text-[11px] text-holo-text-faint transition hover:text-holo-text"
            title="Cliquer pour modifier le bloc code"
          >
            {node.lang || 'plaintext'}
          </button>
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 rounded-holo-sm px-2 py-1 text-[11px] transition',
              copied
                ? 'text-holo-success'
                : 'text-holo-text-faint opacity-0 group-hover:opacity-100 hover:text-holo-text',
            )}
            title="Copier le code"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full text-left"
          title="Cliquer pour modifier le code"
        >
          <pre className="overflow-x-auto p-4 font-mono text-sm leading-relaxed text-holo-text-muted holo-scrollbar">
            {node.value
              ? <code className="hljs" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
              : <code className="text-holo-text-faint">Bloc code vide — cliquer pour saisir du code</code>}
          </pre>
        </button>
      </div>
    )
  },
)
