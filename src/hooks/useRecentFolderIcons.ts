import { useEffect } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function useRecentFolderIcons({ getHoloApi }: { getHoloApi: () => Window['holo'] | null }) {
  const { recentFolders, setRecentFolderIconByPath } = useWorkspace()
  useEffect(() => {
    if (recentFolders.length === 0) {
      setRecentFolderIconByPath({})
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      return
    }

    let cancelled = false

    const loadRecentFolderIcons = async () => {
      const pairs = await Promise.all(
        recentFolders.map(async (folderPath) => {
          try {
            const icon = await holo.getRecentFolderIcon(folderPath)
            return [folderPath, typeof icon === 'string' ? icon.trim() : ''] as const
          } catch {
            return [folderPath, ''] as const
          }
        }),
      )

      if (cancelled) {
        return
      }

      const next: Record<string, string> = {}
      for (const [folderPath, icon] of pairs) {
        if (icon) {
          next[folderPath] = icon
        }
      }

      setRecentFolderIconByPath(next)
    }

    void loadRecentFolderIcons()

    return () => {
      cancelled = true
    }
  }, [getHoloApi, recentFolders, setRecentFolderIconByPath])
}
