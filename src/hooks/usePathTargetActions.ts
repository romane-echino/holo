import { useCallback } from 'react'
import { buildAutoCommitMessage, getCommitTargetPath, isSameOrChildPath } from '../lib/appUtils'

type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  intent?: 'primary' | 'danger'
}

type UsePathTargetActionsParams = {
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  rootPath: string | null
  activeTabPath: string | null
  appAuthor: string
  requestConfirmation: (dialog: ConfirmDialogState) => Promise<boolean>
  refreshTree: () => Promise<void>
  refreshArchivedFiles: () => Promise<void>
  refreshGitState: (forceRemote: boolean) => Promise<void>
  autoCommitStructuralChange: (commitMessage: string) => Promise<void>
  setActiveTab: React.Dispatch<React.SetStateAction<{ path: string; name: string; content: string; isDirty: boolean } | null>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedType: React.Dispatch<React.SetStateAction<'file' | 'directory' | null>>
}

export function usePathTargetActions({
  ensureWritableMode,
  getHoloApi,
  rootPath,
  activeTabPath,
  appAuthor,
  requestConfirmation,
  refreshTree,
  refreshArchivedFiles,
  refreshGitState,
  autoCommitStructuralChange,
  setActiveTab,
  setActiveTabPath,
  setSelectedPath,
  setSelectedType,
}: UsePathTargetActionsParams) {
  const archivePathTarget = useCallback(
    async (targetPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        return
      }

      const confirmed = await requestConfirmation({
        title: 'Archiver le fichier',
        message: 'Archiver ce fichier ?',
        confirmLabel: 'Archiver',
        cancelLabel: 'Annuler',
        intent: 'danger',
      })

      if (!confirmed) {
        return
      }

      try {
        const holo = getHoloApi()
        if (!holo) {
          return
        }

        const result = await holo.archivePath(targetPath)

        if (activeTabPath && isSameOrChildPath(targetPath, activeTabPath)) {
          setActiveTab(null)
          setActiveTabPath(null)
        }

        await refreshTree()
        await refreshArchivedFiles()
        await refreshGitState(false)
        await autoCommitStructuralChange(
          buildAutoCommitMessage(
            appAuthor,
            'ARCHIVE',
            rootPath,
            result.archivedPath,
            `FROM ${getCommitTargetPath(rootPath, targetPath)}`,
          ),
        )
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [
      activeTabPath,
      appAuthor,
      autoCommitStructuralChange,
      ensureWritableMode,
      getHoloApi,
      refreshArchivedFiles,
      refreshGitState,
      refreshTree,
      requestConfirmation,
      rootPath,
      setActiveTab,
      setActiveTabPath,
    ],
  )

  const restoreArchivedPathTarget = useCallback(
    async (archivedPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        return
      }

      const confirmed = await requestConfirmation({
        title: 'Recuperer le fichier',
        message: 'Recuperer ce fichier archive ?',
        confirmLabel: 'Recuperer',
        cancelLabel: 'Annuler',
      })

      if (!confirmed) {
        return
      }

      try {
        const holo = getHoloApi()
        if (!holo) {
          return
        }

        const result = await holo.restoreArchivedPath(archivedPath)
        await refreshTree()
        await refreshArchivedFiles()
        await refreshGitState(false)
        await autoCommitStructuralChange(
          buildAutoCommitMessage(
            appAuthor,
            'RESTORE',
            rootPath,
            result.restoredPath,
            `FROM ${getCommitTargetPath(rootPath, archivedPath)}`,
          ),
        )
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [
      appAuthor,
      autoCommitStructuralChange,
      ensureWritableMode,
      getHoloApi,
      refreshArchivedFiles,
      refreshGitState,
      refreshTree,
      requestConfirmation,
      rootPath,
    ],
  )

  const deletePathTarget = useCallback(
    async (targetPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath || targetPath === rootPath) {
        return
      }

      const confirmed = await requestConfirmation({
        title: 'Supprimer',
        message: 'Confirmer la suppression ?',
        confirmLabel: 'Supprimer',
        cancelLabel: 'Annuler',
        intent: 'danger',
      })

      if (!confirmed) {
        return
      }

      try {
        const holo = getHoloApi()
        if (!holo) {
          return
        }

        await holo.deletePath(targetPath)

        if (activeTabPath && isSameOrChildPath(targetPath, activeTabPath)) {
          setActiveTab(null)
          setActiveTabPath(null)
        }

        setSelectedPath(rootPath)
        setSelectedType('directory')
        await refreshTree()
        await refreshGitState(false)
        await autoCommitStructuralChange(buildAutoCommitMessage(appAuthor, 'DELETE', rootPath, targetPath))
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [
      activeTabPath,
      appAuthor,
      autoCommitStructuralChange,
      ensureWritableMode,
      getHoloApi,
      refreshGitState,
      refreshTree,
      requestConfirmation,
      rootPath,
      setActiveTab,
      setActiveTabPath,
      setSelectedPath,
      setSelectedType,
    ],
  )

  const copyPathTarget = useCallback(
    async (targetPath: string) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        return
      }

      try {
        const holo = getHoloApi()
        if (!holo) {
          return
        }

        const parentPath = targetPath.substring(0, targetPath.lastIndexOf('/')) || rootPath
        const result = await holo.copyFile(targetPath, parentPath)

        setSelectedPath(result.newPath)
        setSelectedType('file')
        await refreshTree()
        await refreshGitState(false)
        await autoCommitStructuralChange(buildAutoCommitMessage(appAuthor, 'CREATE', rootPath, result.newPath))
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [
      appAuthor,
      autoCommitStructuralChange,
      ensureWritableMode,
      getHoloApi,
      refreshGitState,
      refreshTree,
      rootPath,
      setSelectedPath,
      setSelectedType,
    ],
  )

  return {
    archivePathTarget,
    restoreArchivedPathTarget,
    deletePathTarget,
    copyPathTarget,
  }
}
