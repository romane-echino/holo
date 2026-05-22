/**
 * MarkdownRenderer.tsx — Rendu Markdown block-level avec 3 modes
 *
 * Modes par composant :
 *  - 'view'   : rendu JSX via react-markdown (lecture seule avec hover éditable)
 *  - 'edit'   : textarea sur le block cliqué (markdown brut, modifications locales)
 *  - 'export' : rendu JSX sans chrome interactif (pour export PDF)
 *
 * Archi :
 *  markdown string → splitIntoBlocks() → MarkdownBlock[]
 *    → <Block> par bloc → react-markdown (view/export) | <textarea> (edit)
 *      → onSave(newRaw) → blocksToMarkdown() → onChange(fullMarkdown)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import { cn } from '../utils/global'
import { splitIntoBlocks, blocksToMarkdown } from '../lib/markdownBlocks'
import type { MarkdownBlock, RenderMode } from '../lib/markdownBlocks'

// ─── react-markdown custom components ──────────────────────────────────────

const markdownComponents: Components = {
  code({ children, className, ...rest }) {
    const match = /language-(\w+)/.exec(className ?? '')
    if (match) {
      const highlighted = hljs.highlight(String(children).replace(/\n$/, ''), {
        language: match[1],
        ignoreIllegals: true,
      })
      return (
        <code
          {...rest}
          className={className}
          dangerouslySetInnerHTML={{ __html: highlighted.value }}
        />
      )
    }
    return (
      <code {...rest} className={className}>
        {children}
      </code>
    )
  },
}

// ─── Block edit overlay ─────────────────────────────────────────────────────

function BlockEditOverlay({
  raw,
  onSave,
  onCancel,
}: {
  raw: string
  onSave: (raw: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(raw)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  // Auto-resize textarea to content
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSave(value)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSave(value)}
        className="w-full resize-none overflow-hidden rounded-holo-md border border-holo-primary/40 bg-holo-glass-strong px-3 py-2 font-mono text-sm text-holo-text-muted outline-none transition focus:border-holo-primary/70"
        rows={1}
        spellCheck={false}
      />
      <div className="mt-1 text-right text-[10px] text-holo-text-faint">
        <kbd className="rounded border border-holo-border-soft px-1">Ctrl+↵</kbd> valider ·{' '}
        <kbd className="rounded border border-holo-border-soft px-1">Échap</kbd> annuler
      </div>
    </div>
  )
}

// ─── Single block ───────────────────────────────────────────────────────────

function Block({
  block,
  isEditing,
  exportMode,
  onStartEdit,
  onSave,
  onCancel,
}: {
  block: MarkdownBlock
  isEditing: boolean
  exportMode: boolean
  onStartEdit: () => void
  onSave: (raw: string) => void
  onCancel: () => void
}) {
  if (isEditing) {
    return <BlockEditOverlay raw={block.raw} onSave={onSave} onCancel={onCancel} />
  }

  const content = (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {block.raw}
    </ReactMarkdown>
  )

  if (exportMode) return <>{content}</>

  return (
    <div
      className="group relative -mx-2 cursor-text rounded-holo-md px-2 transition hover:bg-holo-glass/60"
      onClick={onStartEdit}
    >
      <span className="pointer-events-none absolute right-3 top-2 hidden rounded-holo-sm border border-holo-border-soft bg-holo-bg/80 px-1.5 py-0.5 text-[10px] text-holo-text-faint backdrop-blur-sm group-hover:inline">
        éditer
      </span>
      {content}
    </div>
  )
}

// ─── Renderer ───────────────────────────────────────────────────────────────

export type MarkdownRendererProps = {
  markdown: string
  mode?: RenderMode
  onChange?: (markdown: string) => void
  className?: string
}

export function MarkdownRenderer({
  markdown,
  mode = 'view',
  onChange,
  className,
}: MarkdownRendererProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const blocks = useMemo(() => splitIntoBlocks(markdown), [markdown])

  const handleSave = useCallback(
    (index: number, newRaw: string) => {
      const updated = blocks.map((b, i) => (i === index ? { ...b, raw: newRaw.trim() } : b))
      onChange?.(blocksToMarkdown(updated))
      setEditingIndex(null)
    },
    [blocks, onChange],
  )

  // Export mode: no interactive chrome, full document render
  if (mode === 'export') {
    return (
      <div className={cn('holo-markdown', className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
      </div>
    )
  }

  if (blocks.length === 0) {
    return (
      <div className={cn('holo-markdown', className)}>
        <p className="text-holo-text-faint italic">Commencer à écrire…</p>
      </div>
    )
  }

  return (
    <div className={cn('holo-markdown', className)}>
      {blocks.map((block, index) => (
        <Block
          key={index}
          block={block}
          isEditing={editingIndex === index}
          exportMode={false}
          onStartEdit={() => setEditingIndex(index)}
          onSave={(raw) => handleSave(index, raw)}
          onCancel={() => setEditingIndex(null)}
        />
      ))}
    </div>
  )
}
