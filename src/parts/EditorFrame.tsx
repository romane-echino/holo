import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Code2, Ellipsis, ExternalLink, FileText, PanelRight } from 'lucide-react'
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react'
import { cn } from '../utils/global'
import { BlockEditor } from './MarkdownEditor/BlockEditor'
import { useConfig } from '../contexts/ConfigContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { ContextMenu } from '../components/ContextMenu'
import type { ContextMenuAction } from '../components/ContextMenu'

type EditorFrameProps = {
  filepath: string
  markdown?: string
  onMarkdownChange?: (value: string) => void
  onIconClick?: () => void
  onToggleInspector?: () => void
  onShare?: () => void
  onMore?: () => void
  saveStatus?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
  onMobileBack?: () => void
  contentFontScale?: number
}

function filenameFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? filepath
}

function buildBreadcrumb(filepath: string, rootPath?: string): string[] {
  const normalized = filepath.replace(/\\/g, '/')
  if (!rootPath) return [normalized.split('/').filter(Boolean).at(-1) ?? filepath]
  const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  const spaceName = root.split('/').filter(Boolean).at(-1) ?? 'Espace'
  if (!normalized.startsWith(root)) return [normalized.split('/').filter(Boolean).at(-1) ?? filepath]
  const relative = normalized.slice(root.length).replace(/^\//, '')
  const parts = relative.split('/').filter(Boolean)
  return [spaceName, ...parts]
}

function EditableText({
  value,
  placeholder,
  onChange,
  className,
  multiline = false,
  rows = 1,
}: {
  value?: string
  placeholder: string
  onChange?: (value: string) => void
  className?: string
  multiline?: boolean
  rows?: number
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!multiline || !taRef.current) return
    taRef.current.style.height = 'auto'
    taRef.current.style.height = `${taRef.current.scrollHeight}px`
  }, [value, multiline])

  if (multiline) {
    return (
      <textarea
        ref={taRef}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
        }}
        className={cn(
          'w-full resize-none overflow-hidden rounded-holo-md border border-transparent bg-transparent px-0 py-1 placeholder:text-holo-text-faint transition focus:border-holo-border-soft focus:bg-holo-glass focus:px-3 focus:outline-none',
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

function TagsMetaField({
  tags,
  onChange,
}: {
  tags: string[]
  onChange?: (tags: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const raw = tags.join(', ')

  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wide text-holo-text-faint">Tags</span>
        <input
          ref={ref}
          autoFocus
          defaultValue={raw}
          onBlur={(e) => {
            setEditing(false)
            onChange?.(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }}
          placeholder="tag1, tag2"
          className="w-40 rounded-holo-sm bg-holo-glass px-1.5 py-0.5 text-xs text-holo-text outline-none ring-1 ring-holo-primary/30"
        />
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-holo-sm px-1 py-0.5 transition hover:bg-holo-glass"
    >
      <span className="text-[10px] uppercase tracking-wide text-holo-text-faint">Tags</span>
      {tags.length > 0
        ? <span className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-holo-glass px-1.5 py-px text-[10px] text-holo-text-muted">{t}</span>
            ))}
          </span>
        : <span className="text-xs italic text-holo-text-faint/40">aucun tag</span>
      }
    </button>
  )
}

function StickyEditorHeader({
  visible,
  icon,
  title,
  author,
  saveStatus,
  rawMode,
  onShare,
  onToggleInspector,
  onToggleRaw,
}: {
  visible: boolean
  icon?: React.ReactNode
  title: string
  author?: string
  saveStatus?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
  rawMode: boolean
  onShare?: () => void
  onToggleInspector?: () => void
  onToggleRaw: () => void
}) {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)

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
              <div className="truncate text-sm font-medium text-holo-text">{title}</div>
            </div>

            <div className="mt-0.5 truncate text-xs text-holo-text-faint">{author || 'Auteur inconnu'}</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SaveStatusBadge status={saveStatus} />

          <button
            onClick={onToggleInspector}
            className="3xl:hidden flex size-9 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            title="Inspecteur"
            aria-label="Inspecteur"
          >
            <PanelRight size={14} />
          </button>

          <button
            onClick={onShare}
            className="flex size-9 items-center justify-center rounded-holo-md bg-holo-primary text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.18)] transition hover:bg-holo-primary/90 active:scale-[0.98]"
            title="Share"
            aria-label="Share"
          >
            <ExternalLink size={14} />
          </button>

          <div className="relative">
            <button
              onClick={(e) => setMenuAnchorEl(e.currentTarget)}
              className="flex size-9 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              aria-label="Plus d'actions"
              title="Plus d'actions"
            >
              <Ellipsis size={14} />
            </button>

            {menuAnchorEl && (
              <ContextMenu
                anchorEl={menuAnchorEl}
                anchorAlign="right"
                onClose={() => setMenuAnchorEl(null)}
                items={[
                  {
                    type: 'item',
                    label: rawMode ? "Retour à l'éditeur" : 'Affichage brut',
                    icon: Code2,
                    onClick: () => { onToggleRaw(); setMenuAnchorEl(null) },
                  },
                ] satisfies ContextMenuAction[]}
              />
            )}
          </div>
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

function nowDateStr() {
  return new Date().toISOString()
}

function relativeTime(str?: string): string {
  if (!str) return '—'
  const d = new Date(str)
  if (isNaN(d.getTime())) return str
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'à l\'instant'
  const m = Math.floor(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  const day = Math.floor(h / 24)
  if (day === 1) return 'hier'
  if (day < 30) return `il y a ${day} j`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `il y a ${mo} mois`
  const yr = Math.floor(mo / 12)
  return `il y a ${yr} an${yr > 1 ? 's' : ''}`
}

function ReadOnlyMetaField({ label, value, title }: { label: string; value?: string; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1 py-0.5" title={title}>
      <span className="text-[10px] uppercase tracking-wide text-holo-text-faint">{label}</span>
      <span className="text-xs text-holo-text-muted">{value || '\u2014'}</span>
    </span>
  )
}

function SaveStatusBadge({ status }: { status?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'error' }) {
  if (!status || status === 'idle') return null
  if (status === 'unsaved') return (
    <span className="flex items-center gap-1.5 text-xs text-holo-text-faint/60">
      <span className="size-1.5 shrink-0 rounded-full bg-holo-text-faint/40" />
      Modifié
    </span>
  )
  if (status === 'saving') return (
    <span className="flex items-center gap-1.5 text-xs text-holo-text-faint animate-pulse">
      <span className="size-1.5 shrink-0 rounded-full bg-holo-text-faint animate-pulse" />
      Enregistrement…
    </span>
  )
  if (status === 'saved') return (
    <span className="flex items-center gap-1.5 text-xs text-holo-success">
      <Check size={10} className="shrink-0" />
      Enregistré
    </span>
  )
  if (status === 'error') return (
    <span className="text-xs text-holo-danger">Erreur d’enregistrement</span>
  )
  return null
}

export function EditorFrame({
  filepath,
  markdown = '',
  onMarkdownChange,
  onToggleInspector,
  onShare,
  saveStatus,
  onMobileBack,
  contentFontScale,
}: EditorFrameProps) {
  const [showStickyHeader, setShowStickyHeader] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [rawValue, setRawValue] = useState('')
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const iconPickerRef = useRef<HTMLDivElement>(null)

  const { rootPath } = useWorkspace()
  const { appAuthor } = useConfig()
  const filename = filenameFromPath(filepath)
  const breadcrumb = buildBreadcrumb(filepath, rootPath ?? undefined)

  // ── État dérivé du frontmatter (remonte à chaque changement de fichier via key=path) ─
  const [fm, setFm] = useState<FrontmatterData>(() => {
    if (markdown.trim() === '') {
      const today = nowDateStr()
      const title = filenameFromPath(filepath).replace(/\.[^/.]+$/, '')
      return { title, author: appAuthor || undefined, created: today, updated: today }
    }
    return parseFrontmatter(markdown).fm
  })
  const [body, setBody] = useState(() => {
    if (markdown.trim() === '') return ''
    return parseFrontmatter(markdown).body
  })
  const fmRef = useRef<FrontmatterData>(fm)
  fmRef.current = fm
  const bodyRef = useRef(body)
  bodyRef.current = body

  const displayTitle = (fm.title as string | undefined) || filename.replace(/\.[^/.]+$/, '')

  const handleFmChange = useCallback((updates: Partial<FrontmatterData>) => {
    const next: FrontmatterData = {}
    for (const [k, v] of Object.entries({ ...fmRef.current, updated: nowDateStr(), ...updates })) {
      if (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '') next[k] = v
    }
    setFm(next)
    onMarkdownChange?.(serializeFrontmatter(next) + bodyRef.current)
  }, [onMarkdownChange])

  const handleBodyChange = useCallback((newBody: string) => {
    const updatedFm = { ...fmRef.current, updated: nowDateStr() }
    fmRef.current = updatedFm
    setFm(updatedFm)
    setBody(newBody)
    onMarkdownChange?.(serializeFrontmatter(updatedFm) + newBody)
  }, [onMarkdownChange])

  const enterRawMode = useCallback(() => {
    setRawValue(serializeFrontmatter(fmRef.current) + bodyRef.current)
    setRawMode(true)
    setMenuAnchorEl(null)
  }, [])

  const exitRawMode = useCallback(() => {
    const { fm: newFm, body: newBody } = parseFrontmatter(rawValue)
    setFm(newFm)
    setBody(newBody)
    setRawMode(false)
    setMenuAnchorEl(null)
  }, [rawValue])

  const handleRawChange = useCallback((value: string) => {
    setRawValue(value)
    onMarkdownChange?.(value)
  }, [onMarkdownChange])

  // ── Écriture initiale du frontmatter sur les nouveaux fichiers ─────────────
  useEffect(() => {
    if (markdown.trim() === '') {
      onMarkdownChange?.(serializeFrontmatter(fmRef.current))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!iconPickerOpen) return
    const handle = (e: MouseEvent) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(e.target as Node)) {
        setIconPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [iconPickerOpen])

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
        icon={fm.icon ? <span className="text-base leading-none">{fm.icon as string}</span> : undefined}
        title={displayTitle}
        author={fm.author as string | undefined}
        saveStatus={saveStatus}
        rawMode={rawMode}
        onShare={onShare}
        onToggleInspector={onToggleInspector}
        onToggleRaw={rawMode ? exitRawMode : enterRawMode}
      />

      <div className="mx-auto max-w-[920px] px-5 py-6 sm:px-8 md:px-10 md:py-9">
        <header className="mb-4">
          {onMobileBack && (
            <button
              onClick={onMobileBack}
              className="lg:hidden mb-3 flex items-center gap-1.5 text-sm text-holo-text-faint transition hover:text-holo-text"
            >
              <ArrowLeft size={15} />
              <span>Retour</span>
            </button>
          )}
          <div className="mb-2 grid grid-cols-[auto_1fr_auto] items-center gap-4">
            <div className="relative" ref={iconPickerRef}>
              <button
                onClick={() => setIconPickerOpen((v) => !v)}
                className="flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-white/[0.04] bg-holo-glass text-holo-text-muted shadow-[0_10px_40px_rgba(0,0,0,.24)] transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                title="Changer l'icône"
                aria-label="Changer l'icône"
              >
                {fm.icon
                  ? <span className="text-base leading-none">{fm.icon as string}</span>
                  : <FileText size={13} />
                }
              </button>

              {iconPickerOpen && (
                <div className="absolute left-0 top-10 z-50 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 shadow-[0_18px_70px_rgba(0,0,0,.5)] backdrop-blur-2xl">
                  {fm.icon && (
                    <div className="flex justify-end px-2 pt-2">
                      <button
                        onClick={() => { handleFmChange({ icon: undefined }); setIconPickerOpen(false) }}
                        className="rounded-holo-sm px-2 py-0.5 text-xs text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
                      >
                        Supprimer
                      </button>
                    </div>
                  )}
                  <EmojiPicker
                    width={320}
                    height={380}
                    theme={EmojiTheme.DARK}
                    skinTonesDisabled
                    previewConfig={{ showPreview: false }}
                    onEmojiClick={(emojiData) => {
                      handleFmChange({ icon: emojiData.emoji })
                      setIconPickerOpen(false)
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex min-w-0 items-center gap-1">
              {breadcrumb.map((seg, i) => (
                <Fragment key={i}>
                  {i > 0 && <span className="shrink-0 select-none text-[11px] text-holo-text-faint/40">›</span>}
                  <span className={cn(
                    'truncate text-[11px]',
                    i === breadcrumb.length - 1
                      ? 'font-medium text-holo-text-muted'
                      : 'text-holo-text-faint',
                  )}>{seg}</span>
                </Fragment>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SaveStatusBadge status={saveStatus} />
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

              <div className="relative">
                <button
                  onClick={(e) => setMenuAnchorEl(e.currentTarget)}
                  className="flex size-10 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                  aria-label="Plus d'actions"
                  title="Plus d'actions"
                >
                  <Ellipsis size={14} />
                </button>

                {menuAnchorEl && (
                  <ContextMenu
                    anchorEl={menuAnchorEl}
                    anchorAlign="right"
                    onClose={() => setMenuAnchorEl(null)}
                    items={[
                      {
                        type: 'item',
                        label: rawMode ? "Retour à l'éditeur" : 'Affichage brut',
                        icon: Code2,
                        onClick: rawMode ? exitRawMode : enterRawMode,
                        ...(rawMode ? {} : {}),
                      },
                    ] satisfies ContextMenuAction[]}
                  />
                )}
              </div>
            </div>
          </div>


        {!rawMode && (
          <>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
            <ReadOnlyMetaField label="Auteur" value={fm.author as string | undefined} />
              <span className="select-none text-holo-text-faint/30">·</span>
              <ReadOnlyMetaField label="Créé" value={relativeTime(fm.created as string | undefined)} title={fm.created as string | undefined} />
              <span className="select-none text-holo-text-faint/30">·</span>
              <ReadOnlyMetaField label="Modifié" value={relativeTime(fm.updated as string | undefined)} title={fm.updated as string | undefined} />
              <span className="select-none text-holo-text-faint/30">·</span>
              <TagsMetaField tags={Array.isArray(fm.tags) ? fm.tags as string[] : []} onChange={(t) => handleFmChange({ tags: t })} />
            </div>

            <div className="flex flex-col gap-2">
              <EditableText
                value={displayTitle}
                onChange={(v) => handleFmChange({ title: v })}
                placeholder="Untitled"
                multiline
                rows={1}
                className="text-[clamp(2.25rem,5vw,4rem)] font-[650] leading-[1.1] tracking-[-0.05em] text-holo-text"
              />

              <EditableText
                value={fm.description as string | undefined}
                onChange={(v) => handleFmChange({ description: v })}
                placeholder="Ajouter une description…"
                multiline
                rows={2}
                className="max-w-[720px] text-[1.02rem] leading-7 text-holo-text-muted"
              />
            </div>
          </>
        )}

        </header>

        {rawMode ? (
          <textarea
            value={rawValue}
            onChange={(e) => handleRawChange(e.target.value)}
            className="mt-2 w-full resize-none rounded-holo-lg border border-holo-border-soft bg-transparent px-1 py-2 font-mono text-sm leading-relaxed text-holo-text-soft outline-none focus:border-holo-primary/30 holo-scrollbar"
            style={{ minHeight: 'calc(100vh - 200px)' }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        ) : (
          <article>
            <BlockEditor markdown={body} onChange={handleBodyChange} fontScale={contentFontScale} />
          </article>
        )}
      </div>
    </section>
  )
  
}
