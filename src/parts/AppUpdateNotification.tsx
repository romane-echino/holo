/**
 * AppUpdateNotification.tsx
 *
 * Notification flottante en bas à droite quand une mise à jour est disponible.
 * Affiche la progression du téléchargement puis un bouton "Redémarrer & installer".
 */

import { Download, RefreshCw, X, Sparkles } from 'lucide-react'
import { cn } from '../utils/global'

interface AppUpdateNotificationProps {
  updateReady: boolean
  updateProgress: number
  onInstall: () => void
  onDismiss: () => void
}

export function AppUpdateNotification({ updateReady, updateProgress, onInstall, onDismiss }: AppUpdateNotificationProps) {
  return (
    <div className="fixed bottom-5 right-5 z-[150] w-[320px] overflow-hidden rounded-[1.2rem] border border-holo-border-soft bg-holo-bg/95 shadow-[0_20px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.04)] backdrop-blur-2xl">
      {/* Accent strip */}
      <div className="h-[2px] w-full bg-gradient-to-r from-holo-primary via-holo-primary/60 to-transparent" />

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-holo-primary-surface text-holo-primary-soft">
            {updateReady ? <Sparkles size={16} /> : <Download size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-holo-text">
              {updateReady ? 'Mise à jour prête' : 'Mise à jour disponible'}
            </p>
            <p className="text-[11px] text-holo-text-faint mt-0.5">
              {updateReady
                ? 'Redémarrez pour installer la nouvelle version.'
                : 'Téléchargement en cours…'}
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="shrink-0 rounded-holo-md p-1 text-holo-text-faint transition hover:bg-holo-glass hover:text-holo-text"
            title="Plus tard"
          >
            <X size={14} />
          </button>
        </div>

        {/* Barre de progression */}
        {!updateReady && (
          <div className="mb-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-holo-border-soft">
              <div
                className={cn(
                  'h-full rounded-full bg-holo-primary transition-all duration-500',
                  updateProgress < 100 && 'animate-pulse',
                )}
                style={{ width: `${Math.max(4, updateProgress)}%` }}
              />
            </div>
            <p className="mt-1 text-right font-mono text-[10px] text-holo-text-faint">{updateProgress}%</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {updateReady ? (
            <>
              <button
                onClick={onDismiss}
                className="flex-1 rounded-holo-lg border border-holo-border-soft bg-transparent py-2 text-xs text-holo-text-muted transition hover:bg-holo-glass"
              >
                Plus tard
              </button>
              <button
                onClick={onInstall}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-holo-lg bg-holo-primary py-2 text-xs font-medium text-white transition hover:bg-holo-primary/90"
              >
                <RefreshCw size={12} />
                Redémarrer
              </button>
            </>
          ) : (
            <button
              onClick={onDismiss}
              className="flex-1 rounded-holo-lg border border-holo-border-soft bg-transparent py-2 text-xs text-holo-text-muted transition hover:bg-holo-glass"
            >
              En arrière-plan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
