/**
 * MarkdownRenderer.tsx — Rendu Markdown block-level avec 3 modes
 *
 * Modes :
 *  - 'view'   : document entier dans UN seul ReactMarkdown (préserve le contexte
 *               footnotes, cross-refs, etc.). Plugin remark ajoute data-block-index
 *               sur chaque nœud racine → event delegation pour détecter le clic.
 *  - 'edit'   : clic → bloc en contentEditable WYSIWYG (marked pour l'init HTML,
 *               htmlToMarkdown/turndown pour la sérialisation retour)
 *  - 'export' : ReactMarkdown brut sans chrome interactif
 *
 * Props :
 *  - components : surcharge de n'importe quel composant react-markdown
 */

import { useState, useMemo, useCallback, useRef, useEffect, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import { marked } from 'marked'
import { cn } from '../utils/global'
import { htmlToMarkdown } from '../lib/markdown'
import { splitIntoBlocks, blocksToMarkdown } from '../lib/markdownBlocks'
import type { RenderMode } from '../lib/markdownBlocks'

// ─── Remark plugin: data-block-index ───────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remarkAddBlockIndex() {
  return (tree: any) => {
    tree.children.forEach((node: any, index: number) => {
      node.data ??= {}
      node.data.hProperties = { ...node.data.hProperties, 'data-block-index': String(index) }
    })
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function textFromChildren(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textFromChildren).join('')
  if (isValidElement(children))
    return textFromChildren((children.props as { children?: React.ReactNode }).children)
  return ''
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MDProps = { children?: React.ReactNode; node?: unknown; [key: string]: any }

// ─── Custom block components ────────────────────────────────────────────────

function makeHeading(Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  return function HeadingComponent({ children, node, ...props }: MDProps) {
    const id = (props.id as string | undefined) ?? slugify(textFromChildren(children))
    return (
      <Tag id={id} className="group/heading relative" {...props}>
        {children}
        <a
          href={`#${id}`}
          onClick={(e) => e.stopPropagation()}
          aria-hidden
          tabIndex={-1}
          className="ml-2 opacity-0 group-hover/heading:opacity-30 hover:!opacity-70 transition-opacity text-holo-text-faint no-underline"
        >
          #
        </a>
      </Tag>
    )
  }
}

function PreComponent({ children, node, ...props }: MDProps) {
  const { 'data-block-index': blockIndex, ...preProps } = props
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLPreElement>(null)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = ref.current?.querySelector('code')?.textContent ?? ''
    void window.holo?.writeClipboardText?.(text.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="group/pre relative" data-block-index={blockIndex}>
      <pre ref={ref} {...preProps}>
        {children}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 opacity-0 group-hover/pre:opacity-60 hover:!opacity-100 transition-opacity rounded-holo-sm border border-holo-border-soft bg-holo-bg/80 px-2 py-0.5 text-[11px] text-holo-text-muted backdrop-blur-sm"
      >
        {copied ? '✓ Copié' : 'Copier'}
      </button>
    </div>
  )
}

function TableComponent({ children, node, ...props }: MDProps) {
  const { 'data-block-index': blockIndex, ...tableProps } = props
  return (
    <div className="overflow-x-auto" data-block-index={blockIndex}>
      <table {...tableProps}>{children}</table>
    </div>
  )
}

function ImgComponent({ src, alt, node, ...props }: MDProps) {
  const [error, setError] = useState(false)

  if (error) {
    return (
      <span className="flex aspect-video w-full items-center justify-center rounded-holo-2xl border border-holo-border-soft bg-holo-glass">
        <span className="text-center">
          <span className="block text-2xl text-holo-text-faint">⊘</span>
          <span className="mt-1 block text-xs text-holo-text-faint">{alt || 'Image non disponible'}</span>
        </span>
      </span>
    )
  }

  return <img src={src} alt={alt} onError={() => setError(true)} {...props} />
}

// ─── Default react-markdown components ─────────────────────────────────────

const defaultComponents: Components = {
  // Links: stop propagation so clicks don't trigger block edit
  a({ href, children, node, ...props }) {
    return (
      <a href={href} onClick={(e) => e.stopPropagation()} {...props}>
        {children}
      </a>
    )
  },
  // Checkboxes: stop propagation
  input({ node, ...props }) {
    return <input onClick={(e) => e.stopPropagation()} {...props} />
  },
  // Code: syntax highlighting via hljs
  code({ children, className, node, ...rest }) {
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
  // Headings: auto-id + hover anchor link
  h1: makeHeading('h1'),
  h2: makeHeading('h2'),
  h3: makeHeading('h3'),
  h4: makeHeading('h4'),
  h5: makeHeading('h5'),
  h6: makeHeading('h6'),
  // Code blocks: copy button (forwards data-block-index to wrapper div)
  pre: PreComponent,
  // Tables: horizontal scroll wrapper (forwards data-block-index to wrapper div)
  table: TableComponent,
  // Images: error fallback
  img: ImgComponent,
}

// ─── WYSIWYG block editor ───────────────────────────────────────────────────
// Le bloc cliqué devient contentEditable avec le HTML rendu.
// Save : htmlToMarkdown (turndown) reconvertit le HTML en markdown.

function BlockWysiwygEditor({
  raw,
  onSave,
}: {
  raw: string
  onSave: (markdown: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const didSave = useRef(false)

  // Init contentEditable avec le HTML rendu — une seule fois au mount
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = marked.parse(raw) as string
    el.focus()
    // Curseur à la fin
    const range = document.createRange()
    const sel = window.getSelection()
    range.selectNodeContents(el)
    range.collapse(false)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const doSave = useCallback(() => {
    if (didSave.current) return
    didSave.current = true
    const html = ref.current?.innerHTML ?? ''
    onSave(htmlToMarkdown(html))
  }, [onSave])

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={doSave}
      className="holo-markdown min-h-[1.5rem] outline-none"
    />
  )
}

// ─── Renderer ───────────────────────────────────────────────────────────────

export type MarkdownRendererProps = {
  markdown: string
  mode?: RenderMode
  /** Surcharge de composants react-markdown. Fusionné avec les défauts. */
  components?: Components
  onChange?: (markdown: string) => void
  className?: string
}

export function MarkdownRenderer({
  markdown,
  mode = 'view',
  components,
  onChange,
  className,
}: MarkdownRendererProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const blocks = useMemo(() => splitIntoBlocks(markdown), [markdown])

  const resolvedComponents = useMemo<Components>(
    () => ({ ...defaultComponents, ...components }),
    [components],
  )

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const blockEl = (e.target as Element).closest('[data-block-index]')
    if (!blockEl) return
    const index = parseInt(blockEl.getAttribute('data-block-index') ?? '-1', 10)
    if (index >= 0) setEditingIndex(index)
  }, [])

  const handleSave = useCallback(
    (index: number, newRaw: string) => {
      const updated = blocks.map((b, i) => (i === index ? { ...b, raw: newRaw.trim() } : b))
      onChange?.(blocksToMarkdown(updated))
      setEditingIndex(null)
    },
    [blocks, onChange],
  )

  // Export mode: no interactive chrome
  if (mode === 'export') {
    return (
      <div className={cn('holo-markdown', className)}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={resolvedComponents}>
          {markdown}
        </ReactMarkdown>
      </div>
    )
  }

  if (!markdown.trim()) {
    return (
      <div className={cn('holo-markdown', className)}>
        <p className="italic text-holo-text-faint">Commencer à écrire…</p>
      </div>
    )
  }

  // View mode: single ReactMarkdown → préserve footnotes, cross-refs
  if (editingIndex === null) {
    return (
      <div
        className={cn('holo-markdown holo-markdown--editable', className)}
        onClick={handleContainerClick}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkAddBlockIndex]}
          components={resolvedComponents}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    )
  }

  // Edit mode: prefix + WYSIWYG editor + suffix
  const prefixMd = blocks.slice(0, editingIndex).map((b) => b.raw).join('\n\n')
  const suffixMd = blocks.slice(editingIndex + 1).map((b) => b.raw).join('\n\n')
  const currentBlock = blocks[editingIndex]

  return (
    <div className={cn('holo-markdown', className)}>
      {prefixMd && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={resolvedComponents}>
          {prefixMd}
        </ReactMarkdown>
      )}
      {currentBlock && (
        <BlockWysiwygEditor
          raw={currentBlock.raw}
          onSave={(raw) => handleSave(editingIndex, raw)}
          onCancel={() => setEditingIndex(null)}
        />
      )}
      {suffixMd && (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={resolvedComponents}>
          {suffixMd}
        </ReactMarkdown>
      )}
    </div>
  )
}

