import { useMemo } from 'react'
import { getBaseName } from '../lib/appUtils'

type UseNavigationSuggestionsParams = {
  allFilePaths: string[]
  recentFilePaths: string[]
  activeTabPath: string | null
  pageQuery: string
}

export function useNavigationSuggestions({
  allFilePaths,
  recentFilePaths,
  activeTabPath,
  pageQuery,
}: UseNavigationSuggestionsParams) {
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
