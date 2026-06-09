import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleCheck, ExternalLink, Image, Info, Link2 } from 'lucide-react'
import { cn } from '../utils/global'
import { useConfig } from '../contexts/ConfigContext'
import { ActivityCard } from './Activity'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugifyFragment(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '') || 'section'
}

function extractHeadings(markdown: string): { level: number; text: string; domId: string; number: string }[] {
  const slugCounts = new Map<string, number>()
  const levelCounters: Record<number, number> = {}

  return markdown
    .split('\n')
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (!m) return null;
      const text = m[2].replace(/[*_`[\]!]/g, '').trim()
      const level = m[1].length

      levelCounters[level] = (levelCounters[level] ?? 0) + 1
      Object.keys(levelCounters).forEach((key) => {
        if (Number(key) > level) delete levelCounters[Number(key)]
      })

      const visibleLevels = Object.keys(levelCounters).map(Number).sort((left, right) => left - right)
      const number = visibleLevels.filter((currentLevel) => currentLevel <= level).map((currentLevel) => levelCounters[currentLevel]).join('.')

      const slug = slugifyFragment(text)
      const occurrence = (slugCounts.get(slug) ?? 0) + 1
      slugCounts.set(slug, occurrence)

      return {
        level,
        text,
        domId: `heading-${slug}${occurrence > 1 ? `-${occurrence}` : ''}`,
        number,
      }
    })
    .filter(Boolean) as { level: number; text: string; domId: string; number: string }[]
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null
  while (current) {
    const style = window.getComputedStyle(current)
    const isScrollable = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight
    if (isScrollable) return current
    current = current.parentElement
  }
  return null
}

function scrollHeadingWithOffset(target: HTMLElement, offset = 64) {
  const scrollParent = findScrollParent(target)
  if (!scrollParent) {
    const top = window.scrollY + target.getBoundingClientRect().top - offset
    window.scrollTo({ top, behavior: 'smooth' })
    return
  }

  const targetRect = target.getBoundingClientRect()
  const parentRect = scrollParent.getBoundingClientRect()
  const top = scrollParent.scrollTop + targetRect.top - parentRect.top - offset
  scrollParent.scrollTo({ top, behavior: 'smooth' })
}

function getFootnoteDomId(label: string): string {
  return `footnote-${slugifyFragment(label)}`
}

function extractFootnotes(markdown: string): { label: string; content: string; domId: string }[] {
  const footnotes: { label: string; content: string; domId: string }[] = []
  // Matches: [^label]: content (single-line)
  const regex = /^\[\^([^\]]+)\]:\s*(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = regex.exec(markdown)) !== null) {
    footnotes.push({ label: m[1], content: m[2].trim(), domId: getFootnoteDomId(m[1]) })
  }
  return footnotes
}

type InspectorLinkItem = {
  kind: 'link' | 'image'
  text: string
  url: string
}

type InspectorActivity = {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  timestamp: string
  subject: string
  added: number
  deleted: number
  additionsPreview: string[]
  deletionsPreview: string[]
  commitUrl: string | null
}

function parseMarkdownDestination(rawDestination: string): string {
  const trimmed = rawDestination.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('<')) {
    const closingIndex = trimmed.indexOf('>')
    if (closingIndex > 0) {
      return trimmed.slice(1, closingIndex).trim()
    }
  }

  let result = ''
  let escaped = false
  for (const character of trimmed) {
    if (escaped) {
      result += character
      escaped = false
      continue
    }

    if (character === '\\') {
      escaped = true
      continue
    }

    if (/\s/.test(character)) break
    result += character
  }

  return result.trim()
}

function extractLinks(markdown: string): InspectorLinkItem[] {
  const links: InspectorLinkItem[] = []
  const seen = new Set<string>()

  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const text = (match[1] || 'Image').trim() || 'Image'
    const url = parseMarkdownDestination(match[2] || '')
    const key = `image:${text}:${url}`
    if (url && !seen.has(key)) {
      seen.add(key)
      links.push({ kind: 'image', text, url })
    }
  }

  for (const match of markdown.matchAll(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g)) {
    const text = (match[1] || '').trim() || 'Lien'
    const url = parseMarkdownDestination(match[2] || '')
    const key = `link:${text}:${url}`
    if (url && !seen.has(key)) {
      seen.add(key)
      links.push({ kind: 'link', text, url })
    }
  }
  return links
}


function resolveInspectorPath(href: string, currentFilePath?: string, rootPath?: string): string | null {
  const trimmedHref = href.trim()
  if (!trimmedHref || trimmedHref.startsWith('#')) return null

  const cleanHref = trimmedHref.split('#')[0]?.split('?')[0]?.trim() ?? ''
  if (!cleanHref) return null

  if (cleanHref.startsWith('/')) {
    if (!rootPath) return null
    const relative = cleanHref.replace(/^\/+/, '')
    const root = rootPath.replace(/\\/g, '/')
    return `${root}${root.endsWith('/') ? '' : '/'}${relative}`
  }

  if (!currentFilePath) return null

  const normalizedCurrentFilePath = currentFilePath.replace(/\\/g, '/')
  const baseParts = normalizedCurrentFilePath.split('/').slice(0, -1).filter(Boolean)
  const hrefParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean)
  const resolvedParts = [...baseParts]

  for (const part of hrefParts) {
    if (part === '.') continue
    if (part === '..') {
      if (resolvedParts.length > 0) resolvedParts.pop()
      continue
    }
    resolvedParts.push(part)
  }

  return `${normalizedCurrentFilePath.startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`
}

function toProjectRelativeImagePath(targetPath: string, rootPath?: string): string | null {
  if (!rootPath) return null

  const normalizedTargetPath = targetPath.replace(/\\/g, '/')
  const normalizedRootPath = rootPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (normalizedTargetPath === normalizedRootPath) return ''
  if (!normalizedTargetPath.startsWith(`${normalizedRootPath}/`)) return null

  return normalizedTargetPath.slice(normalizedRootPath.length + 1)
}

function isExternalUrl(url: string): boolean {
  return /^(https?:|mailto:|holo:)/i.test(url)
}

function isImageLikePath(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(url)
}


// ─── UI helpers ──────────────────────────────────────────────────────────────

function InspectorTabs({
  tab,
  counts,
  onChange,
}: {
  tab: Tab
  counts: Record<Tab, number>
  onChange: (tab: Tab) => void
}) {
  const items: Array<{ id: Tab; label: string }> = [
    { id: 'toc', label: 'Plan' },
    { id: 'links', label: 'Liens' },
    { id: 'notes', label: 'Notes' },
  ]

  return (
    <div className="rounded-holo-xl border border-holo-border-soft bg-holo-glass p-1 shadow-[inset_0_1px_0_rgba(255,255,255,.025)]">
      <div className="grid grid-cols-3 gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-holo-lg px-2 py-2 text-sm transition active:scale-[0.98]',
              tab === item.id
                ? 'bg-holo-primary-surface text-holo-primary-soft shadow-[0_8px_24px_rgba(0,0,0,.18)] ring-1 ring-holo-primary/15'
                : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
            )}
          >
            <span className="truncate">{item.label}</span>
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] leading-none',
                tab === item.id ? 'bg-holo-primary/15 text-holo-primary-soft' : 'bg-white/[0.035] text-holo-text-faint',
              )}
            >
              {counts[item.id]}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function InspectorSection({
  title,
  action,
  children,
  className,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'min-h-0 overflow-hidden rounded-holo-2xl border border-holo-border-soft bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,.025)]',
        className,
      )}
    >
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/70 px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-holo-text-faint">{title}</span>
          {action}
        </div>
      )}

      <div className="holo-scrollbar h-full min-h-0 overflow-y-auto p-3">{children}</div>
    </section>
  )
}

function EmptyState({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: ReactNode
}) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center px-4 py-8 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-holo-xl border border-holo-border-soft bg-holo-glass text-holo-text-faint">
        {icon ?? <Info size={16} />}
      </div>
      <p className="text-sm font-medium text-holo-text">{title}</p>
      <p className="mt-1 max-w-[220px] text-xs leading-5 text-holo-text-faint">{description}</p>
    </div>
  )
}


// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'toc' | 'links' | 'notes'

interface InspectorProps {
  markdown?: string
  filePath?: string
  rootPath?: string
  onOpenLinkedFile?: (filePath: string) => Promise<void> | void
}

export function Inspector({ markdown, filePath, rootPath, onOpenLinkedFile }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('toc')
  const [activities, setActivities] = useState<InspectorActivity[]>([])
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null)
  const [loadedImageSrcByPath, setLoadedImageSrcByPath] = useState<Record<string, string>>({})
  const { gitState } = useConfig()

  const headings = useMemo(() => (markdown ? extractHeadings(markdown) : []), [markdown])
  const links = useMemo(() => (markdown ? extractLinks(markdown) : []), [markdown])
  const footnotes = useMemo(() => (markdown ? extractFootnotes(markdown) : []), [markdown])

  const openHeading = useCallback((domId: string) => {
    const el = document.getElementById(domId)
    if (el) scrollHeadingWithOffset(el, 64)
  }, [])

  const handleLinkClick = useCallback(async (item: InspectorLinkItem) => {
    if (isExternalUrl(item.url)) {
      await window.holo?.openExternalUrl(item.url)
      return
    }

    const resolvedPath = resolveInspectorPath(item.url, filePath, rootPath)
    if (!resolvedPath) return

    if (item.kind === 'image' || isImageLikePath(resolvedPath)) {
      const cachedSrc = loadedImageSrcByPath[resolvedPath]
      if (cachedSrc) {
        setPreviewImage({ src: cachedSrc, alt: item.text })
        return
      }

      const relativeImagePath = toProjectRelativeImagePath(resolvedPath, rootPath)
      if (!relativeImagePath) return

      const result = await window.holo?.loadImage(relativeImagePath).catch(() => null)
      if (result?.ok) {
        setLoadedImageSrcByPath((current) => ({ ...current, [resolvedPath]: result.dataUrl }))
        setPreviewImage({ src: result.dataUrl, alt: item.text })
      }
      return
    }

    if (resolvedPath.toLowerCase().endsWith('.md')) {
      await onOpenLinkedFile?.(resolvedPath)
    }
  }, [filePath, loadedImageSrcByPath, onOpenLinkedFile, rootPath])

  const handleActivityClick = useCallback(async (activity: InspectorActivity) => {
    if (!activity.commitUrl) return
    await window.holo?.openExternalUrl(activity.commitUrl)
  }, [])

  const handleFootnoteClick = useCallback((domId: string) => {
    const el = document.getElementById(domId)
    if (el) scrollHeadingWithOffset(el, 64)
  }, [])

  const loadActivities = useCallback(async (targetPath: string) => {
    try {
      const result = await window.holo?.gitGetFileActivity(targetPath, 10)
      setActivities(result ?? [])
    } catch {
      setActivities([])
    }
  }, [])

  useEffect(() => {
    if (!filePath || !gitState.isRepo) {
      setActivities([])
      return
    }

    void loadActivities(filePath)

    const handleActivityRefresh = (event: Event) => {
      const path = (event as CustomEvent<{ path?: string }>).detail?.path
      if (!path || path !== filePath) return
      void loadActivities(filePath)
    }

    window.addEventListener('holo:file-activity-updated', handleActivityRefresh)
    return () => window.removeEventListener('holo:file-activity-updated', handleActivityRefresh)
  }, [filePath, gitState.isRepo, loadActivities])

  useEffect(() => {
    const localImageEntries = links
      .filter((item) => item.kind === 'image' && !isExternalUrl(item.url))
      .map((item) => {
        const resolvedPath = resolveInspectorPath(item.url, filePath, rootPath)
        const relativeImagePath = resolvedPath ? toProjectRelativeImagePath(resolvedPath, rootPath) : null
        return resolvedPath && relativeImagePath ? { resolvedPath, relativeImagePath } : null
      })
      .filter((entry): entry is { resolvedPath: string; relativeImagePath: string } => entry !== null)

    if (localImageEntries.length === 0) return

    let cancelled = false

    const loadInspectorImages = async () => {
      for (const entry of localImageEntries) {
        if (loadedImageSrcByPath[entry.resolvedPath]) continue

        try {
          const result = await window.holo?.loadImage(entry.relativeImagePath)
          if (!cancelled && result?.ok) {
            setLoadedImageSrcByPath((current) => {
              if (current[entry.resolvedPath]) return current
              return { ...current, [entry.resolvedPath]: result.dataUrl }
            })
          }
        } catch {
          // Ignore and keep the icon fallback in the inspector.
        }
      }
    }

    void loadInspectorImages()

    return () => {
      cancelled = true
    }
  }, [filePath, links, loadedImageSrcByPath, rootPath])

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-holo-border-soft bg-holo-bg/25 p-4">
      <InspectorTabs
        tab={tab}
        counts={{ toc: headings.length, links: links.length, notes: footnotes.length }}
        onChange={setTab}
      />

      <div className="mt-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4">
        <InspectorSection>
          {tab === 'toc' && (
            headings.length === 0 ? (
              <EmptyState
                title="Aucun titre"
                description={markdown ? 'Ajoute des titres pour construire le plan.' : 'Ouvre un fichier pour afficher la table des matières.'}
              />
            ) : (
              <ol className="space-y-0.5 text-sm">
                {headings.map((heading) => (
                  <li key={heading.domId}>
                    <button
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-holo-lg py-2 pr-2 text-left transition hover:bg-holo-glass-hover',
                        heading.level <= 2 ? 'text-holo-text' : 'text-holo-text-muted',
                      )}
                      onClick={() => openHeading(heading.domId)}
                      title={heading.text}
                      style={{ paddingLeft: `${0.55 + (heading.level - 1) * 0.72}rem` }}
                    >
                      <span className="shrink-0 rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-holo-text-faint">
                        {heading.number}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{heading.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )
          )}

          {tab === 'links' && (
            links.length === 0 ? (
              <EmptyState
                title="Aucun lien"
                description={markdown ? 'Les liens et images du document apparaîtront ici.' : 'Ouvre un fichier pour afficher les liens.'}
                icon={<Link2 size={16} />}
              />
            ) : (
              <div className="space-y-2.5">
                {links.map((item, index) => {
                  const external = isExternalUrl(item.url)
                  const resolvedPath = external ? null : resolveInspectorPath(item.url, filePath, rootPath)
                  const loadedLocalSrc = resolvedPath ? loadedImageSrcByPath[resolvedPath] : null
                  const previewSrc = item.kind === 'image' ? (external ? item.url : loadedLocalSrc) : null
                  const Icon = item.kind === 'image' ? Image : external ? ExternalLink : Link2

                  return (
                    <button
                      key={`${item.kind}:${item.url}:${index}`}
                      type="button"
                      onClick={() => { void handleLinkClick(item) }}
                      className="group flex w-full items-start gap-3 rounded-holo-2xl border border-holo-border-soft bg-holo-glass/35 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-holo-primary/25 hover:bg-holo-glass-hover active:scale-[0.995]"
                    >
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={item.text}
                          className="mt-0.5 size-14 shrink-0 rounded-holo-xl border border-holo-border-soft object-cover"
                        />
                      ) : (
                        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-holo-xl bg-holo-primary-surface text-holo-primary-soft">
                          <Icon size={16} />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-holo-text">{item.text}</span>
                          <span className="shrink-0 rounded-full border border-holo-border-soft bg-white/[0.025] px-2 py-0.5 text-[10px] uppercase tracking-wide text-holo-text-faint">
                            {item.kind === 'image' ? 'Image' : external ? 'Externe' : 'Relatif'}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-holo-text-faint">{item.url}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          )}

          {tab === 'notes' && (
            footnotes.length === 0 ? (
              <EmptyState
                title="Aucune note"
                description={markdown ? 'Les footnotes du fichier apparaîtront ici.' : 'Ouvre un fichier pour afficher les notes.'}
                icon={<Info size={16} />}
              />
            ) : (
              <ol className="space-y-2.5 text-sm text-holo-text-muted">
                {footnotes.map((footnote) => {
                  return (
                    <li key={footnote.domId}>
                      <button
                        type="button"
                        onClick={() => handleFootnoteClick(footnote.domId)}
                        className="w-full rounded-holo-2xl border border-holo-border-soft bg-white/[0.02] px-3.5 py-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-holo-primary/30 hover:bg-holo-primary/[0.06] active:scale-[0.995]"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-holo-primary/30 bg-holo-primary/10 px-1.5 text-[10px] font-semibold leading-none text-holo-primary-soft">{footnote.label}</span>
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-holo-text-faint">Note</span>
                        </div>
                        <p className="text-sm leading-relaxed text-holo-text-muted">{footnote.content}</p>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )
          )}
        </InspectorSection>

        <InspectorSection
          title="Activité"
          action={
            activities.length > 0 ? (
              <span className="rounded-full bg-white/[0.035] px-2 py-0.5 text-[10px] text-holo-text-faint">
                {activities.length}
              </span>
            ) : undefined
          }
          className="max-h-[42vh]"
        >
          {activities.length === 0 ? (
            <EmptyState
              title={gitState.isRepo ? 'Aucune activité' : 'Dossier non versionné'}
              description={gitState.isRepo ? 'Aucune activité Git détaillée pour ce fichier.' : 'Initialise Git pour afficher l’historique.'}
              icon={<CircleCheck size={16} />}
            />
          ) : (
            <div className="space-y-2.5">
              {activities.slice(0, 6).map((activity) => (
                <ActivityCard
                  key={activity.hash}
                  activity={activity}
                  onClick={activity.commitUrl ? () => { void handleActivityClick(activity) } : undefined}
                />
              ))}
            </div>
          )}
        </InspectorSection>
      </div>

      {previewImage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-6 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div className="max-h-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <img
              src={previewImage.src}
              alt={previewImage.alt}
              className="max-h-[85vh] max-w-full rounded-holo-2xl border border-holo-border-soft bg-holo-bg-elevated object-contain shadow-holo-md"
            />
          </div>
        </div>
      )}
    </aside>
  )
}
