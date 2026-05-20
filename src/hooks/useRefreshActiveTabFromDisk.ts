import { useCallback } from 'react'
import { useEditor } from '../contexts/EditorContext'

export function useRefreshActiveTabFromDisk() {
  const { activeTabPath, setActiveTab } = useEditor()
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
