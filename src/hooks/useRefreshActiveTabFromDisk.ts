import { useCallback, type Dispatch, type SetStateAction } from 'react'

interface ActiveTab {
  path: string
  name: string
  content: string
  isDirty: boolean
}

interface UseRefreshActiveTabFromDiskParams {
  activeTabPath: string | null
  setActiveTab: Dispatch<SetStateAction<ActiveTab | null>>
}

export function useRefreshActiveTabFromDisk({
  activeTabPath,
  setActiveTab,
}: UseRefreshActiveTabFromDiskParams) {
  const refreshActiveTabFromDisk = useCallback(
    async (holo: NonNullable<Window['holo']>) => {
      if (!activeTabPath) {
        return
      }

      const refreshedContent = await holo.readFile(activeTabPath).catch(() => null)

      if (typeof refreshedContent === 'string') {
        setActiveTab((prev) =>
          prev && prev.path === activeTabPath
            ? { ...prev, content: refreshedContent, isDirty: false }
            : prev,
        )
      }
    },
    [activeTabPath, setActiveTab],
  )

  return {
    refreshActiveTabFromDisk,
  }
}
