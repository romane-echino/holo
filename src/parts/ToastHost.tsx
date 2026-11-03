import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '../utils/global'
import { TOAST_EVENT, type ToastKind, type ToastPayload } from '../lib/notify'

type ToastEntry = ToastPayload & { id: number; kind: ToastKind }

const DEFAULT_DURATION_MS = 4500
const MAX_VISIBLE = 4

const KIND_STYLES: Record<ToastKind, { icon: typeof Info; iconClass: string; accent: string }> = {
  info: { icon: Info, iconClass: 'text-holo-primary-soft', accent: 'before:bg-holo-primary/70' },
  success: { icon: CheckCircle2, iconClass: 'text-holo-success', accent: 'before:bg-holo-success/80' },
  warning: { icon: AlertTriangle, iconClass: 'text-holo-warning', accent: 'before:bg-holo-warning/80' },
  error: { icon: XCircle, iconClass: 'text-holo-danger', accent: 'before:bg-holo-danger/80' },
}

/**
 * Pile de notifications (bas droite). Alimentée par `notify()` et par l'ancien
 * évènement `holo:operation-feedback`.
 */
export function ToastHost({ bottomOffsetClassName }: { bottomOffsetClassName?: string }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextIdRef = useRef(1)
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const timers = timersRef.current
    const dismiss = (id: number) => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
      const timer = timers.get(id)
      if (timer) clearTimeout(timer)
      timers.delete(id)
    }

    const push = (payload: ToastPayload) => {
      const id = nextIdRef.current++
      const entry: ToastEntry = { ...payload, id, kind: payload.kind ?? 'info' }
      setToasts((current) => {
        // Même notification déjà affichée : on ne l'empile pas une seconde fois.
        const withoutDuplicate = current.filter((toast) => !(toast.title === entry.title && toast.message === entry.message))
        return [...withoutDuplicate, entry].slice(-MAX_VISIBLE)
      })
      const duration = payload.durationMs ?? DEFAULT_DURATION_MS
      if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
    }

    const onToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>).detail
      if (detail?.title) push(detail)
    }
    const onLegacyFeedback = (event: Event) => {
      const message = (event as CustomEvent<{ message?: string }>).detail?.message
      if (message) push({ kind: 'info', title: message })
    }

    const onDismiss = (event: Event) => {
      const id = (event as CustomEvent<{ id: number }>).detail?.id
      if (typeof id === 'number') dismiss(id)
    }

    window.addEventListener(TOAST_EVENT, onToast)
    window.addEventListener('holo:operation-feedback', onLegacyFeedback)
    window.addEventListener('holo:toast-dismiss', onDismiss)
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast)
      window.removeEventListener('holo:operation-feedback', onLegacyFeedback)
      window.removeEventListener('holo:toast-dismiss', onDismiss)
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      className={cn('pointer-events-none fixed right-5 z-[149] flex w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-2', bottomOffsetClassName ?? 'bottom-5')}
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => {
        const style = KIND_STYLES[toast.kind]
        const Icon = style.icon
        return (
          <div
            key={toast.id}
            role={toast.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-[1.1rem] border border-holo-border-soft bg-holo-bg/95 py-3 pl-4 pr-2 text-sm text-holo-text shadow-[0_20px_60px_rgba(0,0,0,.45)] backdrop-blur-2xl',
              'before:absolute before:inset-y-0 before:left-0 before:w-[3px]',
              style.accent,
              'animate-[holo-toast-in_160ms_ease-out]',
            )}
          >
            <Icon size={16} className={cn('mt-0.5 shrink-0', style.iconClass)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-5">{toast.title}</p>
              {toast.message && <p className="mt-0.5 break-words text-xs leading-5 text-holo-text-muted">{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('holo:toast-dismiss', { detail: { id: toast.id } }))}
              className="flex size-6 shrink-0 items-center justify-center rounded-holo-md text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
              aria-label="Fermer la notification"
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
