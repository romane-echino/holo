import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Archive, ArchiveRestore, Check, Code2, Ellipsis, ExternalLink, FileText, PanelRight, Save, Star } from 'lucide-react'
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react'
import { cn } from '../utils/global'
import { BlockEditor, type BlockEditorHandle } from './MarkdownEditor/BlockEditor'
import { useConfig } from '../contexts/ConfigContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { ContextMenu } from '../components/ContextMenu'
import type { ContextMenuAction } from '../components/ContextMenu'
import { MergeConflictDiffModal } from './MergeConflictDiffModal'

type EditorFrameProps = {
  filepath: string
  markdown?: string
  onMarkdownChange?: (value: string) => void
  onIconClick?: () => void
  onToggleInspector?: () => void
  onShare?: () => void
  onMore?: () => void
  saveStatus?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'synced' | 'push-error' | 'error'
  saveErrorMsg?: string
  onMobileBack?: () => void
  contentFontScale?: number
  isFavorite?: boolean
  onToggleFavorite?: () => void
  onArchive?: () => void
  onRestore?: () => void
}

function filenameFromPath(filepath: string) {
  const normalized = filepath.replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).at(-1) ?? filepath
}

function buildBreadcrumb(filepath: string, rootPath?: string): { label: string; path: string; isDir: boolean }[] {
  const normalized = filepath.replace(/\\/g, '/')
  if (!rootPath) return [{ label: normalized.split('/').filter(Boolean).at(-1) ?? filepath, path: filepath, isDir: false }]
  const root = rootPath.replace(/\\/g, '/').replace(/\/$/, '')
  const spaceName = root.split('/').filter(Boolean).at(-1) ?? 'Espace'
  if (!normalized.startsWith(root)) return [{ label: normalized.split('/').filter(Boolean).at(-1) ?? filepath, path: filepath, isDir: false }]
  const relative = normalized.slice(root.length).replace(/^\//, '')
  const parts = relative.split('/').filter(Boolean)
  const segments: { label: string; path: string; isDir: boolean }[] = [{ label: spaceName, path: root, isDir: true }]
  let accumulated = root
  for (let i = 0; i < parts.length; i++) {
    accumulated += '/' + parts[i]
    const isLast = i === parts.length - 1
    segments.push({ label: isLast ? parts[i].replace(/\.md$/, '') : parts[i], path: accumulated, isDir: !isLast })
  }
  return segments
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

// ─── Couleurs de tags ──────────────────────────────────────────────────────────

const TAG_PALETTE = [
  { bg: 'rgba(123, 97, 255, 0.15)', text: 'rgba(180, 160, 255, 0.95)', border: 'rgba(123, 97, 255, 0.3)' }, // violet
  { bg: 'rgba(59, 130, 246, 0.15)', text: 'rgba(147, 197, 253, 0.95)', border: 'rgba(59, 130, 246, 0.3)' }, // blue
  { bg: 'rgba(6, 182, 212, 0.15)',  text: 'rgba(103, 232, 249, 0.95)', border: 'rgba(6, 182, 212, 0.3)' },  // cyan
  { bg: 'rgba(16, 185, 129, 0.15)', text: 'rgba(110, 231, 183, 0.95)', border: 'rgba(16, 185, 129, 0.3)' }, // teal
  { bg: 'rgba(245, 158, 11, 0.15)', text: 'rgba(253, 211, 77, 0.95)',  border: 'rgba(245, 158, 11, 0.3)' }, // amber
  { bg: 'rgba(249, 115, 22, 0.15)', text: 'rgba(253, 186, 116, 0.95)', border: 'rgba(249, 115, 22, 0.3)' }, // orange
  { bg: 'rgba(236, 72, 153, 0.15)', text: 'rgba(249, 168, 212, 0.95)', border: 'rgba(236, 72, 153, 0.3)' }, // pink
  { bg: 'rgba(239, 68, 68, 0.15)',  text: 'rgba(252, 165, 165, 0.95)', border: 'rgba(239, 68, 68, 0.3)' },  // red
] as const

function tagColor(tag: string) {
  const key = tag.slice(0, 2).toLowerCase()
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff
  return TAG_PALETTE[h % TAG_PALETTE.length]
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
            {tags.map((t) => {
              const c = tagColor(t)
              return (
                <span
                  key={t}
                  style={{ background: c.bg, color: c.text, borderColor: c.border }}
                  className="rounded-full border px-1.5 py-px text-[10px]"
                >
                  {t}
                </span>
              )
            })}
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
  saveErrorMsg,
  rawMode,
  isFavorite,
  onShare,
  onToggleFavorite,
  onToggleInspector,
  onToggleRaw,
}: {
  visible: boolean
  icon?: React.ReactNode
  title: string
  author?: string
  saveStatus?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'synced' | 'push-error' | 'error'
  saveErrorMsg?: string
  rawMode: boolean
  isFavorite?: boolean
  onShare?: () => void
  onToggleFavorite?: () => void
  onToggleInspector?: () => void
  onToggleRaw: () => void
}) {
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  const handleShareClick = useCallback(() => {
    onShare?.()
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [onShare])

  return (
    <div
      className={cn(
        'sticky top-0 z-30 border-b border-holo-border-soft bg-holo-bg/10 px-5 py-3 backdrop-blur-lg transition-all duration-200',
        visible ? 'opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
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
          <SaveStatusBadge status={saveStatus} errorMsg={saveErrorMsg} />

          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className={cn(
                'flex size-9 items-center justify-center rounded-holo-md border transition active:scale-[0.98]',
                isFavorite
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                  : 'border-holo-border-soft bg-holo-glass text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
              )}
              title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            >
              <Star size={14} className={isFavorite ? 'fill-amber-400' : ''} />
            </button>
          )}

          <button
            onClick={onToggleInspector}
            className="3xl:hidden flex size-9 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
            title="Inspecteur"
            aria-label="Inspecteur"
          >
            <PanelRight size={14} />
          </button>

          <button
            onClick={handleShareClick}
            className={cn(
              'flex h-9 items-center justify-center gap-1.5 rounded-holo-md px-3 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.18)] transition active:scale-[0.98]',
              shareCopied ? 'bg-holo-success' : 'bg-holo-primary hover:bg-holo-primary/90',
            )}
            title={shareCopied ? 'Lien copié !' : 'Copier le lien de partage'}
            aria-label="Lien de partage"
          >
            {shareCopied ? <Check size={14} /> : <ExternalLink size={14} />}
            <span className="text-xs">{shareCopied ? 'Copié !' : 'Partager'}</span>
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

            {menuAnchorEl && createPortal(
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
              />,
              document.body
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

function SaveStatusBadge({ status, errorMsg }: {
  status?: 'idle' | 'unsaved' | 'saving' | 'saved' | 'synced' | 'push-error' | 'error'
  errorMsg?: string
}) {
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
    <span className="flex items-center gap-1.5 text-xs text-amber-400/80">
      <Save size={10} className="shrink-0" />
      Enregistré localement
    </span>
  )
  if (status === 'synced') return (
    <span className="flex items-center gap-1.5 text-xs text-holo-success">
      <Check size={10} className="shrink-0" />
      Synchronisé
    </span>
  )
  if (status === 'push-error') return (
    <span className="flex items-center gap-1.5 text-xs text-amber-400" title={errorMsg ?? 'Erreur lors du push'}>
      <Save size={10} className="shrink-0" />
      <span>Commit local · push échoué</span>
    </span>
  )
  if (status === 'error') return (
    <span className="text-xs text-holo-danger" title={errorMsg}>{errorMsg ? 'Erreur : ' + errorMsg.slice(0, 60) : "Erreur d'enregistrement"}</span>
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
  saveErrorMsg,
  onMobileBack,
  contentFontScale,
  isFavorite,
  onToggleFavorite,
  onArchive,
  onRestore,
}: EditorFrameProps) {
  const [showStickyHeader, setShowStickyHeader] = useState(false)
  const [rawMode, setRawMode] = useState(false)
  const [rawValue, setRawValue] = useState('')
  const rawTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const handleShareClick = useCallback(() => {
    onShare?.()
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }, [onShare])

  // Auto-resize the raw textarea so it never shows its own scrollbar
  useEffect(() => {
    const ta = rawTextareaRef.current
    if (!rawMode || !ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [rawMode, rawValue])
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)
  const iconPickerRef = useRef<HTMLDivElement>(null)
  const blockEditorRef = useRef<BlockEditorHandle>(null)

  const { rootPath } = useWorkspace()
  const {
    appAuthor,
    gitState,
    repoImageStorageMode,
    azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey, s3Endpoint, s3PublicBaseUrl,
    dropboxAccessToken, dropboxFolderPath,
    gdriveAccessToken, gdriveFolderId,
  } = useConfig()

  const [diffModalOpen, setDiffModalOpen] = useState(false)
  const isConflicted = (gitState?.conflictedFiles ?? []).includes(filepath)
  const filename = filenameFromPath(filepath)
  const breadcrumb = buildBreadcrumb(filepath, rootPath ?? undefined)

  const toggleFavorite = useCallback(() => {
    onToggleFavorite?.()
  }, [onToggleFavorite])

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
    // Notifie le parent pour rester en sync (évite désynchronisation si BlockEditor émet une version dégradée)
    onMarkdownChange?.(rawValue)
  }, [rawValue, onMarkdownChange])

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

  // ── Drag & drop d'images ──────────────────────────────────────────────────
  const buildImageStorageOptions = useCallback(() => {
    if (!window.holo) return null
    const opts: Parameters<typeof window.holo.saveImage>[2] = {
      mode: repoImageStorageMode as 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive',
    }
    if (repoImageStorageMode === 'azure') {
      opts.azure = { containerUrl: azureBlobContainerUrl, sasToken: azureBlobSasToken }
    } else if (repoImageStorageMode === 's3') {
      opts.s3 = { region: s3Region, bucket: s3Bucket, accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey, endpoint: s3Endpoint || undefined, publicBaseUrl: s3PublicBaseUrl || undefined }
    } else if (repoImageStorageMode === 'dropbox') {
      opts.dropbox = { accessToken: dropboxAccessToken, folderPath: dropboxFolderPath || undefined }
    } else if (repoImageStorageMode === 'gdrive') {
      opts.gdrive = { accessToken: gdriveAccessToken, folderId: gdriveFolderId || undefined }
    }
    return opts
  }, [repoImageStorageMode, azureBlobContainerUrl, azureBlobSasToken, s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey, s3Endpoint, s3PublicBaseUrl, dropboxAccessToken, dropboxFolderPath, gdriveAccessToken, gdriveFolderId])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const hasImage = Array.from(e.dataTransfer.items).some((item) => item.type.startsWith('image/'))
    if (!hasImage) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!sectionRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const opts = buildImageStorageOptions()
    if (!opts) return
    for (const file of files) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        const base64 = dataUrl.split(',')[1]
        const result = await window.holo!.saveImage(file.name, base64, opts)
        const alt = file.name.replace(/\.[^.]+$/, '')
        blockEditorRef.current?.insertImage(result.relativePath, alt)
      } catch (err) {
        console.error('[EditorFrame] drop image error', err)
      }
    }
  }, [buildImageStorageOptions])

  return (
    <section
      ref={sectionRef}
      className="relative min-h-full"
      data-editor
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-holo-lg border-2 border-dashed border-holo-primary/60 bg-holo-primary-surface/30 backdrop-blur-sm">
          <span className="rounded-holo-lg bg-holo-bg/80 px-4 py-2 text-sm font-medium text-holo-primary-soft shadow">
            Déposer pour insérer l'image
          </span>
        </div>
      )}
      <StickyEditorHeader
        visible={showStickyHeader}
        icon={fm.icon ? <span className="text-base leading-none">{fm.icon as string}</span> : undefined}
        title={displayTitle}
        author={fm.author as string | undefined}
        saveStatus={saveStatus}
        saveErrorMsg={saveErrorMsg}
        rawMode={rawMode}
        isFavorite={isFavorite}
        onShare={onShare}
        onToggleFavorite={onToggleFavorite}
        onToggleInspector={onToggleInspector}
        onToggleRaw={rawMode ? exitRawMode : enterRawMode}
      />

      <div className="mx-auto max-w-[920px] pl-8 pr-5 py-6 sm:px-8 md:px-10 md:py-9">
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
                  {seg.isDir ? (
                    <button
                      className="truncate text-[11px] text-holo-text-faint transition hover:text-holo-text-muted"
                      title={`Voir dans l'arborescence`}
                      onClick={() => window.dispatchEvent(new CustomEvent('holo:reveal-in-tree', { detail: { path: seg.path } }))}
                    >{seg.label}</button>
                  ) : (
                    <span className="truncate text-[11px] font-medium text-holo-text-muted">{seg.label}</span>
                  )}
                </Fragment>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SaveStatusBadge status={saveStatus} errorMsg={saveErrorMsg} />

              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-holo-md border transition active:scale-[0.98]',
                    isFavorite
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                      : 'border-holo-border-soft bg-holo-glass text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                  )}
                  title={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                >
                  <Star size={14} className={isFavorite ? 'fill-amber-400' : ''} />
                </button>
              )}
              <button
                onClick={onToggleInspector}
                className="3xl:hidden flex size-10 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                title="Inspecteur"
                aria-label="Inspecteur"
              >
                <PanelRight size={14} />
              </button>

              <button
                onClick={handleShareClick}
                className={cn(
                  'flex size-10 items-center justify-center rounded-holo-md py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition active:scale-[0.98]',
                  shareCopied ? 'bg-holo-success' : 'bg-holo-primary hover:bg-holo-primary/90',
                )}
                title={shareCopied ? 'Lien copié !' : 'Copier le lien de partage'}
                aria-label="Lien de partage"
              >
                {shareCopied ? <Check size={14} /> : <ExternalLink size={14} />}
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

                {menuAnchorEl && createPortal(
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
                      },
                      {
                        type: 'item',
                        label: isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris',
                        icon: Star,
                        onClick: () => { toggleFavorite(); setMenuAnchorEl(null) },
                      },
                      ...(onArchive ? [{
                        type: 'item' as const,
                        label: 'Archiver',
                        icon: Archive,
                        onClick: () => { onArchive(); setMenuAnchorEl(null) },
                      }] : []),
                      ...(onRestore ? [{
                        type: 'item' as const,
                        label: 'Sortir des archives',
                        icon: ArchiveRestore,
                        onClick: () => { onRestore(); setMenuAnchorEl(null) },
                      }] : []),
                    ] satisfies ContextMenuAction[]}
                  />,
                  document.body
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
            ref={rawTextareaRef}
            value={rawValue}
            onChange={(e) => handleRawChange(e.target.value)}
            className="mt-2 w-full resize-none rounded-holo-lg border border-holo-border-soft bg-transparent px-1 py-2 font-mono text-sm leading-relaxed text-holo-text-soft outline-none focus:border-holo-primary/30"
            style={{ minHeight: '200px', overflowY: 'hidden' }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
          />
        ) : (
          <article>
            {isConflicted && (
              <div className="mb-4 flex items-center gap-3 rounded-holo-xl border border-amber-600/30 bg-amber-500/10 px-4 py-3">
                <span className="text-amber-400 text-sm">⚠️</span>
                <p className="flex-1 text-sm text-amber-200">Ce fichier contient des conflits de fusion non résolus.</p>
                <button
                  onClick={() => setDiffModalOpen(true)}
                  className="rounded-holo-lg border border-amber-600/40 bg-amber-900/30 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-800/40"
                >
                  Résoudre le conflit
                </button>
              </div>
            )}
            <BlockEditor ref={blockEditorRef} markdown={body} onChange={handleBodyChange} fontScale={contentFontScale} />
          </article>
        )}
      </div>

      {diffModalOpen && (
        <MergeConflictDiffModal
          filePath={filepath}
          onResolve={async (strategy) => {
            await window.holo?.gitResolveConflict(filepath, strategy)
          }}
          onDismiss={() => setDiffModalOpen(false)}
        />
      )}
    </section>
  )
}
