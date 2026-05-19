import { useCallback } from 'react'
import { getBaseName, getDirectoryTarget } from '../lib/appUtils'
import type { NodeType } from '../types/app'
import type { NameDialog } from '../types/shared'

type UseNameDialogActionsParams = {
  ensureWritableMode: () => boolean
  rootPath: string | null
  selectedPath: string | null
  selectedType: NodeType | null
  setNameDialog: React.Dispatch<React.SetStateAction<NameDialog | null>>
}

export function useNameDialogActions({
  ensureWritableMode,
  rootPath,
  selectedPath,
  selectedType,
  setNameDialog,
}: UseNameDialogActionsParams) {
  const openCreateFileDialog = useCallback(
    (targetPath?: string | null, targetType?: NodeType | null) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        window.alert('Ouvre d abord un dossier.')
        return
      }

      const targetDirectory = getDirectoryTarget(
        rootPath,
        targetPath ?? selectedPath,
        targetType ?? selectedType,
      )

      setNameDialog({
        mode: 'create-file',
        value: '',
        targetDirectoryPath: targetDirectory ?? rootPath,
        selectedTemplatePath: null,
      })
    },
    [ensureWritableMode, rootPath, selectedPath, selectedType, setNameDialog],
  )

  const openCreateDirectoryDialog = useCallback(
    (targetPath?: string | null, targetType?: NodeType | null) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        window.alert('Ouvre d abord un dossier.')
        return
      }

      const targetDirectory = getDirectoryTarget(
        rootPath,
        targetPath ?? selectedPath,
        targetType ?? selectedType,
      )

      setNameDialog({
        mode: 'create-directory',
        value: '',
        targetDirectoryPath: targetDirectory ?? rootPath,
      })
    },
    [ensureWritableMode, rootPath, selectedPath, selectedType, setNameDialog],
  )

  const openRenameDialog = useCallback(
    (targetPathOverride?: string | null) => {
      if (!ensureWritableMode()) {
        return
      }

      if (!rootPath) {
        window.alert('Ouvre d abord un dossier.')
        return
      }

      const targetPath = targetPathOverride ?? selectedPath

      if (!targetPath) {
        window.alert('Selectionne un fichier ou un dossier a renommer.')
        return
      }

      if (targetPath === rootPath) {
        window.alert('Le dossier racine ne peut pas etre renomme.')
        return
      }

      setNameDialog({
        mode: 'rename',
        value: getBaseName(targetPath),
        targetPath,
      })
    },
    [ensureWritableMode, rootPath, selectedPath, setNameDialog],
  )

  return {
    openCreateFileDialog,
    openCreateDirectoryDialog,
    openRenameDialog,
  }
}
