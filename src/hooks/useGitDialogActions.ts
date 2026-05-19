import { useCallback } from 'react'
import type { GitDialog } from '../types/shared'

type UseGitDialogActionsParams = {
  gitStateIsRepo: boolean
  gitDialog: GitDialog | null
  setGitDialog: React.Dispatch<React.SetStateAction<GitDialog | null>>
  setIsGitBusy: React.Dispatch<React.SetStateAction<boolean>>
  getHoloApi: () => Window['holo'] | null
  refreshGitState: (forceRemote: boolean) => Promise<void>
}

export function useGitDialogActions({
  gitStateIsRepo,
  gitDialog,
  setGitDialog,
  setIsGitBusy,
  getHoloApi,
  refreshGitState,
}: UseGitDialogActionsParams) {
  const openCommitDialog = useCallback(() => {
    if (!gitStateIsRepo) {
      window.alert('Le dossier ouvert n est pas un depot Git.')
      return
    }

    setGitDialog({ mode: 'commit', value: '' })
  }, [gitStateIsRepo, setGitDialog])

  const openMergeDialog = useCallback(() => {
    if (!gitStateIsRepo) {
      window.alert('Le dossier ouvert n est pas un depot Git.')
      return
    }

    setGitDialog({ mode: 'merge', value: '' })
  }, [gitStateIsRepo, setGitDialog])

  const submitGitDialog = useCallback(async () => {
    if (!gitDialog) {
      return
    }

    const value = gitDialog.value.trim()

    if (!value) {
      window.alert(gitDialog.mode === 'commit' ? 'Message de commit requis.' : 'Nom de branche requis.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      if (gitDialog.mode === 'commit') {
        const commitResult = await holo.gitCommit(value)

        if (commitResult.pushed) {
          window.alert('Commit cree et envoye automatiquement.')
        } else {
          window.alert(
            `Commit cree localement, mais l envoi automatique a echoue.\n\n${commitResult.pushError ?? 'Fais un pull ou resous les conflits avant de reessayer.'}`,
          )
        }
      } else {
        await holo.gitMerge(value)
      }

      setGitDialog(null)
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, gitDialog, refreshGitState, setGitDialog, setIsGitBusy])

  return {
    openCommitDialog,
    openMergeDialog,
    submitGitDialog,
  }
}
