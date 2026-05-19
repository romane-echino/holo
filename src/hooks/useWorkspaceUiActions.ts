import { useCallback } from 'react'
import { DEFAULT_SYNC_FEEDBACK, type SyncFeedback } from './useGitWorkflow'
import { DEFAULT_GIT_STATE } from '../lib/gitUtils'
import { buildShareableHoloLink } from '../lib/appUtils'
import type { GitState } from '../types/git'

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseWorkspaceUiActionsParams = {
  getHoloApi: () => Window['holo'] | null
  rootPath: string | null
  shareGatewayBaseUrl: string
  openFile: (filePath: string) => Promise<void>
  setCopyLinkStatus: React.Dispatch<React.SetStateAction<'idle' | 'copied'>>
  setSelectedPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedType: React.Dispatch<React.SetStateAction<'file' | 'directory' | null>>
  setRootPath: React.Dispatch<React.SetStateAction<string | null>>
  setTree: React.Dispatch<React.SetStateAction<import('../types/app').TreeNode | null>>
  setExpandedDirectories: React.Dispatch<React.SetStateAction<Set<string>>>
  setArchivedFiles: React.Dispatch<React.SetStateAction<Array<{ archivedPath: string; originalPath: string; name: string }>>>
  setActiveTab: React.Dispatch<React.SetStateAction<OpenTab | null>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  setGitState: React.Dispatch<React.SetStateAction<GitState>>
  setSyncFeedback: React.Dispatch<React.SetStateAction<SyncFeedback>>
  setContextMenu: React.Dispatch<React.SetStateAction<{ x: number; y: number; node: import('../types/app').TreeNode } | null>>
  setRepoImageStorageMode: React.Dispatch<React.SetStateAction<'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'>>
  setRepoImageModeReady: React.Dispatch<React.SetStateAction<boolean>>
  setFolderIconByPath: React.Dispatch<React.SetStateAction<Record<string, string>>>
  authorModalValue: string
  setAppAuthor: React.Dispatch<React.SetStateAction<string>>
  setShowAuthorModal: React.Dispatch<React.SetStateAction<boolean>>
  setShowUserMenu: React.Dispatch<React.SetStateAction<boolean>>
  setAuthorModalMode: React.Dispatch<React.SetStateAction<'startup' | 'edit'>>
  setAuthorModalValue: React.Dispatch<React.SetStateAction<string>>
}

export function useWorkspaceUiActions({
  getHoloApi,
  rootPath,
  shareGatewayBaseUrl,
  openFile,
  setCopyLinkStatus,
  setSelectedPath,
  setSelectedType,
  setRootPath,
  setTree,
  setExpandedDirectories,
  setArchivedFiles,
  setActiveTab,
  setActiveTabPath,
  setGitState,
  setSyncFeedback,
  setContextMenu,
  setRepoImageStorageMode,
  setRepoImageModeReady,
  setFolderIconByPath,
  authorModalValue,
  setAppAuthor,
  setShowAuthorModal,
  setShowUserMenu,
  setAuthorModalMode,
  setAuthorModalValue,
}: UseWorkspaceUiActionsParams) {
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

      if (!holo || !rootPath) {
        return
      }

      const link = buildShareableHoloLink(rootPath, filePath, shareGatewayBaseUrl)

      if (!link) {
        return
      }

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
      if (!rootPath) {
        return
      }

      const holo = getHoloApi()
      if (!holo) {
        return
      }

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
    setActiveTab,
    setActiveTabPath,
    setArchivedFiles,
    setContextMenu,
    setExpandedDirectories,
    setFolderIconByPath,
    setGitState,
    setRepoImageModeReady,
    setRepoImageStorageMode,
    setRootPath,
    setSelectedPath,
    setSelectedType,
    setSyncFeedback,
    setTree,
  ])

  const submitAuthorProfile = useCallback(() => {
    const nextAuthor = authorModalValue.trim()
    if (!nextAuthor) {
      return
    }

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
