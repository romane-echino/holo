import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from "../utils/global"
import { GitBranch, ArrowDown, ArrowUp, Command, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type HoloNavItem = {
    label: string;
    icon?: LucideIcon;
    count?: number | string;
    to: string;
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
    onAddSpace?: () => void;
};

export function Sidebar({
    primaryItems,
    spaces,
    gitData,
    userName = "Stéphane",
    userMail = "stephane@echino.com",
    onAddSpace,
}: HoloSidebarProps) {

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

                <div className="mb-2 mt-7 flex items-center justify-between px-3">
                    <span className="text-[11px] uppercase tracking-wider text-holo-text-faint">Espaces</span>
                    <button
                        onClick={onAddSpace}
                        className="flex size-6 items-center justify-center rounded-holo-sm text-holo-text-faint hover:bg-holo-glass-hover hover:text-holo-primary-soft"
                        title="Ajouter un espace de travail"
                    >
                        <Plus size={13} />
                    </button>
                </div>

                <div className="space-y-1">
                    {spaces.map((item) => <NavItem key={item.label} item={item} />)}
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
                <div className="size-9 rounded-full flex items-center justify-center bg-gradient-to-br from-holo-primary to-holo-primary-soft">
                    <span className="text-base font-bold text-white">{userName[0]}</span>
                </div>
                <div>
                    <div className="text-sm font-medium">{userName}</div>
                    <div className="text-xs text-holo-text-faint">{userMail}</div>
                </div>
            </div>
        </aside>
    );
}
