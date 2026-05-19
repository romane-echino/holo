import { useCallback } from 'react'
import { DEFAULT_GIT_STATE, normalizeGitState } from '../lib/gitUtils'
import type { OpenFolderResult, TreeNode } from '../types/app'
import type { GitState } from '../types/git'
import type { NodeType } from '../types/app'

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseWorkspaceFoldersParams = {
  getHoloApi: () => Window['holo'] | null
  setRootPath: React.Dispatch<React.SetStateAction<string | null>>
  setTree: React.Dispatch<React.SetStateAction<TreeNode | null>>
  setSelectedPath: React.Dispatch<React.SetStateAction<string | null>>
  setSelectedType: React.Dispatch<React.SetStateAction<NodeType | null>>
  setExpandedDirectories: React.Dispatch<React.SetStateAction<Set<string>>>
  setArchivedFiles: React.Dispatch<React.SetStateAction<Array<{ archivedPath: string; originalPath: string; name: string }>>>
  setFolderIconByPath: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setActiveTab: React.Dispatch<React.SetStateAction<OpenTab | null>>
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>
  setGitState: React.Dispatch<React.SetStateAction<GitState>>
  setRecentFolders: React.Dispatch<React.SetStateAction<string[]>>
}

export function useWorkspaceFolders({
  getHoloApi,
  setRootPath,
  setTree,
  setSelectedPath,
  setSelectedType,
  setExpandedDirectories,
  setArchivedFiles,
  setFolderIconByPath,
  setActiveTab,
  setActiveTabPath,
  setGitState,
  setRecentFolders,
}: UseWorkspaceFoldersParams) {
  const refreshTree = useCallback(async () => {
    const holo = window.holo

    if (!holo) {
      return
    }

    const result = (await holo.refreshTree()) as OpenFolderResult

    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
  }, [setRootPath, setTree])

  const applyOpenedFolder = useCallback(
    (result: OpenFolderResult) => {
      if (!result) {
        return
      }

      setRootPath(result.rootPath)
      setTree(result.tree)
      setSelectedPath(result.rootPath)
      setSelectedType('directory')
      setExpandedDirectories(new Set([result.rootPath]))
      setArchivedFiles([])
      setFolderIconByPath({})
      setActiveTab(null)
      setActiveTabPath(null)
      setGitState(DEFAULT_GIT_STATE)
    },
    [
      setActiveTab,
      setActiveTabPath,
      setArchivedFiles,
      setExpandedDirectories,
      setFolderIconByPath,
      setGitState,
      setRootPath,
      setSelectedPath,
      setSelectedType,
      setTree,
    ],
  )

  const refreshRecentFolders = useCallback(async () => {
    if (!window.holo) {
      setRecentFolders([])
      return
    }

    const recent = await window.holo.getRecentFolders()
    setRecentFolders(Array.isArray(recent) ? recent : [])
  }, [setRecentFolders])

  const refreshArchivedFiles = useCallback(async () => {
    if (!window.holo) {
      setArchivedFiles([])
      return
    }

    const archived = await window.holo.listArchivedFiles().catch(() => [])
    setArchivedFiles(Array.isArray(archived) ? archived : [])
  }, [setArchivedFiles])

  const initializeOpenedWorkspace = useCallback(
    async (holo: NonNullable<Window['holo']>, result: OpenFolderResult) => {
      if (!result) {
        return
      }

      applyOpenedFolder(result)
      await refreshRecentFolders()
      await refreshArchivedFiles()

      const nextGitState = await holo.gitGetState(true)
      setGitState(normalizeGitState(nextGitState))

      if (nextGitState?.isRepo) {
        try {
          await holo.gitPull()
        } catch {
          // silent
        }
        await refreshTree()
        const afterPull = await holo.gitGetState(false).catch(() => null)
        if (afterPull) {
          setGitState(normalizeGitState(afterPull))
        }
      }
    },
    [applyOpenedFolder, refreshArchivedFiles, refreshRecentFolders, refreshTree, setGitState],
  )

  const openFolder = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = (await holo.openFolder()) as OpenFolderResult
    await initializeOpenedWorkspace(holo, result)
  }, [getHoloApi, initializeOpenedWorkspace])

  const openRecentFolder = useCallback(
    async (folderPath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        const result = (await holo.openRecentFolder(folderPath)) as OpenFolderResult
        await initializeOpenedWorkspace(holo, result)
      } catch (error) {
        window.alert((error as Error).message)
        await refreshRecentFolders()
      }
    },
    [getHoloApi, initializeOpenedWorkspace, refreshRecentFolders],
  )

  const removeRecentFolder = useCallback(
    async (folderPath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        await holo.removeRecentFolder(folderPath)
        await refreshRecentFolders()
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, refreshRecentFolders],
  )

  return {
    refreshTree,
    applyOpenedFolder,
    refreshRecentFolders,
    refreshArchivedFiles,
    openFolder,
    openRecentFolder,
    removeRecentFolder,
  }
}
