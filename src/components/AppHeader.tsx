import React from 'react'

interface AppHeaderProps {
  headerRef: React.RefObject<HTMLElement | null>
  isCompactLayout: boolean
  appVersion: string | null
  showTypeRBadge: boolean
  readOnlyMode: boolean
  appAuthor: string
  showUserMenu: boolean
  isSidebarOpenOnCompact: boolean
  onHeaderMouseDown: (event: React.MouseEvent<HTMLHeadElement>) => void
  onToggleSidebar: () => void
  onToggleReadOnly: () => void
  onToggleUserMenu: () => void
  onEditAuthor: () => void
  onLogout: () => void
  onDevTools: () => void
  onMinimize: () => void
  onMaximize: () => void
  onClose: () => void
  onCloseUserMenuBackdrop: () => void
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  headerRef,
  isCompactLayout,
  appVersion,
  showTypeRBadge,
  readOnlyMode,
  appAuthor,
  showUserMenu,
  onHeaderMouseDown,
  onToggleSidebar,
  onToggleReadOnly,
  onToggleUserMenu,
  onEditAuthor,
  onLogout,
  onDevTools,
  onMinimize,
  onMaximize,
  onClose,
  onCloseUserMenuBackdrop,
}) => {
  return (
    <header
      ref={headerRef as React.RefObject<HTMLHeadElement>}
      className={`flex items-center ${isCompactLayout ? 'gap-2 px-2 pr-2' : 'pr-3'} min-w-0`}
      style={{ gridArea: 'appbar' }}
      onMouseDown={onHeaderMouseDown}
    >
      {isCompactLayout && (
        <button
          className="no-drag size-9 shrink-0 rounded-lg border border-white/10 bg-white/5 text-white/75 hover:border-[#7B61FF]/50 hover:text-white"
          onClick={onToggleSidebar}
          title="Ouvrir le panneau latéral"
        >
          <i className="fa-solid fa-bars" />
        </button>
      )}
      <div className="flex-1 drag user-select-none">
        <div className={`flex items-end gap-2 min-w-0 ${isCompactLayout ? 'overflow-hidden' : ''}`}>
          <img src="./logo.png" height={40} width={120} alt="logo" />
          {showTypeRBadge && <span className="text-sm font-bold text-red-500">TypeR</span>}
          {appVersion && (
            <span className={`text-[10px] text-white/35 pb-3 ${isCompactLayout ? '' : '-ml-4'}`}>
              v{appVersion}
            </span>
          )}
        </div>
      </div>
      <div className={`flex gap-2 text-white/50 no-drag ${isCompactLayout ? 'shrink-0' : ''}`}>
        <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
          {!isCompactLayout && <span className="uppercase tracking-wide">Read-only</span>}
          <button
            type="button"
            role="switch"
            aria-checked={readOnlyMode}
            className={`relative h-5 w-9 rounded-full transition-colors ${readOnlyMode ? 'bg-[#7B61FF]' : 'bg-white/15'}`}
            onClick={onToggleReadOnly}
            title={readOnlyMode ? 'Désactiver le mode lecture seule' : 'Activer le mode lecture seule'}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${readOnlyMode ? 'translate-x-4.5' : 'translate-x-0.5'}`}
            />
          </button>
        </label>
        <div className="relative">
          <button
            className="size-8 rounded-full border border-white/20 bg-white/5 text-[10px] font-bold text-white/80 hover:border-[#7B61FF]/60 hover:text-white"
            onClick={onToggleUserMenu}
            title={appAuthor ? `Utilisateur: ${appAuthor}` : 'Configurer utilisateur'}
          >
            {appAuthor.trim() ? appAuthor.trim().charAt(0).toUpperCase() : <i className="fa-regular fa-user" />}
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={onCloseUserMenuBackdrop} />
              <div className="absolute right-0 z-50 mt-1 w-52 rounded-lg border border-white/10 bg-[#1a1b1c] p-1 shadow-2xl">
                <div className="px-2 py-1 text-[10px] text-white/50 truncate">{appAuthor.trim() || 'Aucun profil'}</div>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/8 hover:text-white"
                  onClick={onEditAuthor}
                >
                  <i className="fa-regular fa-pen-to-square" />
                  Changer le nom
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-300 hover:bg-red-500/15"
                  onClick={onLogout}
                >
                  <i className="fa-solid fa-right-from-bracket" />
                  Déconnexion
                </button>
              </div>
            </>
          )}
        </div>
        <button
          className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
          onClick={onDevTools}
          title="DevTools"
        >
          <i className="fa-regular fa-code" />
        </button>
        <button
          className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
          onClick={onMinimize}
          title="Minimiser"
        >
          <i className="fa-jelly-duo fa-regular fa-minus" />
        </button>
        <button
          className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
          onClick={onMaximize}
          title="Agrandir / Restaurer"
        >
          <i className="fa-jelly-duo fa-regular fa-square" />
        </button>
        <button
          className="size-8 text-white/50 hover:text-[#7B61FF] cursor-pointer"
          onClick={onClose}
          title="Fermer"
        >
          <i className="fa-jelly-duo fa-regular fa-xmark" />
        </button>
      </div>
    </header>
  )
}
