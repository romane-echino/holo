import React from 'react'
import { AppHeader } from './AppHeader'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'

type AppHeaderWrapperProps = {
  headerRef: React.RefObject<HTMLElement | null>
  isCompactLayout: boolean
  appVersion: string | null
  isSidebarOpenOnCompact: boolean
  onHeaderMouseDown: (event: React.MouseEvent<HTMLHeadElement>) => void
  onToggleSidebar: () => void
  onLogout: () => void
  onDevTools: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
}

export const AppHeaderWrapper: React.FC<AppHeaderWrapperProps> = ({
  headerRef,
  isCompactLayout,
  appVersion,
  isSidebarOpenOnCompact,
  onHeaderMouseDown,
  onToggleSidebar,
  onLogout,
  onDevTools,
  onMinimize,
  onMaximize,
  onClose,
}) => {
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
      onDevTools={onDevTools}
      onMinimize={onMinimize}
      onMaximize={onMaximize}
      onClose={onClose}
      onCloseUserMenuBackdrop={() => setShowUserMenu(false)}
    />
  )
}
