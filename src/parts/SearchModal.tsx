/**
 * SearchModal.tsx — Palette de recherche globale (style commandes)
 *
 * Apparaît au centre de l'écran via Ctrl+K ou le bouton sidebar.
 * Navigation clavier : ↑/↓ pour naviguer, Entrée pour ouvrir, Échap pour fermer.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, File, Archive } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getBaseName } from '../lib/appUtils'
import { cn } from '../utils/global'
import type { SearchIndexEntry } from '../types/app'

type SearchMatch = {
  path: string
  title: string
  subtitle: string
  spaceName?: string
  matchKind: 'filename' | 'title' | 'tag' | 'description' | 'heading' | 'content'
  matchText?: string
  icon?: string
  tags?: string[]
}

const TAG_PALETTE = [
  { bg: 'rgba(99, 102, 241, 0.15)', text: 'rgba(199, 210, 254, 0.95)', border: 'rgba(99, 102, 241, 0.3)' },
  { bg: 'rgba(6, 182, 212, 0.15)', text: 'rgba(103, 232, 249, 0.95)', border: 'rgba(6, 182, 212, 0.3)' },
  { bg: 'rgba(16, 185, 129, 0.15)', text: 'rgba(110, 231, 183, 0.95)', border: 'rgba(16, 185, 129, 0.3)' },
  { bg: 'rgba(245, 158, 11, 0.15)', text: 'rgba(253, 211, 77, 0.95)', border: 'rgba(245, 158, 11, 0.3)' },
  { bg: 'rgba(249, 115, 22, 0.15)', text: 'rgba(253, 186, 116, 0.95)', border: 'rgba(249, 115, 22, 0.3)' },
  { bg: 'rgba(236, 72, 153, 0.15)', text: 'rgba(249, 168, 212, 0.95)', border: 'rgba(236, 72, 153, 0.3)' },
  { bg: 'rgba(239, 68, 68, 0.15)', text: 'rgba(252, 165, 165, 0.95)', border: 'rgba(239, 68, 68, 0.3)' },
] as const

function tagColor(tag: string) {
  const key = tag.slice(0, 2).toLowerCase()
  let hash = 0
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) & 0xffff
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

function TagChip({ tag }: { tag: string }) {
  const color = tagColor(tag)

  return (
    <span
      style={{ background: color.bg, color: color.text, borderColor: color.border }}
      className="rounded-full border px-1.5 py-px text-[9px] font-medium"
    >
      #{tag}
    </span>
  )
}

function MatchBadge({ kind }: { kind: SearchMatch['matchKind'] }) {
  const labels: Record<SearchMatch['matchKind'], string> = {
    filename: 'fichier',
    title: 'titre',
    tag: 'tag',
    description: 'description',
    heading: 'titre',
    content: 'contenu',
  }
  const colors: Record<SearchMatch['matchKind'], string> = {
    filename: 'bg-blue-500/15 text-blue-300',
    title: 'bg-holo-primary/15 text-holo-primary-soft',
    tag: 'bg-emerald-500/15 text-emerald-300',
    description: 'bg-amber-500/15 text-amber-300',
    heading: 'bg-holo-primary/15 text-holo-primary-soft',
    content: 'bg-zinc-500/15 text-zinc-400',
  }
  return (
    <span className={cn('shrink-0 rounded-full px-1.5 py-px text-[9px] font-medium leading-none', colors[kind])}>
      {labels[kind]}
    </span>
  )
}

type SearchModalProps = {
  open: boolean
  onClose: () => void
  onSelectFile?: (path: string) => void
  indexedEntries?: Map<string, SearchIndexEntry>
  isIndexBuilding?: boolean
  indexBuildProgress?: { processed: number, total: number }
}

export function SearchModal({ open, onClose, onSelectFile, indexedEntries, isIndexBuilding = false, indexBuildProgress }: SearchModalProps) {
  const { rootPath, recentFolders } = useWorkspace()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [archivedPaths, setArchivedPaths] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Charger les fichiers archivés à l'ouverture
  useEffect(() => {
    if (!open) return
    window.holo?.listArchivedFiles().then(files => {
      setArchivedPaths(files.map(f => f.archivedPath))
    }).catch(() => {})
  }, [open])

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  const results = useMemo((): SearchMatch[] => {
    const q = query.trim().toLowerCase()
    if (!q || q.length < 2) return []

    const isTagSearch = q.startsWith('#')
    const tagQuery = isTagSearch ? q.slice(1) : null
    const matches: SearchMatch[] = []
    const liveEntries = indexedEntries ? Array.from(indexedEntries.values()) : []

    for (const entry of liveEntries) {
      const path = entry.path
      const basename = getBaseName(path)
      const filenameNoExt = basename.replace(/\.md$/i, '')
      const title = entry.title || filenameNoExt
      const description = entry.description || ''
      const tags = entry.tags ?? []

      const spaceFolder = entry.spaceRoot || recentFolders.find(f => path.startsWith(f + '/'))
      const spaceName = spaceFolder ? getBaseName(spaceFolder) : undefined
      const spaceRelative = spaceFolder
        ? path.slice(spaceFolder.length + 1)
        : rootPath && path.startsWith(rootPath + '/')
          ? path.slice(rootPath.length + 1)
          : path

      if (isTagSearch && tagQuery) {
        const tagHit = tags.find((t) => t.toLowerCase().includes(tagQuery))
        if (tagHit) matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'tag', matchText: tagHit, tags })
        continue
      }

      if (filenameNoExt.toLowerCase().includes(q)) {
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'filename', tags })
        continue
      }
      if (title.toLowerCase().includes(q) && title !== filenameNoExt) {
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'title', tags })
        continue
      }
      const tagHit = tags.find((t) => t.toLowerCase().includes(q))
      if (tagHit) {
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'tag', matchText: tagHit, tags })
        continue
      }
      if (description.toLowerCase().includes(q)) {
        const idx = description.toLowerCase().indexOf(q)
        const excerpt = description.slice(Math.max(0, idx - 20), idx + 60)
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'description', matchText: excerpt, tags })
        continue
      }

      const headingHit = entry.headings.find((heading) => heading.toLowerCase().includes(q))
      if (headingHit) {
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'heading', matchText: headingHit, tags })
        continue
      }

      const contentIdx = entry.content.toLowerCase().indexOf(q)
      if (contentIdx !== -1) {
        const start = Math.max(0, contentIdx - 30)
        const end = Math.min(entry.content.length, contentIdx + 80)
        const excerpt = (start > 0 ? '…' : '') + entry.content.slice(start, end).trim() + (end < entry.content.length ? '…' : '')
        matches.push({ path, title, subtitle: spaceRelative, spaceName, matchKind: 'content', matchText: excerpt, tags })
      }
    }

    for (const archivedPath of archivedPaths) {
      const archiveName = getBaseName(archivedPath).replace(/\.md$/i, '')
      if (!archiveName.toLowerCase().includes(q)) continue
      matches.push({
        path: archivedPath,
        title: archiveName,
        subtitle: archivedPath,
        matchKind: 'filename',
      })
    }

    const order: Record<SearchMatch['matchKind'], number> = { filename: 0, title: 1, tag: 2, description: 3, heading: 4, content: 5 }
    return matches.sort((a, b) => order[a.matchKind] - order[b.matchKind]).slice(0, 50)
  }, [archivedPaths, indexedEntries, query, recentFolders, rootPath])

  // Réinitialise le curseur quand les résultats changent
  useEffect(() => { setActiveIndex(0) }, [results])

  // Scroll automatique vers l'élément actif
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLButtonElement>(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // Navigation clavier
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault()
        handleSelect(results[activeIndex].path)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, activeIndex, onClose])

  function handleSelect(path: string) {
    onSelectFile?.(path)
    onClose()
  }

  const progressTotal = indexBuildProgress?.total ?? 0
  const progressProcessed = indexBuildProgress?.processed ?? 0
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressProcessed / progressTotal) * 100)) : 0

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/5 backdrop-blur-sm rounded-holo-xl" />

      {/* Dialog */}
      <div className="relative z-10 bg-holo-bg-elevated w-full max-w-xl mx-4 rounded-holo-xl border border-holo-border-soft bg-holo-surface shadow-2xl overflow-hidden flex flex-col max-h-[65vh]">

        {/* Barre de recherche */}
        <div className="flex items-center gap-3 border-b border-holo-border-soft px-4 py-3">
          <Search size={15} className="shrink-0 text-holo-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, titre, #tag, description…"
            className="flex-1 bg-transparent text-sm text-holo-text placeholder:text-holo-text-faint/50 focus:outline-none"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="text-holo-text-faint hover:text-holo-text">
              <X size={14} />
            </button>
          ) : (
            <span className="shrink-0 rounded border border-holo-border-soft px-1.5 py-0.5 font-mono text-[10px] text-holo-text-faint">Échap</span>
          )}
        </div>

        {/* Résultats */}
        <div ref={listRef} className="overflow-y-auto holo-scrollbar">
          {isIndexBuilding && (
            <div className="border-b border-holo-border-soft px-4 py-2">
              <div className="flex items-center justify-between gap-3 text-[11px] text-holo-text-faint">
                <span>Indexation inter-espace en cours…</span>
                <span>{progressTotal > 0 ? `${progressProcessed}/${progressTotal} · ${progressPercent}%` : 'Préparation…'}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full bg-holo-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
          {!query.trim() || query.trim().length < 2 ? (
            <div className="px-4 py-6 text-sm text-holo-text-faint space-y-1">
              <p>Tapez au moins 2 caractères pour lancer la recherche.</p>
              <p className="text-xs opacity-70">Préfixez avec <span className="text-holo-primary-soft font-mono">#</span> pour chercher par tag.</p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-sm text-holo-text-faint">
              Aucun résultat pour «&nbsp;{query}&nbsp;»
            </div>
          ) : (
            <div className="p-2">
              <p className="mb-1 px-2 text-[10px] text-holo-text-faint/60">
                {results.length} résultat{results.length > 1 ? 's' : ''}
              </p>
              {results.map((r, i) => (
                <button
                  key={r.path}
                  data-index={i}
                  onClick={() => handleSelect(r.path)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-holo-md px-3 py-2.5 text-left transition',
                    i === activeIndex ? 'bg-holo-primary-surface' : 'hover:bg-holo-glass-hover'
                  )}
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-holo-text-faint">
                    {r.path.includes('/.archive/')
                      ? <Archive size={13} className="text-amber-400/60" />
                      : r.icon ? <span className="text-sm leading-none">{r.icon}</span> : <File size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn('truncate text-sm', r.path.includes('/.archive/') ? 'text-holo-text-muted' : 'text-holo-text')}>{r.title}</span>
                      {r.path.includes('/.archive/') && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-px text-[9px] font-medium text-amber-400">
                          <Archive size={8} />
                          archivé
                        </span>
                      )}
                      <MatchBadge kind={r.matchKind} />
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-holo-text-faint">
                      {r.spaceName && (
                        <>
                          <span className="shrink-0 rounded bg-holo-glass px-1.5 py-px font-medium text-holo-text-muted">{r.spaceName}</span>
                          <span className="text-holo-text-faint/40">›</span>
                        </>
                      )}
                      <span className="truncate">{r.subtitle}</span>
                    </div>
                    {r.matchText && r.matchKind !== 'filename' && r.matchKind !== 'title' && (
                      r.matchKind === 'tag'
                        ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            <TagChip tag={r.matchText.replace(/^#/, '')} />
                          </div>
                        )
                        : <div className="mt-0.5 truncate text-[11px] italic text-holo-text-faint/70">{r.matchText}</div>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.tags.map((tag) => (
                          <TagChip key={tag} tag={tag} />
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-holo-border-soft px-4 py-2 text-[10px] text-holo-text-faint/60">
          <span><kbd className="font-mono">↑↓</kbd> naviguer</span>
          <span><kbd className="font-mono">↵</kbd> ouvrir</span>
          <span><kbd className="font-mono">Échap</kbd> fermer</span>
        </div>
      </div>
    </div>
  )
}
