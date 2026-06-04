import { useCallback, useEffect, useRef, useState } from 'react'
import { getBaseName } from '../lib/appUtils'
import { extractMarkdownLinkedPaths, remapTrackedPath } from '../lib/markdownLinks'
import { getEditableMarkdownHeader } from '../lib/markdown'
import type { SearchIndexEntry } from '../types/app'

const INDEX_VERSION = 3
const PERSIST_DEBOUNCE_MS = 2000
const BATCH_SIZE = 15

interface SearchIndexDisk {
  version: number
  builtAt: string
  entries: Record<string, SearchIndexEntry>
}

export function useSearchIndex({
  rootPath,
  allFilePaths,
  scopeRoots = [],
  getHoloApi,
}: {
  rootPath: string | null
  allFilePaths: string[]
  scopeRoots?: string[]
  getHoloApi: () => Window['holo'] | null
}) {
  const [entries, setEntries] = useState<Map<string, SearchIndexEntry>>(new Map())
  const [isIndexBuilding, setIsIndexBuilding] = useState(false)
  const [indexBuildProgress, setIndexBuildProgress] = useState({ processed: 0, total: 0 })

  const entriesRef = useRef<Map<string, SearchIndexEntry>>(new Map())
  entriesRef.current = entries

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buildAbortRef = useRef(false)

  const persistEntries = useCallback((entriesToPersist: Map<string, SearchIndexEntry>) => {
    const holo = getHoloApi()
    if (!holo) return Promise.resolve()

    const disk: SearchIndexDisk = {
      version: INDEX_VERSION,
      builtAt: new Date().toISOString(),
      entries: Object.fromEntries(entriesToPersist),
    }

    return holo.writeSearchIndex(JSON.stringify(disk, null, 2)).catch(() => {
      /* l'index reste utilisable en RAM */
    })
  }, [getHoloApi])

  const getKnownRoots = useCallback(
    () => Array.from(new Set([rootPath, ...scopeRoots].filter((value): value is string => Boolean(value)))),
    [rootPath, scopeRoots],
  )

  const resolveSpaceRoot = useCallback(
    (filePath: string) => {
      const knownRoots = getKnownRoots().sort((left, right) => right.length - left.length)
      return knownRoots.find((candidate) => filePath === candidate || filePath.startsWith(`${candidate}/`)) ?? rootPath ?? ''
    },
    [getKnownRoots, rootPath],
  )

  const buildEntry = useCallback(
    (filePath: string, content: string, mtime: string): SearchIndexEntry => {
      const header = getEditableMarkdownHeader(content)
      const spaceRoot = resolveSpaceRoot(filePath)
      const body = content.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---\r?\n?/u, '')
      const headings = [...body.matchAll(/^#{1,6}\s+(.+)$/gmu)].map((match) => match[1].trim()).filter(Boolean)
      const searchableContent = body
        .replace(/^#{1,6}\s+/gmu, '')
        .replace(/```[\s\S]*?```/gmu, (block) => block.replace(/```/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()

      return {
        path: filePath,
        spaceRoot,
        name: getBaseName(filePath).replace(/\.md$/i, ''),
        title: header.title,
        description: header.description,
        tags: header.tags,
        headings,
        content: searchableContent,
        linkedPaths: extractMarkdownLinkedPaths(content, filePath, spaceRoot || undefined),
        mtime,
      }
    },
    [resolveSpaceRoot],
  )

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      void persistEntries(entriesRef.current)
    }, PERSIST_DEBOUNCE_MS)
  }, [persistEntries])

  useEffect(() => {
    const holo = getHoloApi()
    if (!holo) return

    holo.readSearchIndex()
      .then((raw) => {
        if (!raw) {
          void persistEntries(new Map())
          return
        }
        try {
          const parsed = JSON.parse(raw) as SearchIndexDisk
          if (parsed.version === INDEX_VERSION && parsed.entries) {
            setEntries(new Map(Object.entries(parsed.entries)))
            return
          }
        } catch {
          /* ignore index corrompu */
        }

        void persistEntries(new Map())
      })
      .catch(() => {})
  }, [getHoloApi, persistEntries])

  useEffect(() => {
    const holo = getHoloApi()
    if (!holo) return

    const knownRoots = getKnownRoots()
    if (knownRoots.length === 0) {
      setEntries(new Map())
      setIsIndexBuilding(false)
      setIndexBuildProgress({ processed: 0, total: 0 })
      return
    }

    buildAbortRef.current = false
    setIsIndexBuilding(true)
    setIndexBuildProgress({ processed: 0, total: 0 })

    const build = async () => {
      const scanResults = await Promise.all(
        knownRoots.map(async (knownRoot) => {
          if (rootPath && knownRoot === rootPath && allFilePaths.length > 0) {
            return allFilePaths
          }
          try {
            return await holo.scanMdFiles(knownRoot)
          } catch {
            return []
          }
        }),
      )

      const scopedFilePaths = Array.from(new Set(scanResults.flat().filter((filePath) => filePath.toLowerCase().endsWith('.md'))))
      setIndexBuildProgress({ processed: 0, total: scopedFilePaths.length })

      let processedCount = 0

      for (let index = 0; index < scopedFilePaths.length; index += BATCH_SIZE) {
        if (buildAbortRef.current) return
        const batch = scopedFilePaths.slice(index, index + BATCH_SIZE)
        const batchEntries = await Promise.all(
          batch.map(async (filePath) => {
            try {
              const stats = await holo.getPathStats(filePath)
              const existing = entriesRef.current.get(filePath)
              if (existing && existing.mtime === stats.modifiedAt) return null
              const content = await holo.readFile(filePath)
              return buildEntry(filePath, content, stats.modifiedAt)
            } catch {
              return null
            }
          }),
        )

        const nextEntries = batchEntries.filter((entry): entry is SearchIndexEntry => Boolean(entry))
        if (nextEntries.length > 0) {
          setEntries((previous) => {
            const next = new Map(previous)
            for (const entry of nextEntries) {
              next.set(entry.path, entry)
            }
            return next
          })
        }

        processedCount += batch.length
        setIndexBuildProgress({ processed: processedCount, total: scopedFilePaths.length })
      }

      if (!buildAbortRef.current) {
        const pathSet = new Set(scopedFilePaths)
        setEntries((previous) => {
          const next = new Map(previous)
          for (const key of next.keys()) {
            if (!pathSet.has(key)) next.delete(key)
          }
          return next
        })
        setIsIndexBuilding(false)
        setIndexBuildProgress({ processed: scopedFilePaths.length, total: scopedFilePaths.length })
        schedulePersist()
      }
    }

    void build()
    return () => {
      buildAbortRef.current = true
    }
  }, [allFilePaths, buildEntry, getHoloApi, getKnownRoots, rootPath, schedulePersist])

  useEffect(() => {
    const handlePathMoved = (event: Event) => {
      const detail = (event as CustomEvent<{ from: string; to: string }>).detail
      const from = detail?.from
      const to = detail?.to
      if (!from || !to) return

      let changed = false
      setEntries((previous) => {
        const next = new Map<string, SearchIndexEntry>()
        for (const entry of previous.values()) {
          const nextPath = remapTrackedPath(entry.path, from, to)
          const nextSpaceRoot = entry.spaceRoot ? remapTrackedPath(entry.spaceRoot, from, to) : entry.spaceRoot
          const nextLinkedPaths = entry.linkedPaths.map((linkedPath) => remapTrackedPath(linkedPath, from, to))
          if (nextPath !== entry.path || nextSpaceRoot !== entry.spaceRoot || nextLinkedPaths.some((linkedPath, index) => linkedPath !== entry.linkedPaths[index])) {
            changed = true
          }
          next.set(nextPath, {
            ...entry,
            path: nextPath,
            spaceRoot: nextSpaceRoot,
            linkedPaths: nextLinkedPaths,
          })
        }
        return changed ? next : previous
      })

      if (changed) schedulePersist()
    }

    const handleEntryUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string; content: string }>).detail
      const filePath = detail?.path
      const content = detail?.content
      if (!filePath || typeof content !== 'string') return

      const entry = buildEntry(filePath, content, new Date().toISOString())
      setEntries((previous) => new Map(previous).set(filePath, entry))
      schedulePersist()
    }

    window.addEventListener('holo:path-moved', handlePathMoved)
    window.addEventListener('holo:index-entry-updated', handleEntryUpdated)
    return () => {
      window.removeEventListener('holo:path-moved', handlePathMoved)
      window.removeEventListener('holo:index-entry-updated', handleEntryUpdated)
    }
  }, [buildEntry, schedulePersist])

  const updateIndexEntry = useCallback((filePath: string, content: string) => {
    const entry = buildEntry(filePath, content, new Date().toISOString())
    setEntries((previous) => new Map(previous).set(filePath, entry))
    schedulePersist()
  }, [buildEntry, schedulePersist])

  return { indexEntries: entries, isIndexBuilding, indexBuildProgress, updateIndexEntry }
}
