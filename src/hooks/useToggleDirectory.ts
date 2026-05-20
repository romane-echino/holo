import { useCallback } from 'react'

interface UseToggleDirectoryParams {
  setExpandedDirectories: (updater: (prev: Set<string>) => Set<string>) => void
}

export function useToggleDirectory({
  setExpandedDirectories,
}: UseToggleDirectoryParams) {
  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(directoryPath)) {
        next.delete(directoryPath)
      } else {
        next.add(directoryPath)
      }

      return next
    })
  }, [setExpandedDirectories])

  return {
    toggleDirectory,
  }
}
