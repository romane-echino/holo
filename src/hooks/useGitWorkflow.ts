import { useCallback, useEffect } from 'react'
import { getBaseName } from '../lib/appUtils'
import {
  DEFAULT_GIT_STATE,
  getFriendlyGitErrorMessage,
  getRemoteEditBlockFromGitState,
  normalizeGitState,
} from '../lib/gitUtils'
import type { GitState } from '../types/git'
import type { ConfirmDialogState } from '../types/shared'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'

type SyncFeedback = {
  status: 'idle' | 'success' | 'warning' | 'error'
  message: string | null
  at: string | null
}

export const DEFAULT_SYNC_FEEDBACK: SyncFeedback = {
  status: 'idle',
  message: null,
  at: null,
}

type GetHoloApi = () => Window['holo'] | null

export function useGitWorkflow({
  getHoloApi,
  refreshTree,
  refreshActiveTabFromDisk,
  requestConfirmation,
}: {
  getHoloApi: GetHoloApi
  refreshTree: () => Promise<void>
  refreshActiveTabFromDisk: (holo: NonNullable<Window['holo']>) => Promise<void>
  requestConfirmation: (dialog: ConfirmDialogState) => Promise<boolean>
}) {
  const { rootPath } = useWorkspace()
  const { activeTab, activeTabPath } = useEditor()
  const activeTabIsDirty = activeTab?.isDirty ?? false
  const { gitState, isGitBusy, setGitState, setRemoteEditBlock, setSyncFeedback, setIsGitBusy } = useConfig()
  const refreshGitState = useCallback(
    async (fetchRemote = false) => {
      if (!rootPath) {
        setGitState(DEFAULT_GIT_STATE)
        return
      }

      const holo = getHoloApi()

      if (!holo) {
        return
      }

      const nextGitState = await holo.gitGetState(fetchRemote)
      setGitState(normalizeGitState(nextGitState))
    },
    [getHoloApi, rootPath, setGitState],
  )

  const applyRemoteEditBlockFromGitState = useCallback(
    (nextGitState: GitState) => {
      setRemoteEditBlock(getRemoteEditBlockFromGitState(nextGitState))
    },
    [setRemoteEditBlock],
  )

  const checkRemoteFreshnessAndGuardEditing = useCallback(
    async (promptPull: boolean, autoPullIfSafe = false) => {
      if (!rootPath || !gitState.isRepo) {
        setRemoteEditBlock({ isBlocked: false, message: '' })
        return true
      }

      const holo = getHoloApi()

      if (!holo) {
        return true
      }

      let nextState: GitState
      try {
        nextState = normalizeGitState(await holo.gitGetState(true))
      } catch (error) {
        setRemoteEditBlock({ isBlocked: false, message: '' })
        if (promptPull) {
          setSyncFeedback({
            status: 'warning',
            message: getFriendlyGitErrorMessage((error as Error).message),
            at: new Date().toISOString(),
          })
        }
        return true
      }

      setGitState(nextState)
      applyRemoteEditBlockFromGitState(nextState)

      if (nextState.incoming <= 0) {
        return true
      }

      const canAutoPullSafely =
        autoPullIfSafe
        && !isGitBusy
        && !activeTabIsDirty
        && nextState.localChanges === 0
        && nextState.outgoing === 0

      if (canAutoPullSafely) {
        try {
          await holo.gitPull()
          await refreshTree()

          if (activeTabPath) {
            await refreshActiveTabFromDisk(holo)
          }

          const refreshedState = normalizeGitState(await holo.gitGetState(true))
          setGitState(refreshedState)
          applyRemoteEditBlockFromGitState(refreshedState)
          return refreshedState.incoming <= 0
        } catch {
          return false
        }
      }

      if (!promptPull) {
        return false
      }

      const shouldPullNow = await requestConfirmation({
        title: 'Mise à jour distante disponible',
        message: 'Une version plus récente de ce dépôt est disponible sur le remote.\n\nPull maintenant pour débloquer l’édition ?',
        confirmLabel: 'Pull maintenant',
        cancelLabel: 'Plus tard',
      })

      if (!shouldPullNow) {
        return false
      }

      setIsGitBusy(true)

      try {
        await holo.gitPull()
        await refreshTree()
        const refreshedState = normalizeGitState(await holo.gitGetState(true))
        setGitState(refreshedState)
        applyRemoteEditBlockFromGitState(refreshedState)
        return refreshedState.incoming <= 0
      } catch (error) {
        window.alert((error as Error).message)
        return false
      } finally {
        setIsGitBusy(false)
      }
    },
    [
      activeTabIsDirty,
      activeTabPath,
      applyRemoteEditBlockFromGitState,
      getHoloApi,
      gitState.isRepo,
      isGitBusy,
      refreshActiveTabFromDisk,
      refreshTree,
      requestConfirmation,
      rootPath,
      setGitState,
      setIsGitBusy,
      setRemoteEditBlock,
      setSyncFeedback,
    ],
  )

  const pullChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitPull()
      await refreshGitState(true)
      await checkRemoteFreshnessAndGuardEditing(false)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [checkRemoteFreshnessAndGuardEditing, getHoloApi, refreshGitState, setIsGitBusy])

  const fetchChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitFetch()
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState, setIsGitBusy])

  const syncRepository = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      const syncResult = await holo.gitSync()
      await refreshGitState(true)

      if (syncResult.hadConflicts) {
        const message = `Conflits détectés pendant la synchronisation. ${syncResult.error ?? ''}`.trim()
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(`${message}\n\nOuvre les fichiers listés ci-dessous pour les résoudre.`)
        return
      }

      if (syncResult.error) {
        const message = `Synchronisation partielle : ${getFriendlyGitErrorMessage(syncResult.error)}`
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(message)
        return
      }

      const commitInfo = syncResult.committed
        ? '\n- Commit automatique créé.'
        : '\n- Aucun commit nécessaire.'

      const pushInfo = syncResult.pushed
        ? '\n- Push effectué.'
        : '\n- Aucun push nécessaire.'

      const successMessage = `Synchronisation terminée.${commitInfo}${pushInfo}`
      setSyncFeedback({
        status: 'success',
        message: successMessage,
        at: new Date().toISOString(),
      })
      window.alert(successMessage)
    } catch (error) {
      const friendlyMessage = getFriendlyGitErrorMessage((error as Error).message)
      setSyncFeedback({
        status: 'error',
        message: friendlyMessage,
        at: new Date().toISOString(),
      })
      window.alert(friendlyMessage)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState, setIsGitBusy, setSyncFeedback])

  const resolveConflictChoice = useCallback(
    async (filePath: string, strategy: 'ours' | 'theirs') => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      setIsGitBusy(true)

      try {
        await holo.gitResolveConflict(filePath, strategy)
        await refreshGitState(false)
        await checkRemoteFreshnessAndGuardEditing(false)
        setSyncFeedback({
          status: 'success',
          message: strategy === 'ours'
            ? `Conflit résolu avec la version locale: ${getBaseName(filePath)}`
            : `Conflit résolu avec la version serveur: ${getBaseName(filePath)}`,
          at: new Date().toISOString(),
        })
      } catch (error) {
        window.alert((error as Error).message)
      } finally {
        setIsGitBusy(false)
      }
    },
    [checkRemoteFreshnessAndGuardEditing, getHoloApi, refreshGitState, setIsGitBusy, setSyncFeedback],
  )

  useEffect(() => {
    if (!rootPath) {
      setGitState(DEFAULT_GIT_STATE)
      return
    }

    void refreshGitState(true)
  }, [refreshGitState, rootPath, setGitState])

  useEffect(() => {
    if (!rootPath || !gitState.isRepo) {
      return
    }

    const interval = window.setInterval(() => {
      void checkRemoteFreshnessAndGuardEditing(false, true)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [checkRemoteFreshnessAndGuardEditing, gitState.isRepo, rootPath])

  useEffect(() => {
    if (!activeTabPath) {
      setRemoteEditBlock({ isBlocked: false, message: '' })
    }
  }, [activeTabPath, setRemoteEditBlock])

  return {
    refreshGitState,
    applyRemoteEditBlockFromGitState,
    checkRemoteFreshnessAndGuardEditing,
    pullChanges,
    fetchChanges,
    syncRepository,
    resolveConflictChoice,
  }
}

export type { SyncFeedback }
