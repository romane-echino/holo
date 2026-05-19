import { useCallback } from 'react'
import { normalizeGitState } from '../lib/gitUtils'
import type { CloneDialog } from '../types/shared'
import type { GitState } from '../types/git'
import type { OpenFolderResult } from '../types/app'

type UseCloneWorkflowParams = {
  cloneDialog: CloneDialog | null
  setCloneDialog: React.Dispatch<React.SetStateAction<CloneDialog | null>>
  setGitState: React.Dispatch<React.SetStateAction<GitState>>
  getHoloApi: () => Window['holo'] | null
  applyOpenedFolder: (openedFolder: OpenFolderResult) => void
  refreshRecentFolders: () => Promise<void>
}

export function useCloneWorkflow({
  cloneDialog,
  setCloneDialog,
  setGitState,
  getHoloApi,
  applyOpenedFolder,
  refreshRecentFolders,
}: UseCloneWorkflowParams) {
  const openCloneDialog = useCallback(() => {
    setCloneDialog({
      repoUrl: '',
      destinationPath: '',
      username: '',
      password: '',
      isSubmitting: false,
    })
  }, [setCloneDialog])

  const pickCloneDirectory = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo || !cloneDialog) {
      return
    }

    try {
      const selectedPath = await holo.gitPickCloneDirectory()

      if (!selectedPath) {
        return
      }

      setCloneDialog((previous) =>
        previous
          ? {
              ...previous,
              destinationPath: selectedPath,
            }
          : previous,
      )
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [cloneDialog, getHoloApi, setCloneDialog])

  const submitCloneDialog = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo || !cloneDialog) {
      return
    }

    const repoUrl = cloneDialog.repoUrl.trim()
    const destinationPath = cloneDialog.destinationPath.trim()
    const username = cloneDialog.username.trim()
    const password = cloneDialog.password.trim()

    if (!repoUrl) {
      window.alert('Le lien du depot est requis.')
      return
    }

    if (!destinationPath) {
      window.alert('Choisis un dossier de destination.')
      return
    }

    setCloneDialog((previous) =>
      previous
        ? {
            ...previous,
            isSubmitting: true,
          }
        : previous,
    )

    try {
      const result = await holo.gitCloneRepository({
        repoUrl,
        destinationPath,
        username: username || undefined,
        password: password || undefined,
      })

      applyOpenedFolder(result)
      setCloneDialog(null)
      await refreshRecentFolders()
      const nextGitState = await holo.gitGetState(true)
      setGitState(normalizeGitState(nextGitState))
    } catch (error) {
      window.alert((error as Error).message)
      setCloneDialog((previous) =>
        previous
          ? {
              ...previous,
              isSubmitting: false,
            }
          : previous,
      )
    }
  }, [applyOpenedFolder, cloneDialog, getHoloApi, refreshRecentFolders, setCloneDialog, setGitState])

  return {
    openCloneDialog,
    pickCloneDirectory,
    submitCloneDialog,
  }
}
