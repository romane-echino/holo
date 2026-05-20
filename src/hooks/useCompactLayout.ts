import { useCallback, useEffect, useState } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'

type SidebarSection = 'files' | 'git' | 'search'

export function useCompactLayout() {
  const { activeTabPath } = useEditor()
  const { setActiveSidebar } = useWorkspace()
  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1180 : false,
  )
  const [isSidebarOpenOnCompact, setIsSidebarOpenOnCompact] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onResize = () => {
      setIsCompactLayout(window.innerWidth < 1180)
    }

    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isCompactLayout) {
      setIsSidebarOpenOnCompact(false)
    }
  }, [isCompactLayout])

  useEffect(() => {
    if (isCompactLayout && activeTabPath) {
      setIsSidebarOpenOnCompact(false)
    }
  }, [activeTabPath, isCompactLayout])

  const selectSidebar = useCallback(
    (sidebar: SidebarSection) => {
      setActiveSidebar(sidebar)
      if (isCompactLayout) {
        setIsSidebarOpenOnCompact(true)
      }
    },
    [isCompactLayout, setActiveSidebar],
  )

  return {
    isCompactLayout,
    isSidebarOpenOnCompact,
    setIsSidebarOpenOnCompact,
    selectSidebar,
  }
}
