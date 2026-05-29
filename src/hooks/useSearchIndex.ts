/**
 * useSearchIndex — Index de recherche persistant
 *
 * - Au chargement de l'espace : lit .holo/search-index.json depuis le disque.
 *   La recherche est immédiatement disponible avec les données du dernier index.
 * - En arrière-plan : compare les mtime des fichiers et re-indexe les fichiers modifiés.
 * - Après chaque sauvegarde : updateIndexEntry() met à jour l'entrée en RAM et
 *   programme une persistance sur disque (debounce 2 s).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { getBaseName } from '../lib/appUtils'
import { getEditableMarkdownHeader } from '../lib/markdown'
import type { SearchIndexEntry } from '../types/app'

const INDEX_VERSION = 1
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
  getHoloApi,
}: {
  rootPath: string | null
  allFilePaths: string[]
  getHoloApi: () => Window['holo'] | null
}) {
  const [entries, setEntries] = useState<Map<string, SearchIndexEntry>>(new Map())
  const [isIndexBuilding, setIsIndexBuilding] = useState(false)

  // Ref synchronisé pour les closures (évite les états stales dans les timers)
  const entriesRef = useRef<Map<string, SearchIndexEntry>>(new Map())
  entriesRef.current = entries

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buildAbortRef = useRef(false)

  // ─── Persistance sur disque (debounced) ─────────────────────────────────────
  const schedulePersist = useCallback(
    (rp: string) => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        const holo = getHoloApi()
        if (!holo) return
        const disk: SearchIndexDisk = {
          version: INDEX_VERSION,
          builtAt: new Date().toISOString(),
          entries: Object.fromEntries(entriesRef.current),
        }
        holo
          .writeFile(`${rp}/.holo/search-index.json`, JSON.stringify(disk, null, 2))
          .catch(() => {
            /* .holo/ peut ne pas exister — l'index reste fonctionnel en RAM */
          })
      }, PERSIST_DEBOUNCE_MS)
    },
    [getHoloApi],
  )

  // ─── Chargement depuis le disque au changement de rootPath ──────────────────
  useEffect(() => {
    if (!rootPath) {
      setEntries(new Map())
      return
    }
    const holo = getHoloApi()
    if (!holo) return

    holo
      .readFileOptional(`${rootPath}/.holo/search-index.json`)
      .then((raw) => {
        if (!raw) return
        try {
          const parsed = JSON.parse(raw) as SearchIndexDisk
          if (parsed.version === INDEX_VERSION && parsed.entries) {
            setEntries(new Map(Object.entries(parsed.entries)))
          }
        } catch {
          /* index corrompu — repart de zéro */
        }
      })
      .catch(() => {/* ignore */})
  }, [rootPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Ré-indexation incrémentale quand allFilePaths change ───────────────────
  useEffect(() => {
    if (!rootPath || allFilePaths.length === 0) return
    const holo = getHoloApi()
    if (!holo) return

    buildAbortRef.current = false
    setIsIndexBuilding(true)

    const build = async () => {
      for (let i = 0; i < allFilePaths.length; i += BATCH_SIZE) {
        if (buildAbortRef.current) return
        const batch = allFilePaths.slice(i, i + BATCH_SIZE)
        await Promise.all(
          batch.map(async (filePath) => {
            try {
              const stats = await holo.getPathStats(filePath)
              const existing = entriesRef.current.get(filePath)
              // Fichier déjà indexé et non modifié → skip
              if (existing && existing.mtime === stats.modifiedAt) return
              const content = await holo.readFile(filePath)
              const header = getEditableMarkdownHeader(content)
              const entry: SearchIndexEntry = {
                path: filePath,
                name: getBaseName(filePath).replace(/\.md$/i, ''),
                title: header.title,
                description: header.description,
                tags: header.tags,
                mtime: stats.modifiedAt,
              }
              setEntries((prev) => new Map(prev).set(filePath, entry))
            } catch {
              /* fichier illisible — ignoré */
            }
          }),
        )
      }

      if (!buildAbortRef.current) {
        // Supprime les entrées des fichiers qui n'existent plus
        const pathSet = new Set(allFilePaths)
        setEntries((prev) => {
          const next = new Map(prev)
          for (const key of next.keys()) {
            if (!pathSet.has(key)) next.delete(key)
          }
          return next
        })
        setIsIndexBuilding(false)
        schedulePersist(rootPath)
      }
    }

    void build()
    return () => {
      buildAbortRef.current = true
    }
  }, [allFilePaths, rootPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Mise à jour d'une seule entrée après sauvegarde ────────────────────────
  const updateIndexEntry = useCallback(
    (filePath: string, content: string) => {
      if (!rootPath) return
      const header = getEditableMarkdownHeader(content)
      const entry: SearchIndexEntry = {
        path: filePath,
        name: getBaseName(filePath).replace(/\.md$/i, ''),
        title: header.title,
        description: header.description,
        tags: header.tags,
        mtime: new Date().toISOString(),
      }
      setEntries((prev) => new Map(prev).set(filePath, entry))
      schedulePersist(rootPath)
    },
    [rootPath, schedulePersist],
  )

  return { indexEntries: entries, isIndexBuilding, updateIndexEntry }
}
