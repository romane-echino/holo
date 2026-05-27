/**
 * SearchPanel.tsx — Panneau de recherche global
 *
 * Cherche dans :
 * 1. Nom de fichier
 * 2. Titre (frontmatter ou déduit du nom)
 * 3. Tags (frontmatter)
 * 4. Description (frontmatter)
 *
 * Les données proviennent de fileMetaByPath (métadonnées en mémoire).
 * La recherche est instantanée (pas d'appels réseau).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, File } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getBaseName } from '../lib/appUtils'
import { cn } from '../utils/global'
import { AbstractPanel } from './AbstractPanel'
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

type SearchPanelProps = {
  onSelectFile?: (path: string) => void
}

export function SearchPanel({ onSelectFile }: SearchPanelProps) {
  const { fileMetaByPath, recentFilePaths, rootPath, tree } = useWorkspace()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Collecte tous les chemins de fichiers connus (méta + récents)
  const knownPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const p of Object.keys(fileMetaByPath)) paths.add(p)
    for (const p of recentFilePaths) paths.add(p)
    // Walk the tree
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
      const meta = fileMetaByPath[path] as (TreeFileMeta & { tags?: string[] }) | undefined
      const basename = getBaseName(path)
      const filenameNoExt = basename.replace(/\.md$/i, '')
      const title = meta?.title || filenameNoExt
      const description = meta?.description || ''
      const tags: string[] = (meta as any)?.tags ?? []

      const spaceRelative = rootPath && path.startsWith(rootPath + '/')
        ? path.slice(rootPath.length + 1)
        : path

      if (isTagSearch && tagQuery) {
        const tagHit = tags.find((t) => t.toLowerCase().includes(tagQuery))
        if (tagHit) {
          matches.push({
            path,
            title,
            subtitle: spaceRelative,
            matchKind: 'tag',
            matchText: tagHit,
            icon: (meta as any)?.icon,
          })
        }
        continue
      }

      // Filename match (highest priority)
      if (filenameNoExt.toLowerCase().includes(q)) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'filename', icon: (meta as any)?.icon })
        continue
      }

      // Title match
      if (title.toLowerCase().includes(q) && title !== filenameNoExt) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'title', icon: (meta as any)?.icon })
        continue
      }

      // Tag match
      const tagHit = tags.find((t) => t.toLowerCase().includes(q))
      if (tagHit) {
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'tag', matchText: tagHit, icon: (meta as any)?.icon })
        continue
      }

      // Description match
      if (description.toLowerCase().includes(q)) {
        const idx = description.toLowerCase().indexOf(q)
        const excerpt = description.slice(Math.max(0, idx - 20), idx + 60)
        matches.push({ path, title, subtitle: spaceRelative, matchKind: 'description', matchText: excerpt, icon: (meta as any)?.icon })
      }
    }

    // Trier par priorité: filename > title > tag > description
    const order: Record<SearchMatch['matchKind'], number> = { filename: 0, title: 1, tag: 2, description: 3 }
    return matches.sort((a, b) => order[a.matchKind] - order[b.matchKind]).slice(0, 50)
  }, [query, knownPaths, fileMetaByPath, rootPath])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <AbstractPanel
      title="Recherche"
      subHeader={
        <div className="relative px-4 pb-3">
          <Search size={13} className="absolute left-7 top-1/2 -translate-y-1/2 text-holo-text-faint pointer-events-none" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, titre, #tag, description…"
            className="w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass py-2 pl-8 pr-8 text-sm text-holo-text placeholder:text-holo-text-faint/50 focus:border-holo-primary/40 focus:outline-none focus:ring-1 focus:ring-holo-primary/20"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-7 top-1/2 -translate-y-1/2 text-holo-text-faint hover:text-holo-text"
            >
              <X size={12} />
            </button>
          )}
        </div>
      }
    >
      {!query.trim() || query.trim().length < 2 ? (
        <div className="mt-4 space-y-2 text-sm text-holo-text-faint">
          <p>Tapez au moins 2 caractères pour lancer la recherche.</p>
          <p className="text-xs opacity-70">Préfixez avec <span className="text-holo-primary-soft font-mono">#</span> pour chercher par tag.</p>
        </div>
      ) : results.length === 0 ? (
        <p className="mt-4 text-sm text-holo-text-faint">
          Aucun résultat pour «&nbsp;{query}&nbsp;»
        </p>
      ) : (
        <div className="space-y-1">
          <p className="mb-2 text-[11px] text-holo-text-faint/60">
            {results.length} résultat{results.length > 1 ? 's' : ''}
          </p>
          {results.map((r) => (
            <button
              key={r.path}
              onClick={() => onSelectFile?.(r.path)}
              className="flex w-full items-start gap-3 rounded-holo-md px-3 py-2.5 text-left transition hover:bg-holo-glass-hover"
            >
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-holo-text-faint">
                {r.icon
                  ? <span className="text-sm leading-none">{r.icon}</span>
                  : <File size={13} />
                }
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
    </AbstractPanel>
  )
}
