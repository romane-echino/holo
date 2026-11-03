import { useState } from 'react'
import { Users } from 'lucide-react'
import { AbstractPopup } from '../parts/AbstractPopup'
import { notify } from '../lib/notify'

const inputClassName =
  'w-full rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

const primaryButtonClassName =
  'rounded-holo-md bg-holo-primary px-4 py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

// eslint-disable-next-line react-refresh/only-export-components
export const REALTIME_SERVER_PLACEHOLDER = 'https://cn.echino.com/holo-realtime'

/** Teste puis enregistre l'adresse du relais ; renvoie un message d'erreur, ou null. */
// eslint-disable-next-line react-refresh/only-export-components
export async function connectRealtimeServer(url: string): Promise<string | null> {
  const api = window.holo?.realtime
  if (!api) return 'Indisponible dans cette version.'
  try {
    const result = await api.testConnection({ url })
    if (!result.ok) {
      return result.status === 404
        ? 'Aucun serveur de collaboration à cette adresse (projet holo-realtime introuvable).'
        : `Serveur injoignable : ${result.error ?? 'erreur inconnue'}`
    }
    await api.setConfig({ url, enabled: true })
    window.dispatchEvent(new CustomEvent('holo:realtime-config-changed'))
    return null
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(error)
  }
}

/**
 * Demande, une fois, l'adresse du serveur de collaboration (projet Codenotch
 * holo-realtime). Aucun compte ni jeton : avoir accès au dépôt git suffit.
 */
export function RealtimeSetup({ open, onClose }: { open: boolean; onClose: (configured: boolean) => void }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!url.trim()) return
    setBusy(true)
    setError(null)
    const failure = await connectRealtimeServer(url.trim())
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    notify({ kind: 'success', title: 'Édition en temps réel activée', durationMs: 3000 })
    onClose(true)
  }

  return (
    <AbstractPopup
      open={open}
      title="Édition en temps réel"
      description="Travaillez à plusieurs sur le même document et voyez les modifications des autres instantanément."
      onClose={() => onClose(false)}
      size="sm"
      footer={(
        <>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
          >
            Plus tard
          </button>
          <button type="button" onClick={() => void submit()} disabled={busy || !url.trim()} className={primaryButtonClassName}>
            {busy ? 'Connexion…' : 'Activer'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-holo-lg border border-holo-border-soft bg-white/[0.018] p-3">
          <Users size={16} className="mt-0.5 shrink-0 text-holo-primary-soft" />
          <p className="text-xs leading-5 text-holo-text-faint">
            Aucun compte à créer : les personnes qui ont accès au même dépôt git se retrouvent automatiquement.
            Le contenu est chiffré sur votre poste, le serveur ne le voit jamais.
          </p>
        </div>
        <div>
          <label htmlFor="realtime-setup-url" className="mb-1.5 block text-xs font-medium text-holo-text-muted">
            Adresse du serveur Codenotch
          </label>
          <input
            id="realtime-setup-url"
            type="url"
            value={url}
            onChange={(event) => { setUrl(event.target.value); setError(null) }}
            onKeyDown={(event) => { if (event.key === 'Enter') void submit() }}
            placeholder={REALTIME_SERVER_PLACEHOLDER}
            className={inputClassName}
            spellCheck={false}
            autoFocus
          />
          {error && <p role="alert" className="mt-2 text-xs text-holo-danger">{error}</p>}
          <p className="mt-2 text-xs text-holo-text-faint">Modifiable plus tard dans Paramètres → Collaboration.</p>
        </div>
      </div>
    </AbstractPopup>
  )
}
