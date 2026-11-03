export type ToastKind = 'info' | 'success' | 'warning' | 'error'

export type ToastPayload = {
  kind?: ToastKind
  title: string
  message?: string
  /** Durée d'affichage ; 0 = reste affiché jusqu'à fermeture. */
  durationMs?: number
}

export const TOAST_EVENT = 'holo:toast'

/** Affiche une notification non bloquante (voir ToastHost). */
export function notify(payload: ToastPayload): void {
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }))
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Les erreurs IPC d'Electron sont préfixées : on garde le message utile.
    return error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
  }
  return typeof error === 'string' ? error : 'Erreur inconnue'
}

export function notifyError(title: string, error?: unknown): void {
  notify({ kind: 'error', title, message: error === undefined ? undefined : errorMessage(error), durationMs: 8000 })
}
