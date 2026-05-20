import { useMemo } from 'react'
import { getBaseName } from '../lib/appUtils'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'

export function useNavigationSuggestions({ allFilePaths }: { allFilePaths: string[] }) {
  const { activeTabPath } = useEditor()
  const { recentFilePaths } = useWorkspace()
  const { linkDialog } = useUI()
  const pageQuery = linkDialog?.pageQuery ?? ''
  const visibleRecentFilePaths = useMemo(
    () => recentFilePaths.filter((filePath) => allFilePaths.includes(filePath)).slice(0, 5),
    [allFilePaths, recentFilePaths],
  )

  const linkPageSuggestions = useMemo(() => {
    const pageFiles = allFilePaths.filter((filePath) => filePath.toLowerCase().endsWith('.md'))
    const query = pageQuery.trim().toLowerCase()

    const candidates = pageFiles.filter((filePath) => filePath !== activeTabPath)
    if (!query) {
      return candidates.slice(0, 8)
    }

    return candidates
      .filter((filePath) => filePath.toLowerCase().includes(query) || getBaseName(filePath).toLowerCase().includes(query))
      .slice(0, 8)
  }, [activeTabPath, allFilePaths, pageQuery])

  return {
    visibleRecentFilePaths,
    linkPageSuggestions,
  }
}
