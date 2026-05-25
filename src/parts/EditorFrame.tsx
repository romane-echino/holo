import { useCallback, useEffect, useRef, useState } from 'react'
import { Ellipsis, ExternalLink, FileText, PanelRight } from 'lucide-react'
import { cn } from '../utils/global'
import { BlockEditor } from './MarkdownEditor/BlockEditor'

type EditorFrameProps = {
  filepath: string
  markdown?: string
  onMarkdownChange?: (value: string) => void
  onIconClick?: () => void
  onToggleInspector?: () => void
  onShare?: () => void
  onMore?: () => void
}

function filenameFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? filepath
}

function folderFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/'
}

function extensionFromPath(filepath: string) {
  const filename = filenameFromPath(filepath)
  const extension = filename.split('.').at(-1)
  return extension && extension !== filename ? extension.toUpperCase() : 'FILE'
}

function EditableText({
  value,
  placeholder,
  onChange,
  className,
  multiline = false,
}: {
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  className?: string
  multiline?: boolean
}) {
  if (multiline) {
    return (
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        rows={2}
        className={cn(
          'w-full resize-none rounded-holo-md border border-transparent bg-transparent px-0 py-1 text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-holo-glass focus:px-3 focus:outline-none',
          className,
        )}
      />
    )
  }

  return (
    <input
      value={value ?? ''}
      onChange={(event) => onChange?.(event.target.value)}
      placeholder={placeholder}
      className={cn(
        'w-full rounded-holo-md border border-transparent bg-transparent px-0 py-1 text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-holo-glass focus:px-3 focus:outline-none',
        className,
      )}
    />
  )
}

function PropertyField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value?: string
  placeholder: string
  onChange?: (value: string) => void
}) {
  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 rounded-holo-md px-2 py-1.5 transition hover:bg-holo-glass">
      <span className="text-xs text-holo-text-faint">{label}</span>
      <input
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:outline-none"
      />
    </label>
  )
}

function TagsField({
  tags = [],
  onChange,
}: {
  tags?: string[]
  onChange?: (value: string[]) => void
}) {
  const value = tags.join(', ')

  return (
    <label className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-3 rounded-holo-md px-2 py-1.5 transition hover:bg-holo-glass">
      <span className="pt-1.5 text-xs text-holo-text-faint">Tags</span>
      <div className="min-w-0">
        <input
          value={value}
          onChange={(event) =>
            onChange?.(
              event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            )
          }
          placeholder="architecture, wiki, rag"
          className="w-full rounded-holo-sm border border-transparent bg-transparent px-0 py-1 text-sm text-holo-text-muted placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-white/[0.035] focus:px-2 focus:outline-none"
        />

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full border border-holo-border-soft bg-holo-glass px-2 py-0.5 text-[11px] text-holo-text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </label>
  )
}

function StickyEditorHeader({
  visible,
  icon,
  title,
  author,
  extension,
  onShare,
  onMore,
}: {
  visible: boolean
  icon?: React.ReactNode
  title: string
  author?: string
  extension: string
  onShare?: () => void
  onMore?: () => void
}) {
  return (
    <div
      className={cn(
        'sticky top-0 z-30 border-b border-holo-border-soft bg-holo-bg/10 px-5 py-3 backdrop-blur-lg transition-all duration-200',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
      )}
    >
      <div className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg border border-holo-border-soft bg-holo-glass text-holo-text-muted shadow-[0_8px_28px_rgba(0,0,0,.18)]">
            {icon ?? <FileText size={14} />}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-holo-border-soft bg-holo-glass px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-holo-primary-soft">
                {extension}
              </span>
              <div className="truncate text-sm font-medium text-holo-text">{title}</div>
            </div>

            <div className="mt-0.5 truncate text-xs text-holo-text-faint">{author || 'Auteur inconnu'}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onShare}
            className="flex size-9 items-center justify-center rounded-holo-md bg-holo-primary text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.18)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
            title="Share"
            aria-label="Share"
          >
            <ExternalLink size={14} />
          </button>

          <button
            onClick={onMore}
            className="flex size-9 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            aria-label="Plus d'actions"
            title="Plus d'actions"
          >
            <Ellipsis size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Frontmatter ─────────────────────────────────────────────────────────────────────

interface FrontmatterData {
  title?: string
  description?: string
  author?: string
  created?: string
  updated?: string
  tags?: string[]
  [key: string]: string | string[] | undefined
}

function parseFrontmatter(markdown: string): { fm: FrontmatterData; body: string } {
  const match = markdown.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)/)
  if (!match) return { fm: {}, body: markdown }
  const yamlStr = match[1]
  const body = (match[2] ?? '').replace(/^\n/, '')
  const fm: FrontmatterData = {}
  for (const line of yamlStr.split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (!key) continue
    const raw = line.slice(colon + 1).trim()
    if (raw.startsWith('[') && raw.endsWith(']')) {
      fm[key] = raw.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean)
    } else {
      fm[key] = raw.replace(/^['"]|['"]$/g, '')
    }
  }
  return { fm, body }
}

function serializeFrontmatter(fm: FrontmatterData): string {
  const entries = Object.entries(fm).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''
  )
  if (entries.length === 0) return ''
  const lines = entries.map(([k, v]) =>
    Array.isArray(v) ? `${k}: [${v.join(', ')}]` : `${k}: ${v}`
  )
  return `---\n${lines.join('\n')}\n---\n\n`
}

export function EditorFrame({
  filepath,
  markdown = '',
  onMarkdownChange,
  onIconClick,
  onToggleInspector,
  onShare,
  onMore,
}: EditorFrameProps) {
  const [showStickyHeader, setShowStickyHeader] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  const filename = filenameFromPath(filepath)
  const folder = folderFromPath(filepath)
  const extension = extensionFromPath(filepath)
  const icon = undefined

  // ── État dérivé du frontmatter (remonte à chaque changement de fichier via key=path) ─
  const [fm, setFm] = useState<FrontmatterData>(() => parseFrontmatter(markdown).fm)
  const [body, setBody] = useState(() => parseFrontmatter(markdown).body)
  const fmRef = useRef<FrontmatterData>(fm)
  fmRef.current = fm
  const bodyRef = useRef(body)
  bodyRef.current = body

  const displayTitle = (fm.title as string | undefined) || filename.replace(/\.[^/.]+$/, '')

  const handleFmChange = useCallback((updates: Partial<FrontmatterData>) => {
    const next: FrontmatterData = {}
    for (const [k, v] of Object.entries({ ...fmRef.current, ...updates })) {
      if (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '') next[k] = v
    }
    setFm(next)
    onMarkdownChange?.(serializeFrontmatter(next) + bodyRef.current)
  }, [onMarkdownChange])

  const handleBodyChange = useCallback((newBody: string) => {
    setBody(newBody)
    onMarkdownChange?.(serializeFrontmatter(fmRef.current) + newBody)
  }, [onMarkdownChange])

  useEffect(() => {
    const el = sectionRef.current
    if (!el) return

    let scrollEl: HTMLElement | null = el.parentElement
    while (scrollEl) {
      const { overflow, overflowY } = getComputedStyle(scrollEl)
      if (/auto|scroll/.test(overflow + overflowY)) break
      scrollEl = scrollEl.parentElement
    }

    if (!scrollEl) return

    const target = scrollEl
    const handleScroll = () => setShowStickyHeader(target.scrollTop > 12)

    handleScroll()
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => target.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <section ref={sectionRef} className="relative min-h-full" data-editor>
      <StickyEditorHeader
        visible={showStickyHeader}
        icon={icon}
        title={displayTitle}
        author={fm.author as string | undefined}
        extension={extension}
        onShare={onShare}
        onMore={onMore}
      />

      <div className="mx-auto max-w-[920px] px-5 py-6 sm:px-8 md:px-10 md:py-9">
        <header className="mb-10">
          <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <button
              onClick={onIconClick}
              className="flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-white/[0.04] bg-holo-glass text-holo-text-muted shadow-[0_10px_40px_rgba(0,0,0,.24)] transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              title="Changer l'icône"
              aria-label="Changer l'icône"
            >
              {icon ?? <FileText size={13} />}
            </button>

            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="rounded-full border border-holo-border-soft bg-holo-glass px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-holo-primary-soft">
                {extension}
              </span>
              <span className="truncate text-xs text-holo-text-faint">{folder}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onToggleInspector}
                className="3xl:hidden flex size-10 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                title="Inspecteur"
                aria-label="Inspecteur"
              >
                <PanelRight size={14} />
              </button>

              <button
                onClick={onShare}
                className="flex size-10 items-center justify-center rounded-holo-md bg-holo-primary py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
                title="Share"
                aria-label="Share"
              >
                <ExternalLink size={14} />
              </button>

              <button
                onClick={onMore}
                className="flex size-10 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                aria-label="Plus d'actions"
                title="Plus d'actions"
              >
                <Ellipsis size={14} />
              </button>
            </div>
          </div>

          <div className="mb-6 flex flex-col gap-2">
            <EditableText
              value={displayTitle}
              onChange={(v) => handleFmChange({ title: v })}
              placeholder="Untitled"
              className="text-[clamp(2.25rem,5vw,4rem)] font-[650] leading-[1] tracking-[-0.05em]"
            />

            <EditableText
              value={fm.description as string | undefined}
              onChange={(v) => handleFmChange({ description: v })}
              placeholder="Ajouter une description…"
              multiline
              className="max-w-[720px] text-[1.02rem] leading-7"
            />
          </div>

          <div className="rounded-holo-2xl border border-holo-border-soft bg-holo-glass p-3">
            <PropertyField label="Auteur" value={fm.author as string | undefined} placeholder="Auteur…" onChange={(v) => handleFmChange({ author: v })} />
            <PropertyField label="Créé" value={fm.created as string | undefined} placeholder="Date de création…" onChange={(v) => handleFmChange({ created: v })} />
            <PropertyField label="Modifié" value={fm.updated as string | undefined} placeholder="Date de modification…" onChange={(v) => handleFmChange({ updated: v })} />
            <TagsField tags={Array.isArray(fm.tags) ? fm.tags as string[] : []} onChange={(t) => handleFmChange({ tags: t })} />
          </div>
        </header>

        <article>
          <BlockEditor markdown={body} onChange={handleBodyChange} />
        </article>
      </div>
    </section>
  )
}

