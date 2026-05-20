import { useCallback } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'

export function useToggleDirectory() {
  const { setExpandedDirectories } = useWorkspace()
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
