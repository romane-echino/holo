import { getBaseName } from '../lib/appUtils'
import type { GitState } from '../types/git'

type SyncFeedback = {
  status: 'idle' | 'success' | 'warning' | 'error'
  message: string | null
  at: string | null
}

interface SidebarGitPanelProps {
  isCompactLayout: boolean
  rootPath: string | null
  gitState: GitState
  isGitBusy: boolean
  syncFeedback: SyncFeedback
  conflictedFiles: string[]
  gitAuthErrorActive: boolean
  onSyncRepository: () => Promise<void>
  onOpenCommitDialog: () => void
  onPullChanges: () => Promise<void>
  onOpenMergeDialog: () => void
  onFetchChanges: () => Promise<void>
  onRefreshGitState: (fetchRemote?: boolean) => Promise<void>
  onSetShowGitAuthHelp: (show: boolean) => void
  onSetShowSettings: (show: boolean) => void
  onResolveConflictChoice: (filePath: string, choice: 'ours' | 'theirs') => Promise<void>
  onOpenConflictedFile: (filePath: string) => Promise<void>
}

export function SidebarGitPanel({
  isCompactLayout,
  rootPath,
  gitState,
  isGitBusy,
  syncFeedback,
  conflictedFiles,
  gitAuthErrorActive,
  onSyncRepository,
  onOpenCommitDialog,
  onPullChanges,
  onOpenMergeDialog,
  onFetchChanges,
  onRefreshGitState,
  onSetShowGitAuthHelp,
  onSetShowSettings,
  onResolveConflictChoice,
  onOpenConflictedFile,
}: SidebarGitPanelProps) {
  return (
    <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
      <div>
        <h2 className="text-sm font-semibold text-white/80">🌿 Git</h2>
      </div>

      {!rootPath ? (
        <p className="text-xs text-white/40 text-center py-8">Ouvre un dossier pour utiliser Git</p>
      ) : !gitState.isRepo ? (
        <p className="text-xs text-white/40 text-center py-8">Ce dossier n'est pas un dépôt Git</p>
      ) : (
        <>
          {/* Branche et indicateurs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Branche</span>
              <span className="text-xs font-semibold text-[#7B61FF]">{gitState.branch ?? '?'}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                <div className="text-[10px] text-white/50">Local</div>
                <div className="text-xs font-bold text-white/80">✏️ {gitState.localChanges}</div>
              </div>
              <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                <div className="text-[10px] text-white/50">Sortants</div>
                <div className="text-xs font-bold text-white/80">⬆️ {gitState.outgoing}</div>
              </div>
              <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                <div className="text-[10px] text-white/50">Entrants</div>
                <div className="text-xs font-bold text-white/80">⬇️ {gitState.incoming}</div>
              </div>
            </div>
          </div>

          {/* Bouton Synchroniser */}
          <button
            className="px-3 py-2 rounded text-xs font-bold bg-[#7B61FF] text-white hover:bg-[#6D4FD8] disabled:opacity-50 disabled:bg-[#7B61FF]/50 flex items-center justify-center gap-2"
            onClick={() => void onSyncRepository()}
            disabled={isGitBusy}
            title="Synchroniser avec le dépôt distant"
          >
            {isGitBusy ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-xs" />
                Synchro...
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrows-rotate text-xs" />
                Synchroniser
              </>
            )}
          </button>

          {/* Boutons secondaires */}
          <div className="flex flex-wrap gap-2">
            <button
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
              onClick={onOpenCommitDialog}
              disabled={isGitBusy || gitState.localChanges === 0}
              title="Créer un commit"
            >
              <i className="fa-solid fa-check mr-1" />Commit
            </button>
            <button
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
              onClick={() => void onPullChanges()}
              disabled={isGitBusy}
              title="Tirer les changements"
            >
              <i className="fa-solid fa-arrow-down mr-1" />Pull
            </button>
            <button
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
              onClick={onOpenMergeDialog}
              disabled={isGitBusy}
              title="Fusionner une branche"
            >
              <i className="fa-solid fa-code-merge mr-1" />Merge
            </button>
            <button
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
              onClick={() => void onFetchChanges()}
              disabled={isGitBusy}
              title="Récupérer les changements distants"
            >
              <i className="fa-solid fa-download mr-1" />Fetch
            </button>
            <button
              className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
              onClick={() => void onRefreshGitState(false)}
              disabled={isGitBusy}
              title="Rafraîchir l'état Git"
            >
              <i className="fa-solid fa-arrow-rotate-right mr-1" />Raf.
            </button>
          </div>

          {/* Feedback de synchro */}
          {syncFeedback.message && (
            <div
              className={`rounded px-3 py-2 text-xs space-y-1 ${
                syncFeedback.status === 'success'
                  ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-200'
                  : syncFeedback.status === 'warning'
                    ? 'bg-amber-900/30 border border-amber-700/50 text-amber-200'
                    : 'bg-red-900/30 border border-red-700/50 text-red-200'
              }`}
            >
              <p className="font-medium text-[10px] leading-tight">{syncFeedback.message}</p>
              {syncFeedback.at && (
                <p className="text-[9px] opacity-60">{new Date(syncFeedback.at).toLocaleTimeString()}</p>
              )}
            </div>
          )}

          {/* Erreur Git */}
          {gitState.error && (
            <div className="rounded px-3 py-2 text-xs bg-red-900/30 border border-red-700/50 text-red-200">
              <p className="font-medium text-[10px]">{gitState.error}</p>
            </div>
          )}

          {gitAuthErrorActive && (
            <div className="rounded px-3 py-2 text-xs border border-amber-700/50 bg-amber-900/20 text-amber-100">
              <p className="font-medium text-[10px]">Problème d'authentification détecté.</p>
              <p className="mt-1 text-[10px] text-amber-200/85">
                Les identifiants Git ne sont pas saisis dans Holo : ils sont gérés par Git (SSH / Credential Manager du système).
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-100 hover:bg-amber-400/15"
                  onClick={() => onSetShowGitAuthHelp(true)}
                >
                  Aide connexion
                </button>
                <button
                  className="rounded border border-white/20 px-2 py-1 text-[10px] text-white/85 hover:bg-white/10"
                  onClick={() => onSetShowSettings(true)}
                >
                  Ouvrir paramètres
                </button>
              </div>
            </div>
          )}

          {/* Last fetch */}
          {gitState.lastFetchAt && (
            <p className="text-[10px] text-white/40 text-center">
              Fetch: {new Date(gitState.lastFetchAt).toLocaleTimeString()}
            </p>
          )}

          {/* Conflicted files */}
          {conflictedFiles.length > 0 && (
            <div className="rounded px-3 py-2 border border-amber-700/50 bg-amber-900/20 space-y-2">
              <p className="text-[10px] font-bold text-amber-200">⚠️ {conflictedFiles.length} conflit(s)</p>
              <ul className="space-y-1">
                {conflictedFiles.map((filePath) => (
                  <li key={filePath}>
                    <div className="rounded border border-amber-700/30 bg-white/5 p-1.5">
                      <button
                        className="mb-1 w-full truncate rounded px-1.5 py-1 text-left text-[9px] text-amber-100 hover:bg-amber-900/20"
                        onClick={() => void onOpenConflictedFile(filePath)}
                        title={filePath}
                      >
                        {getBaseName(filePath)}
                      </button>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          className="rounded border border-emerald-600/40 bg-emerald-900/20 px-1.5 py-1 text-[9px] text-emerald-100 hover:bg-emerald-800/30 disabled:opacity-50"
                          onClick={() => void onResolveConflictChoice(filePath, 'ours')}
                          disabled={isGitBusy}
                          title="Garder ta version locale"
                        >
                          Garder local
                        </button>
                        <button
                          className="rounded border border-sky-600/40 bg-sky-900/20 px-1.5 py-1 text-[9px] text-sky-100 hover:bg-sky-800/30 disabled:opacity-50"
                          onClick={() => void onResolveConflictChoice(filePath, 'theirs')}
                          disabled={isGitBusy}
                          title="Prendre la version du serveur"
                        >
                          Prendre serveur
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </nav>
  )
}
