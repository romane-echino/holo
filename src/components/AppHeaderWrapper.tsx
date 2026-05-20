import React, { useRef } from 'react'
import { AppHeader } from './AppHeader'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'
import { useGetHoloApi } from '../hooks/useGetHoloApi'
import { useDesktopWindow } from '../hooks/useDesktopWindow'
import { useWindowHeaderDrag } from '../hooks/useWindowHeaderDrag'

type AppHeaderWrapperProps = {
  isCompactLayout: boolean
  appVersion: string | null
  isSidebarOpenOnCompact: boolean
  onToggleSidebar: () => void
  onLogout: () => void
}

export const AppHeaderWrapper: React.FC<AppHeaderWrapperProps> = ({
  isCompactLayout,
  appVersion,
  isSidebarOpenOnCompact,
  onToggleSidebar,
  onLogout,
}) => {
  const headerRef = useRef<HTMLElement | null>(null)
  const { getHoloApi } = useGetHoloApi()
  const {
    windowIsMaximized,
    windowPlatform,
    setWindowIsMaximized,
    setWindowPlatform,
    minimizeWindow,
    toggleDevTools,
    toggleMaximizeWindow,
    closeWindow,
  } = useDesktopWindow(getHoloApi)
  const { onHeaderMouseDown } = useWindowHeaderDrag({
    headerRef,
    windowIsMaximized,
    windowPlatform,
    setWindowIsMaximized,
    setWindowPlatform,
  })
  const { readOnlyMode, setReadOnlyMode } = useEditor()
  const { appAuthor } = useConfig()
  const { showUserMenu, setShowUserMenu, setShowAuthorModal, setAuthorModalMode, setAuthorModalValue } = useUI()
  const showTypeRBadge = appAuthor.trim().toLowerCase() === 'virgile'

  return (
    <AppHeader
      headerRef={headerRef}
      isCompactLayout={isCompactLayout}
      appVersion={appVersion}
      showTypeRBadge={showTypeRBadge}
      readOnlyMode={readOnlyMode}
      appAuthor={appAuthor}
      showUserMenu={showUserMenu}
      isSidebarOpenOnCompact={isSidebarOpenOnCompact}
      onHeaderMouseDown={onHeaderMouseDown}
      onToggleSidebar={onToggleSidebar}
      onToggleReadOnly={() => setReadOnlyMode((previous) => !previous)}
      onToggleUserMenu={() => setShowUserMenu((previous) => !previous)}
      onEditAuthor={() => {
        setAuthorModalMode('edit')
        setAuthorModalValue(appAuthor)
        setShowAuthorModal(true)
        setShowUserMenu(false)
      }}
      onLogout={onLogout}
      onDevTools={toggleDevTools}
      onMinimize={minimizeWindow}
      onMaximize={toggleMaximizeWindow}
      onClose={closeWindow}
      onCloseUserMenuBackdrop={() => setShowUserMenu(false)}
    />
  )
}
