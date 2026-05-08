import React from 'react'
import type {
  NameDialog,
  GitDialog,
  CloneDialog,
  ConfirmDialogState,
  ChangelogEntry,
  LinkDialogState,
  TemplateOption,
} from '../types/shared'

interface AppModalsProps {
  // Changelog
  showChangelogModal: boolean
  selectedChangelogEntry: ChangelogEntry | null
  appVersion: string | null
  onCloseChangelog: () => void
  onMarkChangelogSeen: () => void

  // Unsaved changes
  showUnsavedChangesModal: boolean
  onCancelUnsaved: () => void
  onConfirmUnsaved: () => void

  // Generic confirm
  confirmDialog: ConfirmDialogState | null
  onResolveConfirm: (confirmed: boolean) => void

  // Link dialog
  linkDialog: LinkDialogState | null
  linkPageSuggestions: string[]
  onSetLinkDialog: (dialog: LinkDialogState | null) => void
  onClearLinkSavedRange: () => void
  onInsertLink: (text: string, url: string) => void
  onLinkSuggestionClick: (filePath: string) => void
  activeTabPath: string | null
  rootPath: string | null
  getRelativeLinkPath: (from: string | null, to: string, root: string | null) => string
  getBaseName: (path: string) => string

  // Git auth help
  showGitAuthHelp: boolean
  onCloseGitAuthHelp: () => void
  onGitAuthOpenSettings: () => void
  onGitAuthRetryFetch: () => void

  // Name dialog (create file/folder, rename)
  nameDialog: NameDialog | null
  templateOptions: TemplateOption[]
  onSetNameDialog: React.Dispatch<React.SetStateAction<NameDialog | null>>
  onSubmitNameDialog: () => void

  // Clone dialog
  cloneDialog: CloneDialog | null
  onSetCloneDialog: React.Dispatch<React.SetStateAction<CloneDialog | null>>
  onSubmitCloneDialog: () => void
  onPickCloneDirectory: () => void

  // Git commit/merge
  gitDialog: GitDialog | null
  onSetGitDialog: React.Dispatch<React.SetStateAction<GitDialog | null>>
  onSubmitGitDialog: () => void

  // Update
  updateAvailable: boolean
  updateReady: boolean
  updateProgress: number
  onDismissUpdate: () => void
  onInstallUpdate: () => void
}

export const AppModals: React.FC<AppModalsProps> = ({
  showChangelogModal,
  selectedChangelogEntry,
  appVersion,
  onCloseChangelog,
  onMarkChangelogSeen,
  showUnsavedChangesModal,
  onCancelUnsaved,
  onConfirmUnsaved,
  confirmDialog,
  onResolveConfirm,
  linkDialog,
  linkPageSuggestions,
  onSetLinkDialog,
  onClearLinkSavedRange,
  onInsertLink,
  onLinkSuggestionClick,
  activeTabPath,
  rootPath,
  getRelativeLinkPath,
  getBaseName,
  showGitAuthHelp,
  onCloseGitAuthHelp,
  onGitAuthOpenSettings,
  onGitAuthRetryFetch,
  nameDialog,
  templateOptions,
  onSetNameDialog,
  onSubmitNameDialog,
  cloneDialog,
  onSetCloneDialog,
  onSubmitCloneDialog,
  onPickCloneDirectory,
  gitDialog,
  onSetGitDialog,
  onSubmitGitDialog,
  updateAvailable,
  updateReady,
  updateProgress,
  onDismissUpdate,
  onInstallUpdate,
}) => {
  return (
    <>
      {/* Changelog modal */}
      {showChangelogModal && selectedChangelogEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-solid fa-sparkles text-[#7B61FF]" />
                Nouveautés v{selectedChangelogEntry.version}
              </h2>
              <button
                className="text-white/40 hover:text-white transition-colors"
                onClick={() => {
                  if (selectedChangelogEntry.version === appVersion) {
                    onMarkChangelogSeen()
                  }
                  onCloseChangelog()
                }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="mb-3 text-xs text-white/45">Publié le {selectedChangelogEntry.releasedAt}</p>
              <ul className="space-y-2 text-sm text-white/80">
                {selectedChangelogEntry.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1 text-[#7B61FF]">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end border-t border-white/8 px-6 py-4">
              <button
                className="rounded-lg bg-[#7B61FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#9d8bff] transition-colors"
                onClick={() => {
                  if (selectedChangelogEntry.version === appVersion) {
                    onMarkChangelogSeen()
                  }
                  onCloseChangelog()
                }}
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved changes modal */}
      {showUnsavedChangesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-amber-400" />
                Modifications non sauvegardées
              </h2>
            </div>
            <div className="px-6 py-5 text-sm text-white/75">
              Le fichier courant contient des modifications non sauvegardées. Continuer sans sauvegarder ?
            </div>
            <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
              <button
                className="rounded px-3 py-1.5 text-sm text-white/65 hover:text-white"
                onClick={onCancelUnsaved}
              >
                Annuler
              </button>
              <button
                className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm text-white hover:bg-[#9d8bff]"
                onClick={onConfirmUnsaved}
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Generic confirm modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white">{confirmDialog.title}</h2>
            </div>
            <div className="px-6 py-5 text-sm text-white/75 whitespace-pre-line">{confirmDialog.message}</div>
            <div className="flex justify-end gap-2 border-t border-white/8 px-6 py-4">
              <button
                className="rounded px-3 py-1.5 text-sm text-white/65 hover:text-white"
                onClick={() => onResolveConfirm(false)}
              >
                {confirmDialog.cancelLabel ?? 'Annuler'}
              </button>
              <button
                className={`rounded px-3 py-1.5 text-sm text-white ${confirmDialog.intent === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-[#7B61FF] hover:bg-[#9d8bff]'}`}
                onClick={() => onResolveConfirm(true)}
              >
                {confirmDialog.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link dialog */}
      {linkDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="mb-4 text-base font-semibold text-white">Insérer un lien</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs text-white/50">Texte affiché</label>
                <input
                  className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/60"
                  placeholder="Mon lien"
                  autoFocus
                  value={linkDialog.text}
                  onChange={(e) => onSetLinkDialog({ ...linkDialog, text: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Escape') onSetLinkDialog(null) }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">URL</label>
                <input
                  className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/60"
                  placeholder="https://…"
                  value={linkDialog.url}
                  onChange={(e) => onSetLinkDialog({ ...linkDialog, url: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { onSetLinkDialog(null); onClearLinkSavedRange(); return }
                    if (e.key === 'Enter') {
                      const text = linkDialog.text.trim() || linkDialog.url.trim()
                      const url = linkDialog.url.trim()
                      if (!url) { onSetLinkDialog(null); onClearLinkSavedRange(); return }
                      onInsertLink(text, url)
                      onSetLinkDialog(null)
                    }
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-white/50">Page du projet (lien relatif)</label>
                <input
                  className="w-full rounded border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/60"
                  placeholder="Rechercher un fichier .md"
                  value={linkDialog.pageQuery ?? ''}
                  onChange={(e) => onSetLinkDialog({ ...linkDialog, pageQuery: e.target.value })}
                />
                {linkPageSuggestions.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded border border-white/10 bg-white/5 p-1">
                    {linkPageSuggestions.map((filePath) => {
                      const relativePath = getRelativeLinkPath(activeTabPath, filePath, rootPath)
                      const label = getBaseName(filePath).replace(/\.md$/i, '')
                      return (
                        <button
                          key={filePath}
                          type="button"
                          className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
                          onClick={() => onLinkSuggestionClick(filePath)}
                        >
                          <span className="truncate pr-2">{label}</span>
                          <span className="truncate text-[10px] text-white/45">{relativePath}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="rounded px-3 py-1.5 text-sm text-white/60 hover:text-white"
                  onClick={() => { onSetLinkDialog(null); onClearLinkSavedRange() }}
                >Annuler</button>
                <button
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm text-white hover:bg-[#9d8bff]"
                  onClick={() => {
                    const text = linkDialog.text.trim() || linkDialog.url.trim()
                    const url = linkDialog.url.trim()
                    if (!url) { onSetLinkDialog(null); onClearLinkSavedRange(); return }
                    onInsertLink(text, url)
                    onSetLinkDialog(null)
                  }}
                >Insérer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Git auth help modal */}
      {showGitAuthHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-solid fa-key text-amber-300" />
                Connexion Git
              </h2>
              <button
                className="text-white/40 hover:text-white transition-colors"
                onClick={onCloseGitAuthHelp}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm text-white/80">
              <p>Holo n'enregistre pas de login/mot de passe Git. Les accès distants sont gérés par Git lui-même.</p>
              <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/75 space-y-1">
                <p className="font-semibold text-white/85">Où sont stockés les identifiants ?</p>
                <p>- SSH: dans ta clé privée locale (`~/.ssh`) + clé publique enregistrée côté forge.</p>
                <p>- HTTPS: dans le credential manager du système (ou helper Git configuré).</p>
              </div>
              <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/75 space-y-1">
                <p className="font-semibold text-white/85">Quand les saisir ?</p>
                <p>- Au premier `fetch/pull/push` en HTTPS (invite système Git), puis mémorisation par le helper.</p>
                <p>- En SSH, aucune saisie récurrente si la clé est déjà configurée.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  className="rounded px-3 py-1.5 text-sm text-white/60 hover:text-white"
                  onClick={onGitAuthOpenSettings}
                >
                  Paramètres
                </button>
                <button
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm text-white hover:bg-[#9d8bff]"
                  onClick={onGitAuthRetryFetch}
                >
                  Retenter Fetch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Name dialog (create file/folder, rename) */}
      {nameDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">
              {nameDialog.mode === 'create-file'
                ? 'Créer un fichier'
                : nameDialog.mode === 'create-directory'
                  ? 'Créer un dossier'
                  : 'Renommer'}
            </h2>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                onSubmitNameDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={nameDialog.value}
                onChange={(event) =>
                  onSetNameDialog((previous) =>
                    previous ? { ...previous, value: event.target.value } : previous,
                  )
                }
                placeholder="Nom"
              />

              {nameDialog.mode === 'create-file' && (
                <div className="mt-3 space-y-1.5">
                  <label className="block text-xs font-medium text-white/60">Modèle</label>
                  <select
                    className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-[#7B61FF] focus:bg-white/10"
                    value={nameDialog.selectedTemplatePath ?? ''}
                    onChange={(event) =>
                      onSetNameDialog((previous) =>
                        previous && previous.mode === 'create-file'
                          ? { ...previous, selectedTemplatePath: event.target.value || null }
                          : previous,
                      )
                    }
                  >
                    <option value="">Aucun modèle</option>
                    {templateOptions.map((template) => (
                      <option key={template.path} value={template.path}>
                        {template.label}{template.description ? ` — ${template.description}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {nameDialog.mode === 'create-file' &&
                nameDialog.templateVariables &&
                Object.keys(nameDialog.templateVariables).length > 0 && (
                  <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium text-white/60">Variables du modèle</label>
                    {Object.entries(nameDialog.templateVariables).map(([varName, varValue]) => (
                      <div key={varName} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-xs text-white/50 font-mono">{varName}</span>
                        <input
                          className="flex-1 rounded border border-white/20 bg-white/5 px-2 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-[#7B61FF] focus:bg-white/10"
                          value={varValue}
                          placeholder={`Valeur pour ${varName}`}
                          onChange={(event) => {
                            const val = event.target.value
                            onSetNameDialog((prev) =>
                              prev && prev.mode === 'create-file' && prev.templateVariables
                                ? { ...prev, templateVariables: { ...prev.templateVariables, [varName]: val } }
                                : prev,
                            )
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => onSetNameDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8]"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clone dialog */}
      {cloneDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">Cloner un dépôt Git</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault()
                onSubmitCloneDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={cloneDialog.repoUrl}
                onChange={(event) =>
                  onSetCloneDialog((previous) =>
                    previous ? { ...previous, repoUrl: event.target.value } : previous,
                  )
                }
                placeholder="https://git.example.com/group/project.git"
              />
              <div className="flex items-center gap-2">
                <input
                  className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white/80 outline-none placeholder:text-white/35"
                  value={cloneDialog.destinationPath}
                  onChange={(event) =>
                    onSetCloneDialog((previous) =>
                      previous ? { ...previous, destinationPath: event.target.value } : previous,
                    )
                  }
                  placeholder="Dossier de destination"
                />
                <button
                  type="button"
                  className="shrink-0 rounded border border-white/20 px-3 py-2 text-xs text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={onPickCloneDirectory}
                >
                  Choisir
                </button>
              </div>
              <input
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={cloneDialog.username}
                onChange={(event) =>
                  onSetCloneDialog((previous) =>
                    previous ? { ...previous, username: event.target.value } : previous,
                  )
                }
                placeholder="Nom d'utilisateur (optionnel)"
              />
              <input
                type="password"
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={cloneDialog.password}
                onChange={(event) =>
                  onSetCloneDialog((previous) =>
                    previous ? { ...previous, password: event.target.value } : previous,
                  )
                }
                placeholder="Mot de passe (optionnel)"
              />
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => onSetCloneDialog(null)}
                  disabled={cloneDialog.isSubmitting}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8] disabled:opacity-50"
                  disabled={cloneDialog.isSubmitting}
                >
                  {cloneDialog.isSubmitting ? 'Clonage...' : 'Cloner et ouvrir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Git commit/merge dialog */}
      {gitDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-white">
              {gitDialog.mode === 'commit' ? 'Nouveau commit' : 'Merge une branche'}
            </h2>
            <form
              className="mt-4"
              onSubmit={(event) => {
                event.preventDefault()
                onSubmitGitDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-white/20 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7B61FF] focus:bg-white/10"
                value={gitDialog.value}
                onChange={(event) =>
                  onSetGitDialog((previous) =>
                    previous ? { ...previous, value: event.target.value } : previous,
                  )
                }
                placeholder={gitDialog.mode === 'commit' ? 'Message de commit' : 'Nom de branche'}
              />
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-white/20 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  onClick={() => onSetGitDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8]"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* App update modal */}
      {updateAvailable && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <i className="fa-regular fa-cloud-arrow-down text-[#7B61FF] text-2xl" />
              <h2 className="text-lg font-semibold text-white">Mise à jour disponible</h2>
            </div>
            <p className="mt-4 text-sm text-white/70">
              Une nouvelle version de Holo est disponible et est en train d'être téléchargée.
            </p>
            {updateReady ? (
              <>
                <p className="mt-4 text-sm text-white/70">Téléchargement terminé. Redémarrez pour installer.</p>
                <div className="mt-6 flex gap-2">
                  <button
                    className="flex-1 rounded border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
                    onClick={onDismissUpdate}
                  >
                    Plus tard
                  </button>
                  <button
                    className="flex-1 rounded bg-[#7B61FF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#6D4FD8]"
                    onClick={onInstallUpdate}
                  >
                    Redémarrer et installer
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4">
                  <div className="h-2 w-full rounded-full bg-white/10">
                    <div
                      className="h-2 rounded-full bg-[#7B61FF] transition-all"
                      style={{ width: `${updateProgress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-white/50">{updateProgress}%</p>
                </div>
                <div className="mt-6">
                  <button
                    className="w-full rounded border border-white/20 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/5"
                    onClick={onDismissUpdate}
                  >
                    En arrière-plan
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
