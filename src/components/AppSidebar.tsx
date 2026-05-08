import React from 'react'

type SidebarMode = 'files' | 'git' | 'search'

type AppSidebarProps = {
  isCompactLayout: boolean
  isSidebarOpenOnCompact: boolean
  activeSidebar: SidebarMode
  showSettings: boolean
  hasActiveTab: boolean
  gitIncoming: number
  gitOutgoing: number
  onSelectSidebar: (mode: SidebarMode) => void
  onToggleSearch: () => void
  onToggleSettings: () => void
  children: React.ReactNode
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isCompactLayout,
  isSidebarOpenOnCompact,
  activeSidebar,
  showSettings,
  hasActiveTab,
  gitIncoming,
  gitOutgoing,
  onSelectSidebar,
  onToggleSearch,
  onToggleSettings,
  children,
}) => {
  return (
    <aside
      className={`${isCompactLayout
        ? `fixed left-0 top-[64px] bottom-0 z-40 ${isSidebarOpenOnCompact ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-200`
        : 'flex gap-2 z-10 pl-2'} font-quicksand`}
      style={isCompactLayout ? undefined : { gridArea: 'sidebar' }}
    >
      <nav className={`flex flex-col gap-4 pt-4 ${isCompactLayout ? 'bg-[#242527] px-2 pb-4' : ''}`}>
        <div
          className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
            activeSidebar === 'files'
              ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
              : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
          }`}
          onClick={() => onSelectSidebar('files')}
        >
          <i className="fa-jelly-duo fa-regular fa-folder text-2xl" />
          {hasActiveTab && (
            <div className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[#242527] border-2 border-[#7B61FF]/70 text-[10px] font-bold text-white flex items-center justify-center">
              1
            </div>
          )}
        </div>

        <div className="relative flex flex-col items-center gap-1">
          <div
            className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
              activeSidebar === 'git'
                ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
            }`}
            onClick={() => onSelectSidebar('git')}
          >
            <i className="fa-brands fa-git-alt text-2xl" />
          </div>

          <div className="flex flex-col gap-1 items-center pointer-events-none">
            {gitIncoming > 0 && (
              <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                <i className="fa-solid fa-arrow-down text-[10px]" />
                <span className="font-bold">{gitIncoming}</span>
              </div>
            )}
            {gitOutgoing > 0 && (
              <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                <i className="fa-solid fa-arrow-up text-[10px]" />
                <span className="font-bold">{gitOutgoing}</span>
              </div>
            )}
          </div>
        </div>

        <div
          className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
            activeSidebar === 'search'
              ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
              : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
          }`}
          onClick={onToggleSearch}
          title="Rechercher"
        >
          <i className="fa-solid fa-magnifying-glass text-xl" />
        </div>

        <div className="mt-auto pb-4">
          <div
            className={`size-12 rounded-full flex items-center justify-center cursor-pointer ${
              showSettings
                ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
            }`}
            onClick={onToggleSettings}
            title="Paramètres"
          >
            <i className="fa-solid fa-gear text-xl" />
          </div>
        </div>
      </nav>

      {children}
    </aside>
  )
}
