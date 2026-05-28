/**
 * SpaceCredentialsModal.tsx
 *
 * Modal popup demandant les identifiants de stockage d'images
 * quand un espace utilise un mode non-local (azure, s3, dropbox, gdrive)
 * et que les identifiants ne sont pas encore configurés sur cette machine.
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { KeyRound } from 'lucide-react'
import { cn } from '../utils/global'
import type { SpaceCredentials } from './Settings'

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2.5 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-holo-text">{label}</span>
      {children}
    </label>
  )
}

function PasswordInput({ value, onChange, placeholder }: { value?: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-holo-text-faint" />
      <input
        type="password"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? '••••••••'}
        className={cn(inputCls, 'pl-9')}
      />
    </div>
  )
}

// ─── Labels par mode ──────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  azure: 'Azure Blob Storage',
  s3: 'Amazon S3 / compatible',
  dropbox: 'Dropbox',
  gdrive: 'Google Drive',
}

// ─── Composant ────────────────────────────────────────────────────────────────

export interface SpaceCredentialsModalProps {
  spacePath: string
  mode: string
  onSave: (credentials: SpaceCredentials) => Promise<void>
  onDismiss: () => void
}

export function SpaceCredentialsModal({ spacePath, mode, onSave, onDismiss }: SpaceCredentialsModalProps) {
  const [creds, setCreds] = useState<SpaceCredentials>({})
  const [saving, setSaving] = useState(false)

  const spaceName = spacePath.replace(/\\/g, '/').split('/').filter(Boolean).at(-1) ?? spacePath
  const modeLabel = MODE_LABELS[mode] ?? mode

  function set<K extends keyof SpaceCredentials>(key: K) {
    return (v: string) => setCreds((p) => ({ ...p, [key]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave(creds)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/62 backdrop-blur-xl" onClick={onDismiss} />

      {/* Dialog */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-[1.4rem] border border-holo-border-soft bg-holo-bg/95 p-6 shadow-[0_30px_110px_rgba(0,0,0,.58),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl"
      >
        <h2 className="mb-1 text-base font-semibold text-holo-text">Identifiants requis</h2>
        <p className="mb-5 text-sm text-holo-text-faint">
          L'espace <span className="font-medium text-holo-text">{spaceName}</span> utilise le mode{' '}
          <span className="font-medium text-holo-text">{modeLabel}</span> pour le stockage des images.
          Saisissez vos identifiants pour cette machine.
        </p>

        <div className="space-y-4">
          {mode === 'azure' && (
            <>
              <Field label="Azure Container URL">
                <input
                  type="url"
                  value={creds.azureContainerUrl ?? ''}
                  onChange={(e) => set('azureContainerUrl')(e.target.value)}
                  placeholder="https://xxx.blob.core.windows.net/container"
                  className={inputCls}
                />
              </Field>
              <Field label="SAS Token">
                <PasswordInput value={creds.azureSasToken} onChange={set('azureSasToken')} />
              </Field>
            </>
          )}

          {mode === 's3' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Région">
                  <input
                    value={creds.s3Region ?? ''}
                    onChange={(e) => set('s3Region')(e.target.value)}
                    placeholder="eu-west-1"
                    className={inputCls}
                  />
                </Field>
                <Field label="Bucket">
                  <input
                    value={creds.s3Bucket ?? ''}
                    onChange={(e) => set('s3Bucket')(e.target.value)}
                    placeholder="mon-bucket"
                    className={inputCls}
                  />
                </Field>
              </div>
              <Field label="Access Key ID">
                <PasswordInput value={creds.s3AccessKeyId} onChange={set('s3AccessKeyId')} placeholder="AKIA…" />
              </Field>
              <Field label="Secret Access Key">
                <PasswordInput value={creds.s3SecretAccessKey} onChange={set('s3SecretAccessKey')} />
              </Field>
              <Field label="Endpoint (optionnel)">
                <input
                  value={creds.s3Endpoint ?? ''}
                  onChange={(e) => set('s3Endpoint')(e.target.value)}
                  placeholder="https://s3.xxx.com"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {mode === 'dropbox' && (
            <>
              <Field label="Access Token">
                <PasswordInput value={creds.dropboxAccessToken} onChange={set('dropboxAccessToken')} />
              </Field>
              <Field label="Dossier Dropbox (optionnel)">
                <input
                  value={creds.dropboxFolderPath ?? ''}
                  onChange={(e) => set('dropboxFolderPath')(e.target.value)}
                  placeholder="/holo-images"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {mode === 'gdrive' && (
            <>
              <Field label="Access Token">
                <PasswordInput value={creds.gdriveAccessToken} onChange={set('gdriveAccessToken')} />
              </Field>
              <Field label="ID du dossier (optionnel)">
                <input
                  value={creds.gdriveFolderId ?? ''}
                  onChange={(e) => set('gdriveFolderId')(e.target.value)}
                  placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                  className={inputCls}
                />
              </Field>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-holo-lg border border-holo-border-soft bg-transparent px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass"
          >
            Ignorer
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-holo-lg bg-holo-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-holo-primary/90 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
