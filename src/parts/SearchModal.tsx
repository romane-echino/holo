/**
 * SearchModal.tsx — Palette de recherche globale (style commandes)
 *
 * Apparaît au centre de l'écran via Ctrl+K ou le bouton sidebar.
 * Navigation clavier : ↑/↓ pour naviguer, Entrée pour ouvrir, Échap pour fermer.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, File } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getBaseName } from '../lib/appUtils'
import { cn } from '../utils/global'
import type { TreeFileMeta } from './SpacePanel'

type SearchMatch = {
  path: string
  title: string
  subtitle: string
  matchKind: 'filename' | 'title' | 'tag' | 'description'
  matchText?: string
  icon?: string
}

function MatchBadge({ kind }: { kind: SearchMatch['matchKind'] }) {
  const labels: Record<SearchMatch['matchKind'], string> = {
    filename: 'fichier',
    title: 'titre',
    tag: 'tag',
    description: 'description',
  }
  const colors: Record<SearchMatch['matchKind'], string> = {
    filename: 'bg-blue-500/15 text-blue-300',
    title: 'bg-holo-primary/15 text-holo-primary-soft',
    tag: 'bg-emerald-500/15 text-emerald-300',
    description: 'bg-amber-500/15 text-amber-300',
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
}

export function SearchModal({ open, onClose, onSelectFile }: SearchModalProps) {
  const { fileMetaByPath, recentFilePaths, rootPath, tree } = useWorkspace()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset à l'ouverture
  useEffect(() => {
    if (open) {
      setQuery('')
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Collecte tous les chemins connus
  const knownPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const p of Object.keys(fileMetaByPath)) paths.add(p)
    for (const p of recentFilePaths) paths.add(p)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(node: any) {
      if (!node) return
      if (node.type === 'file') paths.add(node.path)
      if (node.children) for (const c of node.children) walk(c)
    }
    walk(tree)
    return [...paths].filter((p) => p.endsWith('.md'))
  }, [fileMetaByPath, recentFilePaths, tree])

  const results = useMemo((): SearchMatch[] => {
    const q = query.trim().toLowerCase()
    if (!q || q.length < 2) return []

    const isTagSearch = q.startsWith('#')
    const tagQuery = isTagSearch ? q.slice(1) : null
    const matches: SearchMatch[] = []

    for (const path of knownPaths) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const meta = fileMetaByPath[path] as (TreeFileMeta & { tags?: string[] }) | undefined
      const basename = getBaseName(path)
      const filenameNoExt = basename.replace(/\.md$/i, '')
      const title = meta?.title || filenameNoExt
      const description = meta?.description || ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tags: string[] = (meta as any)?.tags ?? []

      const spaceRelative = rootPath && path.startsWith(rootPath + '/')
        ? path.slice(rootPath.length + 1)
        : path

      if (isTagSearch && tagQuery) {
        const tagHit = tags.find((t) => t.toLowerCase().includes(tagQuery))
        if (tagHit) matches.push({ path, title, subtitle: spaceRelative, matchKind: 'tag', matchText: tagHit, icon: (meta as any)?.icon })
        continue
      }

      if (filenameNoExt.toLowerCase().includes(q)) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'filename', icon: (meta as any)?.icon })
        continue
      }
      if (title.toLowerCase().includes(q) && title !== filenameNoExt) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'title', icon: (meta as any)?.icon })
        continue
      }
      const tagHit = tags.find((t) => t.toLowerCase().includes(q))
      if (tagHit) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'tag', matchText: tagHit, icon: (meta as any)?.icon })
        continue
      }
      if (description.toLowerCase().includes(q)) {
        const idx = description.toLowerCase().indexOf(q)
        const excerpt = description.slice(Math.max(0, idx - 20), idx + 60)
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'description', matchText: excerpt, icon: (meta as any)?.icon })
      }
    }

    const order: Record<SearchMatch['matchKind'], number> = { filename: 0, title: 1, tag: 2, description: 3 }
    return matches.sort((a, b) => order[a.matchKind] - order[b.matchKind]).slice(0, 50)
  }, [query, knownPaths, fileMetaByPath, rootPath])

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
                    {r.icon ? <span className="text-sm leading-none">{r.icon}</span> : <File size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm text-holo-text">{r.title}</span>
                      <MatchBadge kind={r.matchKind} />
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-holo-text-faint">{r.subtitle}</div>
                    {r.matchText && r.matchKind !== 'filename' && r.matchKind !== 'title' && (
                      <div className="mt-0.5 truncate text-[11px] italic text-holo-text-faint/70">{r.matchText}</div>
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
