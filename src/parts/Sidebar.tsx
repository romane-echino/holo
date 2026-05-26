import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from "../utils/global"
import { GitBranch, ArrowDown, ArrowUp, Command, Plus, Star, FolderOpen, Unlink, Monitor, RefreshCw, Lock, Folder } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ContextMenu } from '../components/ContextMenu'
import type { ContextMenuAction } from '../components/ContextMenu'

export type HoloNavItem = {
    label: string;
    icon?: LucideIcon;
    count?: number | string;
    to: string;
    path?: string;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
};

function NavItem({ item }: { item: HoloNavItem }) {
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const isActive = pathname === item.to

    const countTone =
        item.tone === "primary" ? "text-holo-primary-soft" :
            item.tone === "success" ? "text-holo-success" :
                item.tone === "warning" ? "text-holo-warning" :
                    item.tone === "danger" ? "text-holo-danger" :
                        "text-holo-text-muted"

    return (
        <button
            onClick={() => navigate(isActive ? '/' : item.to)}
            className={cn(
                "group flex min-h-10 w-full items-center gap-3 rounded-holo-md px-3 py-2 text-left text-sm text-holo-text-muted transition-all duration-150",
                isActive ? "bg-holo-primary-surface text-holo-primary-soft ring-1 ring-holo-primary/20" : "hover:bg-holo-glass-hover hover:text-holo-text"
            )}
        >
            <span className={`flex size-4 items-center justify-center rounded-sm ${isActive ? "text-holo-primary-soft" : "text-holo-text-muted group-hover:text-holo-text"}`}>
                {item.icon && <item.icon size={14} />}
            </span>
            <span className={`flex-1 leading-none ${isActive ? "text-holo-primary-soft" : "text-holo-text-muted group-hover:text-holo-text"}`}>{item.label}</span>
            {item.count !== undefined && (
                <span className={cn("ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-holo-glass px-1.5 text-[11px] leading-none", countTone)}>
                    {item.count}
                </span>
            )}
        </button>
    )
}

type SpaceStatus = 'local' | 'git-sync' | 'git-readonly'

function SpaceStatusIcon({ status, isActive }: { status?: SpaceStatus; isActive: boolean }) {
    if (!status) return <Folder size={14} />
    if (status === 'git-sync') return <RefreshCw size={13} className={isActive ? 'text-emerald-500' : 'text-emerald-500/70'} />
    if (status === 'git-readonly') return <Lock size={13} className={isActive ? 'text-red-500' : 'text-red-500/70'} />
    return <Monitor size={13} className={isActive ? 'text-amber-400' : 'text-amber-400/70'} />
}

function SpaceNavItem({ item, isFavorite, spaceStatus, onContextMenu }: {
    item: HoloNavItem
    isFavorite: boolean
    spaceStatus?: SpaceStatus
    onContextMenu: (e: React.MouseEvent, item: HoloNavItem) => void
}) {
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const isActive = pathname === item.to

    return (
        <button
            onClick={() => navigate(isActive ? '/' : item.to)}
            onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, item) }}
            className={cn(
                "group flex min-h-10 w-full items-center gap-3 rounded-holo-md px-3 py-2 text-left text-sm text-holo-text-muted transition-all duration-150",
                isActive ? "bg-holo-primary-surface text-holo-primary-soft ring-1 ring-holo-primary/20" : "hover:bg-holo-glass-hover hover:text-holo-text"
            )}
        >
            <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm ${isActive ? '' : 'text-holo-text-muted group-hover:text-holo-text'}`}>
                {isActive ?
                    <FolderOpen size={14} />
                    : <Folder size={14} />
                }

            </span>
            <span className={`flex-1 truncate leading-none ${isActive ? "text-holo-primary-soft" : "text-holo-text-muted group-hover:text-holo-text"}`}>{item.label}</span>

            <span className={`flex size-4 shrink-0 items-center justify-center rounded-sm ${isActive ? '' : 'text-holo-text-muted group-hover:text-holo-text'}`}>
                {spaceStatus
                    ? <SpaceStatusIcon status={spaceStatus} isActive={isActive} />
                    : item.icon ? <item.icon size={14} /> : <Folder size={14} />}
            </span>
            {isFavorite && <Star size={10} className="shrink-0 fill-holo-warning text-holo-warning" />}
        </button>
    )
}

type SpaceMenuState = { path: string; label: string; x: number; y: number }

type HoloSidebarProps = {
    primaryItems: HoloNavItem[];
    spaces: HoloNavItem[];
    gitData?: {
        incoming: number;
        outgoing: number;
        branch: string;
    };
    userName?: string;
    userMail?: string;
    favoritePaths?: string[];
    spaceStatuses?: Record<string, SpaceStatus>;
    onAddSpace?: () => void;
    onSpaceFavorite?: (path: string) => void;
    onSpaceRemove?: (path: string) => void;
    onSpaceOpenInExplorer?: (path: string) => void;
};

function getInitials(name: string): string {
    return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').slice(0, 2).join('')
}

export function Sidebar({
    primaryItems,
    spaces,
    gitData,
    userName,
    userMail,
    favoritePaths = [],
    spaceStatuses = {},
    onAddSpace,
    onSpaceFavorite,
    onSpaceRemove,
    onSpaceOpenInExplorer,
}: HoloSidebarProps) {
    const [spaceMenu, setSpaceMenu] = useState<SpaceMenuState | null>(null)

    const handleContextMenu = useCallback((e: React.MouseEvent, item: HoloNavItem) => {
        if (!item.path) return
        setSpaceMenu({ path: item.path, label: item.label, x: e.clientX, y: e.clientY })
    }, [])

    return (
        <aside className="h-full flex flex-col">
            <nav className="grow flex h-full flex-col p-4 overflow-y-auto holo-scrollbar">
                <button className="mb-5 flex w-full items-center gap-2 rounded-holo-md bg-holo-glass px-3 py-2 text-left text-sm text-holo-text-faint">
                    <Command size={13} />
                    Rechercher...
                </button>

                <div className="space-y-1">
                    {primaryItems.map((item) => <NavItem key={item.label} item={item} />)}
                </div>

                <div className="mb-2 mt-7 flex items-center justify-between pl-3">
                    <span className="text-[11px] uppercase tracking-wider text-holo-text-faint">Espaces</span>
                    <button
                        onClick={onAddSpace}
                        className={`flex size-7 items-center justify-center rounded-holo-md
                        ${spaces.length === 0 ? 'bg-holo-primary/80 text-white hover:bg-holo-primary/80' : 'bg-holo-glass border border-holo-border-soft text-holo-text-muted hover:border-holo-primary/40 hover:bg-holo-primary-surface hover:text-holo-primary-soft'} transition active:scale-[0.97]`}
                        title="Ajouter un espace de travail"
                    >
                        <Plus size={13} />
                    </button>
                </div>

                <div className="space-y-1">
                    {spaces.map((item) => (
                        <SpaceNavItem
                            key={item.label}
                            item={item}
                            isFavorite={favoritePaths.includes(item.path ?? '')}
                            spaceStatus={item.path ? spaceStatuses[item.path] : undefined}
                            onContextMenu={handleContextMenu}
                        />
                    ))}
                    {spaces.length === 0 && (
                        <div className="rounded-holo-md bg-holo-glass px-3 py-2 text-sm text-holo-text-faint">
                            Aucun dossier ou dépot Git ouvert. Cliquez sur "+" pour en ajouter un.
                        </div>
                    )}
                </div>


                {/* Only appears when a space is selected */}
                {gitData && (
                    <>
                        <div className="mb-2 mt-7 px-3 text-[11px] uppercase tracking-wider text-holo-text-faint">Git</div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 rounded-holo-md bg-holo-glass px-3 py-2 text-sm text-holo-text-faint">
                                <GitBranch size={13} />
                                <span>{gitData.branch}</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-holo-md bg-holo-glass px-3 py-2 text-sm text-holo-text-faint">
                                <ArrowDown size={13} />
                                <span>{gitData.incoming} incoming</span>
                            </div>
                            <div className="flex items-center gap-2 rounded-holo-md bg-holo-glass px-3 py-2 text-sm text-holo-text-faint">
                                <ArrowUp size={13} />
                                <span>{gitData.outgoing} outgoing</span>
                            </div>
                        </div>
                    </>
                )}

            </nav>

            <div className="mt-auto flex items-center gap-3 border-t border-holo-border-soft p-4">
                <div className="size-9 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-holo-primary to-holo-primary-soft">
                    <span className="text-sm font-bold text-white">{userName ? getInitials(userName) : '?'}</span>
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{userName || <span className="text-holo-text-faint italic">Non configuré</span>}</div>
                    <div className="truncate text-xs text-holo-text-faint">{userMail || ''}</div>
                </div>
            </div>
            {spaceMenu && (
                <ContextMenu
                    x={spaceMenu.x}
                    y={spaceMenu.y}
                    onClose={() => setSpaceMenu(null)}
                    items={[
                        { type: 'header', label: spaceMenu.label },
                        { type: 'separator' },
                        {
                            type: 'item',
                            label: favoritePaths.includes(spaceMenu.path) ? 'Retirer des favoris' : 'Mettre en favori',
                            icon: Star,
                            onClick: () => onSpaceFavorite?.(spaceMenu.path),
                        },
                        {
                            type: 'item',
                            label: "Ouvrir dans l'explorateur",
                            icon: FolderOpen,
                            onClick: () => onSpaceOpenInExplorer?.(spaceMenu.path),
                        },
                        { type: 'separator' },
                        {
                            type: 'item',
                            label: 'Dissocier de Holo',
                            icon: Unlink,
                            variant: 'danger',
                            onClick: () => onSpaceRemove?.(spaceMenu.path),
                        },
                    ] satisfies ContextMenuAction[]}
                />
            )}        </aside>
    );
}
