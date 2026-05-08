import React from 'react'
import type { ChangelogEntry } from '../types/shared'

type ImageStorageMode = 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'

interface SettingsModalProps {
  // Visibility
  showSettings: boolean
  onClose: () => void

  // Identity
  appAuthor: string
  onSetAppAuthor: (value: string) => void
  gitEmail: string
  onSetGitEmail: (value: string) => void

  // Image storage
  rootPath: string | null
  repoImageStorageMode: ImageStorageMode
  onSetRepoImageStorageMode: (mode: ImageStorageMode) => void
  azureBlobContainerUrl: string
  onSetAzureBlobContainerUrl: (v: string) => void
  azureBlobSasToken: string
  onSetAzureBlobSasToken: (v: string) => void
  s3Region: string
  onSetS3Region: (v: string) => void
  s3Bucket: string
  onSetS3Bucket: (v: string) => void
  s3AccessKeyId: string
  onSetS3AccessKeyId: (v: string) => void
  s3SecretAccessKey: string
  onSetS3SecretAccessKey: (v: string) => void
  s3Endpoint: string
  onSetS3Endpoint: (v: string) => void
  s3PublicBaseUrl: string
  onSetS3PublicBaseUrl: (v: string) => void
  dropboxAccessToken: string
  onSetDropboxAccessToken: (v: string) => void
  dropboxFolderPath: string
  onSetDropboxFolderPath: (v: string) => void
  gdriveAccessToken: string
  onSetGdriveAccessToken: (v: string) => void
  gdriveFolderId: string
  onSetGdriveFolderId: (v: string) => void
  repoImageModeReady: boolean
  onSaveRepoImageConfig: () => void

  // AI
  aiProvider: 'auto' | 'openai' | 'gemini'
  onSetAiProvider: (v: 'auto' | 'openai' | 'gemini') => void
  geminiApiKey: string
  onSetGeminiApiKey: (v: string) => void
  openaiApiKey: string
  onSetOpenaiApiKey: (v: string) => void
  openaiPrompt: string
  onSetOpenaiPrompt: (v: string) => void

  // App / changelog
  appVersion: string | null
  currentVersionChangelog: ChangelogEntry | null
  seenChangelogVersion: string
  changelogEntries: ChangelogEntry[]
  onOpenChangelog: (version: string) => void
  updateAvailable: boolean
  updateReady: boolean
  onCheckForUpdates: () => void
  onInstallUpdate: () => void

  // Share gateway
  shareGatewayBaseUrl: string
  onSetShareGatewayBaseUrl: (v: string) => void

  // Author modal
  showAuthorModal: boolean
  authorModalMode: 'startup' | 'edit'
  authorModalValue: string
  onSetAuthorModalValue: (v: string) => void
  onCloseAuthorModal: () => void
  onSubmitAuthorProfile: () => void
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  showSettings,
  onClose,
  appAuthor,
  onSetAppAuthor,
  gitEmail,
  onSetGitEmail,
  rootPath,
  repoImageStorageMode,
  onSetRepoImageStorageMode,
  azureBlobContainerUrl,
  onSetAzureBlobContainerUrl,
  azureBlobSasToken,
  onSetAzureBlobSasToken,
  s3Region,
  onSetS3Region,
  s3Bucket,
  onSetS3Bucket,
  s3AccessKeyId,
  onSetS3AccessKeyId,
  s3SecretAccessKey,
  onSetS3SecretAccessKey,
  s3Endpoint,
  onSetS3Endpoint,
  s3PublicBaseUrl,
  onSetS3PublicBaseUrl,
  dropboxAccessToken,
  onSetDropboxAccessToken,
  dropboxFolderPath,
  onSetDropboxFolderPath,
  gdriveAccessToken,
  onSetGdriveAccessToken,
  gdriveFolderId,
  onSetGdriveFolderId,
  repoImageModeReady,
  onSaveRepoImageConfig,
  aiProvider,
  onSetAiProvider,
  geminiApiKey,
  onSetGeminiApiKey,
  openaiApiKey,
  onSetOpenaiApiKey,
  openaiPrompt,
  onSetOpenaiPrompt,
  appVersion,
  currentVersionChangelog,
  seenChangelogVersion,
  changelogEntries,
  onOpenChangelog,
  updateAvailable,
  updateReady,
  onCheckForUpdates,
  onInstallUpdate,
  shareGatewayBaseUrl,
  onSetShareGatewayBaseUrl,
  showAuthorModal,
  authorModalMode,
  authorModalValue,
  onSetAuthorModalValue,
  onCloseAuthorModal,
  onSubmitAuthorProfile,
}) => {
  return (
    <>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-solid fa-gear text-[#7B61FF]" />
                Paramètres
              </h2>
              <button
                className="text-white/40 hover:text-white transition-colors"
                onClick={onClose}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[70vh]">
              {/* Section Identité */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Identité</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Nom affiché</label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20"
                      placeholder="Ton prénom ou pseudo"
                      value={appAuthor}
                      onChange={(e) => onSetAppAuthor(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Email Git</label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20"
                      placeholder="toi@example.com"
                      type="email"
                      value={gitEmail}
                      onChange={(e) => onSetGitEmail(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Section stockage d'images */}
              {rootPath && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Stockage d'images (par dépôt)</h3>
                  <div className="flex flex-col gap-3">
                    <p className="text-xs leading-relaxed text-white/45">
                      Le mode est sauvegardé dans <span className="font-mono text-white/70">.holo.json</span>. Les clés restent stockées localement sur cette machine.
                    </p>
                    <div>
                      <label className="mb-1 block text-xs text-white/50">Stockage des images pour ce dépôt</label>
                      <select
                        className="w-full rounded-lg border border-white/10 bg-[#232427] px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50"
                        style={{ colorScheme: 'dark' }}
                        value={repoImageStorageMode}
                        onChange={(e) => onSetRepoImageStorageMode(e.target.value as ImageStorageMode)}
                      >
                        <option value="local">Intégrer au dépôt Git (local)</option>
                        <option value="azure">Azure Blob Storage (SAS)</option>
                        <option value="s3">Amazon S3</option>
                        <option value="dropbox">Dropbox</option>
                        <option value="gdrive">Google Drive</option>
                      </select>
                    </div>
                    {repoImageStorageMode === 'azure' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Azure container URL</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="https://account.blob.core.windows.net/container" value={azureBlobContainerUrl} onChange={(e) => onSetAzureBlobContainerUrl(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Azure SAS token</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="sv=...&se=...&sig=..." type="password" value={azureBlobSasToken} onChange={(e) => onSetAzureBlobSasToken(e.target.value)} />
                        </div>
                      </>
                    )}
                    {repoImageStorageMode === 's3' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">S3 Region</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="eu-west-3" value={s3Region} onChange={(e) => onSetS3Region(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">S3 Bucket</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="my-doc-images" value={s3Bucket} onChange={(e) => onSetS3Bucket(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Access Key ID</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="AKIA..." value={s3AccessKeyId} onChange={(e) => onSetS3AccessKeyId(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Secret Access Key</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="..." type="password" value={s3SecretAccessKey} onChange={(e) => onSetS3SecretAccessKey(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Endpoint (optionnel)</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="https://s3.eu-west-3.amazonaws.com" value={s3Endpoint} onChange={(e) => onSetS3Endpoint(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Public base URL (optionnel)</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="https://cdn.example.com" value={s3PublicBaseUrl} onChange={(e) => onSetS3PublicBaseUrl(e.target.value)} />
                        </div>
                      </>
                    )}
                    {repoImageStorageMode === 'dropbox' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Dropbox access token</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="sl.B..." type="password" value={dropboxAccessToken} onChange={(e) => onSetDropboxAccessToken(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Dropbox dossier (optionnel)</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="/holo-images" value={dropboxFolderPath} onChange={(e) => onSetDropboxFolderPath(e.target.value)} />
                        </div>
                      </>
                    )}
                    {repoImageStorageMode === 'gdrive' && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Google Drive access token</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="ya29...." type="password" value={gdriveAccessToken} onChange={(e) => onSetGdriveAccessToken(e.target.value)} />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-white/50">Google Drive folder ID (optionnel)</label>
                          <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20" placeholder="1AbCdEf..." value={gdriveFolderId} onChange={(e) => onSetGdriveFolderId(e.target.value)} />
                        </div>
                      </>
                    )}
                    <button
                      className="rounded-lg bg-[#7B61FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#9d8bff] transition-colors"
                      onClick={onSaveRepoImageConfig}
                    >
                      Enregistrer configuration
                    </button>
                    {repoImageModeReady && (
                      <p className="text-xs text-emerald-400">✓ Configuration sauvegardée dans .holo.json</p>
                    )}
                  </div>
                </section>
              )}

              {/* Section IA */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Intelligence artificielle</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Provider IA</label>
                    <select
                      className="w-full rounded-lg border border-white/10 bg-[#232427] px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50"
                      style={{ colorScheme: 'dark' }}
                      value={aiProvider}
                      onChange={(e) => onSetAiProvider(e.target.value as 'auto' | 'openai' | 'gemini')}
                    >
                      <option value="auto">Auto (Gemini puis OpenAI)</option>
                      <option value="gemini">Gemini</option>
                      <option value="openai">OpenAI</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Clé API Gemini</label>
                    <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="AIza…" type="password" value={geminiApiKey} onChange={(e) => onSetGeminiApiKey(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Clé API OpenAI</label>
                    <input className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 font-mono" placeholder="sk-…" type="password" value={openaiApiKey} onChange={(e) => onSetOpenaiApiKey(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-white/50">Prompt système</label>
                    <textarea
                      rows={5}
                      className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20 leading-relaxed"
                      value={openaiPrompt}
                      onChange={(e) => onSetOpenaiPrompt(e.target.value)}
                    />
                  </div>
                </div>
              </section>

              {/* Section Application / mises à jour */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">Application</h3>
                <div className="rounded-xl border border-white/8 bg-white/4 p-4 flex flex-col gap-3">
                  <div className="border-b border-white/8 pb-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white/80">Changelog</span>
                      {appVersion && currentVersionChangelog && seenChangelogVersion !== appVersion && (
                        <span className="rounded-full border border-[#7B61FF]/35 bg-[#7B61FF]/15 px-2 py-0.5 text-[10px] font-semibold text-[#c8b8ff]">
                          Nouveau
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {changelogEntries.map((entry) => (
                        <button
                          key={entry.version}
                          type="button"
                          className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-2 text-left text-xs text-white/70 hover:bg-white/8 hover:text-white"
                          onClick={() => onOpenChangelog(entry.version)}
                        >
                          <span className="font-medium">v{entry.version}</span>
                          <span className="text-white/45">{entry.releasedAt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-white/80">Vérifier les mises à jour</span>
                      {updateReady
                        ? <span className="text-xs text-[#7B61FF]">Une mise à jour est prête à installer.</span>
                        : updateAvailable
                          ? <span className="text-xs text-white/50">Téléchargement en cours…</span>
                          : <span className="text-xs text-white/40">Holo est à jour.</span>
                      }
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {updateReady
                        ? (
                            <button
                              className="rounded-lg bg-[#7B61FF] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#9d8bff] transition-colors"
                              onClick={onInstallUpdate}
                            >
                              Redémarrer et installer
                            </button>
                          )
                        : (
                            <button
                              className="rounded-lg border border-white/12 px-3 py-1.5 text-xs font-medium text-white/70 hover:bg-white/8 transition-colors"
                              onClick={onCheckForUpdates}
                            >
                              Vérifier
                            </button>
                          )
                      }
                    </div>
                  </div>
                  <div className="border-t border-white/8 pt-3">
                    <label className="mb-1 block text-xs text-white/50">Passerelle lien HTTPS (Teams)</label>
                    <input
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20"
                      placeholder="https://holo-link-gateway-git-main-romanedonnet-8817s-projects.vercel.app"
                      value={shareGatewayBaseUrl}
                      onChange={(e) => onSetShareGatewayBaseUrl(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-white/35">
                      Si vide, Holo copie un lien direct <span className="font-mono">holo://</span>.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex justify-end border-t border-white/8 px-6 py-4">
              <button
                className="rounded-lg bg-[#7B61FF] px-4 py-2 text-sm font-medium text-white hover:bg-[#9d8bff] transition-colors"
                onClick={onClose}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Author modal */}
      {showAuthorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <i className="fa-regular fa-user text-[#7B61FF]" />
                {authorModalMode === 'startup' ? 'Ton profil' : 'Modifier le profil'}
              </h2>
              {authorModalMode !== 'startup' && (
                <button
                  className="text-white/40 hover:text-white transition-colors"
                  onClick={onCloseAuthorModal}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-white/70">
                {authorModalMode === 'startup'
                  ? "Choisis ton nom pour identifier tes contributions dans l'app."
                  : 'Mets à jour ton nom affiché.'}
              </p>
              <div>
                <label className="mb-1 block text-xs text-white/50">Nom affiché</label>
                <input
                  autoFocus
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/20"
                  placeholder="Ex: Romane"
                  value={authorModalValue}
                  onChange={(e) => onSetAuthorModalValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSubmitAuthorProfile()
                    if (e.key === 'Escape' && authorModalMode !== 'startup') onCloseAuthorModal()
                  }}
                />
              </div>
              <div className="flex justify-end gap-2">
                {authorModalMode !== 'startup' && (
                  <button
                    className="rounded px-3 py-1.5 text-sm text-white/60 hover:text-white"
                    onClick={onCloseAuthorModal}
                  >
                    Annuler
                  </button>
                )}
                <button
                  className="rounded bg-[#7B61FF] px-3 py-1.5 text-sm text-white hover:bg-[#9d8bff] disabled:opacity-50"
                  disabled={!authorModalValue.trim()}
                  onClick={onSubmitAuthorProfile}
                >
                  Valider
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
