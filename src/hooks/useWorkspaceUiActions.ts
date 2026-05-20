import { useCallback } from 'react'
import { DEFAULT_SYNC_FEEDBACK } from './useGitWorkflow'
import { DEFAULT_GIT_STATE } from '../lib/gitUtils'
import { buildShareableHoloLink } from '../lib/appUtils'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'

export function useWorkspaceUiActions({
  getHoloApi,
  openFile,
}: {
  getHoloApi: () => Window['holo'] | null
  openFile: (filePath: string) => Promise<void>
}) {
  const {
    rootPath, setRootPath, setTree, setSelectedPath, setSelectedType,
    setExpandedDirectories, setArchivedFiles, setContextMenu, setFolderIconByPath,
  } = useWorkspace()
  const { setActiveTab, setActiveTabPath } = useEditor()
  const {
    shareGatewayBaseUrl,
    setAppAuthor, setGitState, setSyncFeedback,
    setRepoImageStorageMode, setRepoImageModeReady,
  } = useConfig()
  const {
    setCopyLinkStatus, setShowAuthorModal, setShowUserMenu,
    setAuthorModalMode, setAuthorModalValue, authorModalValue,
  } = useUI()

  const openConflictedFile = useCallback(
    async (filePath: string) => {
      try {
        setSelectedPath(filePath)
        setSelectedType('file')
        await openFile(filePath)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [openFile, setSelectedPath, setSelectedType],
  )

  const copyHoloLink = useCallback(
    async (filePath: string) => {
      const holo = getHoloApi()
      if (!holo || !rootPath) return
      const link = buildShareableHoloLink(rootPath, filePath, shareGatewayBaseUrl)
      if (!link) return
      try {
        await holo.writeClipboardText(link)
        setCopyLinkStatus('copied')
        window.setTimeout(() => setCopyLinkStatus('idle'), 2500)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, rootPath, setCopyLinkStatus, shareGatewayBaseUrl],
  )

  const openFileInNewWindow = useCallback(
    async (filePath: string) => {
      if (!rootPath) return
      const holo = getHoloApi()
      if (!holo) return
      try {
        await holo.openFileInNewWindow({ rootPath, filePath })
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, rootPath],
  )

  const closeOpenedFolder = useCallback(() => {
    setRootPath(null)
    setTree(null)
    setSelectedPath(null)
    setSelectedType(null)
    setExpandedDirectories(new Set())
    setArchivedFiles([])
    setActiveTab(null)
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)
    setSyncFeedback(DEFAULT_SYNC_FEEDBACK)
    setContextMenu(null)
    setRepoImageStorageMode('local')
    setRepoImageModeReady(false)
    setFolderIconByPath({})
  }, [
    setActiveTab, setActiveTabPath, setArchivedFiles, setContextMenu,
    setExpandedDirectories, setFolderIconByPath, setGitState,
    setRepoImageModeReady, setRepoImageStorageMode, setRootPath,
    setSelectedPath, setSelectedType, setSyncFeedback, setTree,
  ])

  const submitAuthorProfile = useCallback(() => {
    const nextAuthor = authorModalValue.trim()
    if (!nextAuthor) return
    setAppAuthor(nextAuthor)
    setShowAuthorModal(false)
    setShowUserMenu(false)
  }, [authorModalValue, setAppAuthor, setShowAuthorModal, setShowUserMenu])

  const logoutAuthorProfile = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('holo-author')
    }
    setAppAuthor('')
    setShowUserMenu(false)
    setAuthorModalMode('startup')
    setAuthorModalValue('')
    setShowAuthorModal(true)
  }, [setAppAuthor, setAuthorModalMode, setAuthorModalValue, setShowAuthorModal, setShowUserMenu])

  return {
    openConflictedFile,
    copyHoloLink,
    openFileInNewWindow,
    closeOpenedFolder,
    submitAuthorProfile,
    logoutAuthorProfile,
  }
}
