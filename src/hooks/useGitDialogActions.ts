import { useCallback } from 'react'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'

export function useGitDialogActions({
  getHoloApi,
  refreshGitState,
}: {
  getHoloApi: () => Window['holo'] | null
  refreshGitState: (forceRemote: boolean) => Promise<void>
}) {
  const { gitState, setIsGitBusy } = useConfig()
  const { gitDialog, setGitDialog } = useUI()
  const openCommitDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n est pas un depot Git.')
      return
    }

    setGitDialog({ mode: 'commit', value: '' })
  }, [gitState.isRepo, setGitDialog])

  const openMergeDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n est pas un depot Git.')
      return
    }

    setGitDialog({ mode: 'merge', value: '' })
  }, [gitState.isRepo, setGitDialog])

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
