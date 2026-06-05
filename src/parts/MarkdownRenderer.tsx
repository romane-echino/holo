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
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js'
import { marked } from 'marked'
import { MermaidDiagram } from '../components/MermaidDiagram'
import { InlineColorCode } from '../components/InlineColorCode'
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

function parseFootnoteDefinitions(markdown: string): Map<string, string> {
  const definitions = new Map<string, string>()
  const lines = markdown.split('\n')

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(/^\[\^([^\]]+)\]:\s?(.*)$/)
    if (!match) continue

    const identifier = match[1]?.trim()
    if (!identifier) continue

    const contentLines = [match[2] ?? '']
    let cursor = index + 1

    while (cursor < lines.length) {
      const continuation = lines[cursor]
      if (/^( {2,}|\t)/.test(continuation)) {
        contentLines.push(continuation.replace(/^( {2,}|\t)/, ''))
        cursor += 1
        continue
      }
      if (continuation.trim() === '') {
        contentLines.push('')
        cursor += 1
        continue
      }
      break
    }

    definitions.set(identifier, contentLines.join('\n').trim())
    index = cursor - 1
  }

  return definitions
}

function extractFootnoteReferenceId(href: string | undefined, props: MDProps): string | null {
  if (!href) return null
  if (props['data-footnote-backref']) return null
  if (typeof props.id === 'string' && props.id.includes('footnote-label')) return null

  const match = href.match(/#(?:user-content-)?fn-([^#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
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
  const child = Array.isArray(children) ? children[0] : children
  const mermaidClassName = isValidElement(child) ? (child.props as { className?: string }).className : undefined
  const mermaidSource = isValidElement(child) ? textFromChildren((child.props as { children?: React.ReactNode }).children) : ''
  const isMermaidBlock = /language-mermaid/.test(mermaidClassName ?? '')

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const text = ref.current?.querySelector('code')?.textContent ?? ''
    void window.holo?.writeClipboardText?.(text.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (isMermaidBlock) {
    return (
      <div className="my-4" data-block-index={blockIndex}>
        <MermaidDiagram code={mermaidSource} className="border border-holo-border-soft bg-holo-glass/20" />
      </div>
    )
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

function isYouTubeIframeSrc(src: string | undefined): boolean {
  if (!src) return false
  try {
    const url = new URL(src)
    const hostname = url.hostname.replace(/^www\./, '')
    return hostname === 'youtube.com' || hostname === 'youtube-nocookie.com' || hostname === 'm.youtube.com' || hostname === 'youtu.be'
  } catch {
    return false
  }
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
    const codeValue = String(children).replace(/\n$/, '')
    const match = /language-(\w+)/.exec(className ?? '')
    if (match) {
      const highlighted = hljs.highlight(codeValue, {
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
    if (!className && !codeValue.includes('\n')) {
      return <InlineColorCode value={codeValue} className={className} />
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
  iframe({ node, className, src, title, ...props }) {
    if (!isYouTubeIframeSrc(typeof src === 'string' ? src : undefined)) {
      return <iframe {...props} src={src} title={title} className={className} />
    }

    return (
      <span className="my-4 block overflow-hidden rounded-holo-2xl border border-holo-border-soft bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
        <span className="block aspect-video w-full bg-black">
          <iframe
            {...props}
            src={src}
            title={title ?? 'Vidéo YouTube'}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className={cn('h-full w-full border-0', className)}
          />
        </span>
      </span>
    )
  },
  details({ children, node, className, ...props }) {
    return (
      <details
        {...props}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-white/[0.02] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]',
          className,
        )}
      >
        {children}
      </details>
    )
  },
  summary({ children, node, className, ...props }) {
    return (
      <summary
        {...props}
        onClick={(e) => e.stopPropagation()}
        className={cn('cursor-pointer select-none font-medium text-holo-text marker:text-holo-primary-soft', className)}
      >
        {children}
      </summary>
    )
  },
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
  const footnoteDefinitions = useMemo(() => parseFootnoteDefinitions(markdown), [markdown])

  const resolvedComponents = useMemo<Components>(
    () => ({
      ...defaultComponents,
      a(props) {
        const href = typeof props.href === 'string' ? props.href : undefined
        const footnoteId = extractFootnoteReferenceId(href, props as MDProps)
        const footnoteContent = footnoteId ? footnoteDefinitions.get(footnoteId) : null

        if (!footnoteId || !footnoteContent || mode === 'export') {
          const { children, node, ...rest } = props
          return (
            <a href={href} onClick={(event) => event.stopPropagation()} {...rest}>
              {children}
            </a>
          )
        }

        const { children, className, node, ...rest } = props

        return (
          <span className="group/footnote-ref relative inline-flex align-super">
            <a
              {...rest}
              href={href}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              className={cn(
                'inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border border-holo-primary/20 bg-holo-primary/8 px-1.5 text-[0.7rem] font-semibold leading-none text-holo-primary-soft no-underline transition hover:border-holo-primary/35 hover:bg-holo-primary/14',
                className,
              )}
            >
              {children}
            </a>
            <span
              data-testid="footnote-tooltip"
              className="pointer-events-none invisible absolute left-1/2 top-full z-40 mt-3 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 rounded-holo-xl border border-holo-border-soft bg-holo-bg-elevated/95 p-3 text-left opacity-0 shadow-[0_20px_70px_rgba(0,0,0,.42)] backdrop-blur-xl transition duration-150 group-hover/footnote-ref:visible group-hover/footnote-ref:opacity-100 group-focus-within/footnote-ref:visible group-focus-within/footnote-ref:opacity-100"
            >
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-holo-text-faint">
                Note {footnoteId}
              </div>
              <div className="holo-markdown text-sm text-holo-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={{ ...defaultComponents, ...components }}>
                  {footnoteContent}
                </ReactMarkdown>
              </div>
            </span>
          </span>
        )
      },
      section({ children, className, node, ...props }) {
        if (mode !== 'export' && typeof className === 'string' && /\bfootnotes\b/.test(className)) {
          return null
        }

        return <section {...props} className={className}>{children}</section>
      },
      ...components,
    }),
    [components, footnoteDefinitions, mode],
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={resolvedComponents}>
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
          rehypePlugins={[rehypeRaw]}
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={resolvedComponents}>
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
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={resolvedComponents}>
          {suffixMd}
        </ReactMarkdown>
      )}
    </div>
  )
}

