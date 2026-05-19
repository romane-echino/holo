import { useCallback, useState } from 'react'
import { getBaseName, getCommitTargetPath } from '../lib/appUtils'
import { getEditableMarkdownHeader, splitMarkdownFrontMatter } from '../lib/markdown'
import type { SearchResultItem } from '../types/app'

type ArchivedFileEntry = {
  archivedPath: string
  originalPath: string
  name: string
}

type UseSearchWorkflowParams = {
  getHoloApi: () => Window['holo'] | null
  allFilePaths: string[]
  archivedFiles: ArchivedFileEntry[]
  rootPath: string | null
}

export function useSearchWorkflow({
  getHoloApi,
  allFilePaths,
  archivedFiles,
  rootPath,
}: UseSearchWorkflowParams) {
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
                  results.push({ path: filePath, name, excerpt, matchType: 'content' })
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
                  const excerpt = (start > 0 ? '…' : '') + raw + (end < body.length ? '…' : '')
                  results.push({ path: filePath, name, excerpt, matchType: 'content' })
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
