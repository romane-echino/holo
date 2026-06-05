import { useCallback } from 'react'
import { updateMarkdownBooleanHeaderField } from '../lib/markdown'
import {
  applyTemplateVariables,
  buildAutoCommitMessage,
  getBaseName,
  getCommitTargetPath,
  isSameOrChildPath,
  normalizeMarkdownFilename,
} from '../lib/appUtils'
import { useUI } from '../contexts/UIContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useNameDialogSubmission({
  ensureWritableMode,
  getHoloApi,
  refreshTree,
  refreshGitState,
  autoCommitStructuralChange,
}: {
  ensureWritableMode: () => boolean
  getHoloApi: () => Window['holo'] | null
  refreshTree: () => Promise<void>
  refreshGitState: (silent?: boolean) => Promise<void>
  autoCommitStructuralChange: (commitMessage: string) => Promise<void>
}) {
  const { nameDialog, setNameDialog } = useUI()
  const { rootPath, selectedPath, setSelectedPath } = useWorkspace()
  const { activeTabPath, setActiveTab, setActiveTabPath } = useEditor()
  const { appAuthor } = useConfig()
  const { setPendingTitleFocusPath } = useEditorOverlay()
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
        const filename = normalizeMarkdownFilename(value)
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
