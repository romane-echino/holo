import { useEffect, useRef, useState } from 'react'
import WindowControls from "./WindowControls";
import { ALargeSmall, Settings, Bug, Monitor, RefreshCw, Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useAppUpdates } from '../hooks'
import { cn } from '../utils/global'
import { FontSizePopover } from './FontSizePopover';

type WorkspaceStatus = 'local' | 'git-sync' | 'git-readonly'

function WorkspaceStatusIcon({ status }: { status: WorkspaceStatus }) {
  if (status === 'git-sync') {
    return (
      <span className="flex items-center gap-1.5 rounded-holo-md px-2 py-1.5 text-xs font-medium text-emerald-500 sm:px-3" title="Repo git — synchronisation activée">
        <RefreshCw size={14} />
      </span>
    )
  }
  if (status === 'git-readonly') {
    return (
      <span className="flex items-center gap-1.5 rounded-holo-md px-2 py-1.5 text-xs font-medium text-red-500 sm:px-3" title="Repo git — lecture seule (pas de remote)">
        <Lock size={14} />
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 rounded-holo-md px-2 py-1.5 text-xs font-medium text-amber-400 sm:px-3" title="Dossier local">
      <Monitor size={14} />
    </span>
  )
}

export function Header({
  editorFontSize = 100,
  onEditorFontSizeChange,
  onOpenSettings,
  isDesktopMainSidebarCollapsed = false,
  onToggleDesktopMainSidebar,
}: {
  editorFontSize?: number
  onEditorFontSizeChange?: (v: number) => void
  onOpenSettings?: () => void
  isDesktopMainSidebarCollapsed?: boolean
  onToggleDesktopMainSidebar?: () => void
}) {
  const { rootPath } = useWorkspace()
  const { appVersion } = useAppUpdates()
  const [status, setStatus] = useState<WorkspaceStatus | null>(null)
  const [fontSizeOpen, setFontSizeOpen] = useState(false)
  const fontSizeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rootPath) { setStatus(null); return }
    let cancelled = false
    window.holo?.gitGetState().then((state) => {
      if (cancelled) return
      if (!state.isRepo) setStatus('local')
      else if (state.hasRemote) setStatus('git-sync')
      else setStatus('git-readonly')
    }).catch(() => setStatus('local'))
    return () => { cancelled = true }
  }, [rootPath])

  useEffect(() => {
    if (!fontSizeOpen) return
    const handle = (e: MouseEvent) => {
      if (fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) {
        setFontSizeOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [fontSizeOpen])

  return (
    <header className="flex h-full items-center justify-between border-b border-holo-border-soft px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-4">
        <WindowControls side="left" />

        <div className="flex items-center gap-3">
          <img src="./app-icon.png" height={40} width={120} alt="logo" className="size-8" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight sm:text-xl">holo</div>
            <div className="-mt-1 hidden text-[11px] text-holo-text-faint sm:block">
              v {appVersion}
            </div>
          </div>
        </div>
      </div>

      <div className="holo-no-drag flex items-center gap-1 text-sm text-holo-text-faint sm:gap-2">
        {/* Statut du workspace : local / git-readonly / git-sync */}
        {status && <WorkspaceStatusIcon status={status} />}

        <button
          className="hidden rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted lg:inline-flex sm:px-3"
          onClick={onToggleDesktopMainSidebar}
          title={isDesktopMainSidebarCollapsed ? 'Afficher le menu principal' : 'Masquer le menu principal'}
          aria-label={isDesktopMainSidebarCollapsed ? 'Afficher le menu principal' : 'Masquer le menu principal'}
        >
          {isDesktopMainSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>

        <div className="relative" ref={fontSizeRef}>
          <button
            className={cn(
              'rounded-holo-md px-2 py-1.5 transition hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3',
              (fontSizeOpen || editorFontSize !== 100) && 'bg-holo-glass-hover text-holo-text-muted',
            )}
            onClick={() => setFontSizeOpen((v) => !v)}
            title="Taille du texte"
          >
            <ALargeSmall size={16} />
          </button>

          {fontSizeOpen && (
            <FontSizePopover
              editorFontSize={editorFontSize}
              onEditorFontSizeChange={onEditorFontSizeChange}
            />
          )}
        </div>

        <button
          className="rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3"
          onClick={onOpenSettings}
        >
          <Settings size={16} />
        </button>

        <button
          className="rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3"
          onClick={() => window.holo?.toggleDevTools()}
          title="Toggle DevTools"
        >
          <Bug size={16} />
        </button>


      </div>

      <WindowControls side="right" />
    </header>
  );
}
