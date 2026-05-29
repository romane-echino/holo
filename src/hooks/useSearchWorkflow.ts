import { useCallback, useState } from 'react'
import { getBaseName, getCommitTargetPath } from '../lib/appUtils'
import { splitMarkdownFrontMatter } from '../lib/markdown'
import type { SearchIndexEntry, SearchResultItem } from '../types/app'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function useSearchWorkflow({
  getHoloApi,
  indexEntries,
}: {
  getHoloApi: () => Window['holo'] | null
  indexEntries: Map<string, SearchIndexEntry>
}) {
  const { archivedFiles, rootPath } = useWorkspace()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const runSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([])
        return
      }

      if (indexEntries.size === 0 && archivedFiles.length === 0) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      const needle = query.trim().toLowerCase()
      const isTagSearch = needle.startsWith('#')
      const tagNeedle = isTagSearch ? needle.slice(1) : needle
      const results: SearchResultItem[] = []
      const matchedPaths = new Set<string>()

      // ── Phase 1 : recherche dans l'index (instantané, aucun I/O) ──────────
      for (const entry of indexEntries.values()) {
        const tagMatch = entry.tags.some((t) => t.toLowerCase().includes(tagNeedle))
        if (tagMatch) {
          results.push({
            path: entry.path,
            name: entry.name,
            excerpt: entry.tags.map((t) => `#${t}`).join(' '),
            matchType: 'tag',
            tags: entry.tags,
          })
          matchedPaths.add(entry.path)
          continue
        }

        if (!isTagSearch) {
          const nameLower = entry.name.toLowerCase()
          const titleLower = entry.title.toLowerCase()
          const descLower = entry.description.toLowerCase()
          if (nameLower.includes(needle) || titleLower.includes(needle) || descLower.includes(needle)) {
            const label = entry.title || entry.name
            const excerpt = entry.description ? `${label} — ${entry.description}` : label
            results.push({ path: entry.path, name: entry.name, excerpt, matchType: 'content', tags: entry.tags })
            matchedPaths.add(entry.path)
          }
        }
      }

      // ── Phase 2 : recherche dans le corps des fichiers (async, fichiers non encore matchés) ──
      if (!isTagSearch) {
        const holo = getHoloApi()
        if (holo) {
          const unmatched = Array.from(indexEntries.keys()).filter((p) => !matchedPaths.has(p))
          const BATCH = 10
          for (let i = 0; i < unmatched.length; i += BATCH) {
            const batch = unmatched.slice(i, i + BATCH)
            await Promise.all(
              batch.map(async (filePath) => {
                try {
                  const content = await holo.readFile(filePath)
                  const body = splitMarkdownFrontMatter(content).body
                  const idx = body.toLowerCase().indexOf(needle)
                  if (idx >= 0) {
                    const entry = indexEntries.get(filePath)
                    const name = entry?.name ?? getBaseName(filePath).replace(/\.md$/i, '')
                    const start = Math.max(0, idx - 40)
                    const end = Math.min(body.length, idx + needle.length + 80)
                    const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
                    const excerpt = (start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')
                    results.push({ path: filePath, name, excerpt, matchType: 'content', tags: entry?.tags ?? [] })
                  }
                } catch {
                  // fichier illisible — ignoré
                }
              }),
            )
          }
        }
      }

      // ── Phase 3 : fichiers archivés (lecture directe) ─────────────────────
      for (const archivedFile of archivedFiles) {
        try {
          const holo = getHoloApi()
          if (!holo) break
          const content: string = await holo.readFile(archivedFile.archivedPath)
          const archiveLabel = `📦 Archivé (${getCommitTargetPath(rootPath, archivedFile.originalPath)})`
          const name = getBaseName(archivedFile.originalPath).replace(/\.md$/i, '')

          const tags: string[] = []
          const tagsMatch = content.match(/^tags:\s*\[([^\]]*)\]/m)
          if (tagsMatch) {
            tags.push(...tagsMatch[1].split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean))
          }

          const tagMatch = tags.some((t) => t.toLowerCase().includes(tagNeedle))
          if (tagMatch) {
            results.push({
              path: archivedFile.archivedPath,
              name,
              excerpt: `${archiveLabel} · ${tags.map((t) => `#${t}`).join(' ')}`,
              matchType: 'archive',
              isArchived: true,
              archivedPath: archivedFile.archivedPath,
              originalPath: archivedFile.originalPath,
            })
            continue
          }

          if (!isTagSearch) {
            const body = splitMarkdownFrontMatter(content).body
            const idx = body.toLowerCase().indexOf(needle)
            if (idx >= 0) {
              const start = Math.max(0, idx - 40)
              const end = Math.min(body.length, idx + needle.length + 80)
              const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
              const excerpt = `${archiveLabel} · ${(start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')}`
              results.push({
                path: archivedFile.archivedPath,
                name,
                excerpt,
                matchType: 'archive',
                isArchived: true,
                archivedPath: archivedFile.archivedPath,
                originalPath: archivedFile.originalPath,
              })
            }
          }
        } catch {
          // ignore unreadable archived files
        }
      }

      setSearchResults(results)
      setIsSearching(false)
    },
    [indexEntries, archivedFiles, getHoloApi, rootPath],
  )

  const onSearchInput = useCallback(
    (nextQuery: string) => {
      setSearchQuery(nextQuery)
      void runSearch(nextQuery)
    },
    [runSearch],
  )

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
  }, [])

  return {
    searchQuery,
    searchResults,
    isSearching,
    onSearchInput,
    clearSearch,
  }
}

  const { archivedFiles, rootPath } = useWorkspace()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const runSearch = useCallback(
    async (query: string) => {
      const holo = getHoloApi()
      if (!holo || !query.trim()) {
        setSearchResults([])
        return
      }

      if (allFilePaths.length === 0 && archivedFiles.length === 0) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      const needle = query.trim().toLowerCase()
      const isTagSearch = needle.startsWith('#')
      const tagNeedle = isTagSearch ? needle.slice(1) : needle
      const results: SearchResultItem[] = []

      const BATCH = 10
      for (let i = 0; i < allFilePaths.length; i += BATCH) {
        const batch = allFilePaths.slice(i, i + BATCH)
        await Promise.all(
          batch.map(async (filePath) => {
            try {
              const content: string = await holo.readFile(filePath)
              const header = getEditableMarkdownHeader(content)
              const name = getBaseName(filePath).replace(/\.md$/i, '')

              const tagMatch = header.tags.some((t) => t.toLowerCase().includes(tagNeedle))
              if (tagMatch) {
                results.push({
                  path: filePath,
                  name,
                  excerpt: header.tags.map((t) => `#${t}`).join(' '),
                  matchType: 'tag',
                  tags: header.tags,
                })
                return
              }

              if (!isTagSearch) {
                const nameLower = name.toLowerCase()
                const titleLower = header.title.toLowerCase()
                const descLower = header.description.toLowerCase()
                if (nameLower.includes(needle) || titleLower.includes(needle) || descLower.includes(needle)) {
                  const label = header.title || name
                  const excerpt = header.description ? `${label} — ${header.description}` : label
                  results.push({ path: filePath, name, excerpt, matchType: 'content', tags: header.tags })
                  return
                }
              }

              if (!isTagSearch) {
                const body = splitMarkdownFrontMatter(content).body
                const idx = body.toLowerCase().indexOf(needle)
                if (idx >= 0) {
                  const start = Math.max(0, idx - 40)
                  const end = Math.min(body.length, idx + needle.length + 80)
                  const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
                  const excerpt = (start > 0 ? '\u2026' : '') + raw + (end < body.length ? '\u2026' : '')
                  results.push({ path: filePath, name, excerpt, matchType: 'content', tags: header.tags })
                }
              }
            } catch {
              // ignore unreadable files
            }
          }),
        )
      }

      for (const archivedFile of archivedFiles) {
        try {
          const content: string = await holo.readFile(archivedFile.archivedPath)
          const header = getEditableMarkdownHeader(content)
          const name = getBaseName(archivedFile.originalPath).replace(/\.md$/i, '')
          const archiveLabel = `📦 Archivé (${getCommitTargetPath(rootPath, archivedFile.originalPath)})`

          const tagMatch = header.tags.some((t) => t.toLowerCase().includes(tagNeedle))
          if (tagMatch) {
            results.push({
              path: archivedFile.archivedPath,
              name,
              excerpt: `${archiveLabel} · ${header.tags.map((t) => `#${t}`).join(' ')}`,
              matchType: 'archive',
              isArchived: true,
              archivedPath: archivedFile.archivedPath,
              originalPath: archivedFile.originalPath,
            })
            continue
          }

          if (!isTagSearch) {
            const body = splitMarkdownFrontMatter(content).body
            const idx = body.toLowerCase().indexOf(needle)

            if (idx >= 0) {
              const start = Math.max(0, idx - 40)
              const end = Math.min(body.length, idx + needle.length + 80)
              const raw = body.slice(start, end).replace(/\n/g, ' ').replace(/#{1,6}\s/g, '')
              const excerpt = `${archiveLabel} · ${(start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')}`

              results.push({
                path: archivedFile.archivedPath,
                name,
                excerpt,
                matchType: 'archive',
                isArchived: true,
                archivedPath: archivedFile.archivedPath,
                originalPath: archivedFile.originalPath,
              })
            }
          }
        } catch {
          // ignore unreadable archived files
        }
      }

      setSearchResults(results)
      setIsSearching(false)
    },
    [allFilePaths, archivedFiles, getHoloApi, rootPath],
  )

  const onSearchInput = useCallback(
    (nextQuery: string) => {
      setSearchQuery(nextQuery)
      void runSearch(nextQuery)
    },
    [runSearch],
  )

  const clearSearch = useCallback(() => {
    setSearchQuery('')
    setSearchResults([])
  }, [])

  return {
    searchQuery,
    searchResults,
    isSearching,
    onSearchInput,
    clearSearch,
  }
}
