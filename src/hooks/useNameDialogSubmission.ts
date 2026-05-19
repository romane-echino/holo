import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { updateMarkdownBooleanHeaderField } from '../lib/markdown'
import {
  applyTemplateVariables,
  buildAutoCommitMessage,
  getBaseName,
  getCommitTargetPath,
  isSameOrChildPath,
} from '../lib/appUtils'
import type { NameDialog } from '../types/shared'

type OpenTabLike = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseNameDialogSubmissionParams = {
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  nameDialog: NameDialog | null
  rootPath: string | null
  selectedPath: string | null
  activeTabPath: string | null
  appAuthor: string
  refreshTree: () => Promise<void>
  refreshGitState: (silent?: boolean) => Promise<void>
  autoCommitStructuralChange: (commitMessage: string) => Promise<void>
  setNameDialog: Dispatch<SetStateAction<NameDialog | null>>
  setActiveTab: Dispatch<SetStateAction<OpenTabLike | null>>
  setActiveTabPath: Dispatch<SetStateAction<string | null>>
  setPendingTitleFocusPath: Dispatch<SetStateAction<string | null>>
  setSelectedPath: Dispatch<SetStateAction<string | null>>
}

export function useNameDialogSubmission({
  ensureWritableMode,
  getHoloApi,
  nameDialog,
  rootPath,
  selectedPath,
  activeTabPath,
  appAuthor,
  refreshTree,
  refreshGitState,
  autoCommitStructuralChange,
  setNameDialog,
  setActiveTab,
  setActiveTabPath,
  setPendingTitleFocusPath,
  setSelectedPath,
}: UseNameDialogSubmissionParams) {
  const submitNameDialog = useCallback(async () => {
    if (!nameDialog || !rootPath) {
      return
    }

    if (!ensureWritableMode()) {
      return
    }

    const value = nameDialog.value.trim()

    if (!value) {
      window.alert('Le nom ne peut pas etre vide.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      let commitMessage: string | null = null

      if (nameDialog.mode === 'create-file') {
        const filename = value.endsWith('.md') ? value : `${value}.md`
        const newFilePath = `${nameDialog.targetDirectoryPath}/${filename}`
        await holo.createFile(nameDialog.targetDirectoryPath, filename)

        if (nameDialog.selectedTemplatePath) {
          const templateContent = await holo.readFile(nameDialog.selectedTemplatePath)
          let contentFromTemplate = updateMarkdownBooleanHeaderField(templateContent, 'template', false)
          if (nameDialog.templateVariables && Object.keys(nameDialog.templateVariables).length > 0) {
            contentFromTemplate = applyTemplateVariables(contentFromTemplate, nameDialog.templateVariables)
          }
          await holo.writeFile(newFilePath, contentFromTemplate)
        }

        commitMessage = buildAutoCommitMessage(appAuthor, 'ADD', rootPath, newFilePath)

        const content = await holo.readFile(newFilePath)
        setActiveTab({
          path: newFilePath,
          name: filename.replace(/\.md$/, ''),
          content,
          isDirty: false,
        })
        setActiveTabPath(newFilePath)
        setPendingTitleFocusPath(newFilePath)
      } else if (nameDialog.mode === 'create-directory') {
        const newDirectoryPath = `${nameDialog.targetDirectoryPath}/${value}`
        await holo.createDirectory(nameDialog.targetDirectoryPath, value)
        commitMessage = buildAutoCommitMessage(appAuthor, 'ADD_DIR', rootPath, newDirectoryPath)
      } else if (nameDialog.mode === 'rename') {
        const renameTargetPath = nameDialog.targetPath
        const result = await holo.renamePath(renameTargetPath, value)
        commitMessage = buildAutoCommitMessage(
          appAuthor,
          'RENAME',
          rootPath,
          result.newPath,
          `FROM ${getCommitTargetPath(rootPath, renameTargetPath)}`,
        )

        setActiveTab((previous) =>
          previous && isSameOrChildPath(renameTargetPath, previous.path)
            ? {
                ...previous,
                path: previous.path.replace(renameTargetPath, result.newPath),
                name: getBaseName(previous.path.replace(renameTargetPath, result.newPath)),
              }
            : previous,
        )

        if (selectedPath && isSameOrChildPath(renameTargetPath, selectedPath)) {
          setSelectedPath(selectedPath.replace(renameTargetPath, result.newPath))
        }

        if (activeTabPath && isSameOrChildPath(renameTargetPath, activeTabPath)) {
          setActiveTabPath(activeTabPath.replace(renameTargetPath, result.newPath))
        }
      }

      setNameDialog(null)
      await refreshTree()
      await refreshGitState(false)
      if (commitMessage) {
        await autoCommitStructuralChange(commitMessage)
      }
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [
    activeTabPath,
    appAuthor,
    autoCommitStructuralChange,
    ensureWritableMode,
    getHoloApi,
    nameDialog,
    refreshGitState,
    refreshTree,
    rootPath,
    selectedPath,
    setActiveTab,
    setActiveTabPath,
    setNameDialog,
    setPendingTitleFocusPath,
    setSelectedPath,
  ])

  return { submitNameDialog }
}
