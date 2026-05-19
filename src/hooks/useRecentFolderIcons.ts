import { useEffect, type Dispatch, type SetStateAction } from 'react'

type UseRecentFolderIconsParams = {
  recentFolders: string[]
  getHoloApi: () => Window['holo'] | null
  setRecentFolderIconByPath: Dispatch<SetStateAction<Record<string, string>>>
}

export function useRecentFolderIcons({
  recentFolders,
  getHoloApi,
  setRecentFolderIconByPath,
}: UseRecentFolderIconsParams) {
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
