import { useState } from 'react'
import { AbstractPopup } from '../parts/AbstractPopup'
import { useGetHoloApi } from '../hooks/useGetHoloApi'
import { useWorkspaceFolders } from '../hooks/useWorkspaceFolders'
import { useConfig } from '../contexts/ConfigContext'
import { normalizeGitState } from '../lib/gitUtils'
import { cn } from '../utils/global'
import { Folder, GitBranch, FolderOpen, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Tab = 'folder' | 'clone'

type AddSpaceProps = {
  open: boolean
  onClose: () => void
}

const inputClassName =
  'w-full rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text placeholder:text-holo-text-faint transition focus:border-holo-primary/40 focus:bg-white/[0.045] focus:shadow-[0_0_0_4px_rgba(123,97,255,.10)] focus:outline-none'

const primaryButtonClassName =
  'rounded-holo-md bg-holo-primary px-4 py-2 text-sm font-medium text-white shadow-[0_10px_34px_rgba(123,97,255,.22)] transition hover:bg-holo-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50'

export function AddSpace({ open, onClose }: AddSpaceProps) {
  const [tab, setTab] = useState<Tab>('folder')

  // Clone form
  const [repoUrl, setRepoUrl] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const { getHoloApi } = useGetHoloApi()
  const { openFolder, applyOpenedFolder, refreshRecentFolders } = useWorkspaceFolders({ getHoloApi })
  const { setGitState } = useConfig()

  const handleClose = () => {
    setRepoUrl('')
    setDestinationPath('')
    setUsername('')
    setPassword('')
    setShowAuth(false)
    setIsSubmitting(false)
    setErrorMessage(null)
    setTab('folder')
    onClose()
  }

  // ── Ouvrir un dossier local ──────────────────────────────────────────────────
  const handleOpenFolder = async () => {
    try {
      await openFolder()
    } catch (error) {
      window.alert((error as Error).message)
    } finally {
      // Toujours refermer la fenêtre, même si l'ouverture a échoué côté git,
      // pour éviter qu'elle ne reste affichée indéfiniment.
      handleClose()
    }
  }

  // ── Cloner un dépôt Git ──────────────────────────────────────────────────────
  const handlePickDirectory = async () => {
    const holo = getHoloApi()
    if (!holo) return
    const selected = await holo.gitPickCloneDirectory()
    if (selected) setDestinationPath(selected)
  }

  const handleClone = async () => {
    if (!repoUrl.trim()) {
      window.alert('Le lien du dépôt est requis.')
      return
    }

    if (!destinationPath.trim()) {
      window.alert('Choisis un dossier de destination.')
      return
    }

    const holo = getHoloApi()
    if (!holo) return

    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await holo.gitCloneRepository({
        repoUrl: repoUrl.trim(),
        destinationPath: destinationPath.trim(),
        username: username.trim() || undefined,
        password: password.trim() || undefined,
      })

      applyOpenedFolder(result)
      await refreshRecentFolders()

      const nextGitState = await holo.gitGetState(true)
      setGitState(normalizeGitState(nextGitState))

      handleClose()
    } catch (error) {
      // On garde le popup ouvert avec les champs intacts et éditables, et on
      // déplie la section d'authentification pour permettre de corriger les
      // identifiants puis de réessayer directement.
      setErrorMessage((error as Error).message)
      setShowAuth(true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const footer = (
    <>
      <button
        onClick={handleClose}
        className="rounded-holo-md px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
      >
        Annuler
      </button>

      {tab === 'folder' ? (
        <button onClick={handleOpenFolder} className={primaryButtonClassName}>
          Choisir un dossier
        </button>
      ) : (
        <button onClick={handleClone} disabled={isSubmitting} className={primaryButtonClassName}>
          {isSubmitting ? 'Clonage…' : 'Cloner'}
        </button>
      )}
    </>
  )

  return (
    <AbstractPopup
      open={open}
      title="Ajouter un espace"
      description="Ouvre un dossier local ou clone un dépôt Git distant."
      onClose={handleClose}
      size="sm"
      footer={footer}
    >
      {/* Sélecteur d'onglets */}
      <div className="mb-6 flex gap-1 rounded-holo-lg bg-holo-glass p-1">
        {([
          ['folder', 'Dossier local', Folder],
          ['clone', 'Dépôt Git', GitBranch],
        ] as Array<[Tab, string, LucideIcon]>).map(
          ([value, label, Icon]) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-holo-md py-2 text-sm transition active:scale-[0.99]',
                tab === value
                  ? 'bg-holo-glass-strong text-holo-text shadow-[0_6px_24px_rgba(0,0,0,.22)] ring-1 ring-white/[0.05]'
                  : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
              )}
            >
              <Icon size={13} />
              {label}
            </button>
          ),
        )}
      </div>

      {/* Onglet : Dossier local */}
      {tab === 'folder' && (
        <div className="flex flex-col items-center gap-4 py-5 text-center">
          <div className="flex size-16 items-center justify-center rounded-holo-2xl border border-white/[0.04] bg-holo-glass shadow-[0_8px_30px_rgba(0,0,0,.22)]">
            <FolderOpen size={24} className="text-holo-text-muted" />
          </div>

          <div>
            <p className="text-sm font-medium text-holo-text">Ouvrir un dossier</p>
            <p className="mt-1 text-sm leading-6 text-holo-text-faint">
              Sélectionne n'importe quel dossier sur ton système de fichiers.
            </p>
          </div>
        </div>
      )}

      {/* Onglet : Cloner un dépôt */}
      {tab === 'clone' && (
        <div className="space-y-4">
          {/* URL du dépôt */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-holo-text-muted">
              URL du dépôt <span className="text-holo-danger">*</span>
            </label>

            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className={inputClassName}
            />
          </div>

          {/* Dossier de destination */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-holo-text-muted">
              Dossier de destination <span className="text-holo-danger">*</span>
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={destinationPath}
                onChange={(e) => setDestinationPath(e.target.value)}
                placeholder="/home/user/projets"
                className={cn('min-w-0 flex-1', inputClassName)}
              />

              <button
                onClick={handlePickDirectory}
                className="shrink-0 rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
                title="Parcourir"
                aria-label="Parcourir les dossiers"
              >
                <Folder size={13} />
              </button>
            </div>
          </div>

          {/* Authentification (optionnelle) */}
          <div>
            <button
              onClick={() => setShowAuth((v) => !v)}
              className="flex items-center gap-1.5 rounded-holo-sm text-xs text-holo-text-faint transition hover:text-holo-text-muted"
            >
              <ChevronRight size={10} className={cn('transition-transform', showAuth && 'rotate-90')} />
              Authentification (optionnelle)
            </button>

            {showAuth && (
              <div className="mt-3 space-y-3 rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-holo-text-muted">
                    Nom d'utilisateur
                  </label>

                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-holo-text-muted">
                    Token / mot de passe
                  </label>

                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClassName}
                  />
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <p className="rounded-holo-md border border-holo-danger/30 bg-holo-danger/10 px-3 py-2 text-xs leading-5 text-holo-danger">
              {errorMessage}
            </p>
          )}
        </div>
      )}
    </AbstractPopup>
  )
}
