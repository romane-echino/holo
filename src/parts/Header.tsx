import WindowControls from "./WindowControls";
import { Lock, ALargeSmall, Settings, Bug } from 'lucide-react'

export function Header() {
  return (
    <header className="flex h-full items-center justify-between border-b border-holo-border-soft px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-4">
      <WindowControls side="left" />

        <div className="flex items-center gap-3">
           <img src="./app-icon.png" height={40} width={120} alt="logo" className="size-8" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold tracking-tight sm:text-xl">holo</div>
            <div className="-mt-1 hidden text-[11px] text-holo-text-faint sm:block">
                {/* TODO Add version */}
                v 0.1.0-alpha
            </div>
          </div>
        </div>
      </div>

      <div className="holo-no-drag flex items-center gap-1 text-sm text-holo-text-faint sm:gap-2">
        {/* TODO: Shows up only when git repo is read-only */}
        <span className="rounded-holo-md px-2 py-1.5 sm:px-3 text-red-500">
            <Lock size={14} />
        </span>

        <button className="rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3">
            <ALargeSmall size={16} />
        </button>
        
        <button className="rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3">   
            <Settings size={16} />
        </button>

        <button
          className="rounded-holo-md px-2 py-1.5 hover:bg-holo-glass-hover hover:text-holo-text-muted sm:px-3"
          onClick={() => window.holo.toggleDevTools()}
          title="Toggle DevTools"
        >
          <Bug size={16} />
        </button>


      </div>

        <WindowControls side="right" />
    </header>
  );
}
