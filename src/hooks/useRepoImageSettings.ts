import { useCallback, useEffect } from 'react'
import {
  buildAutoCommitMessage,
  getRepoConfigPath,
  getRepoRelativeFolderPath,
  resolveRepoRelativePath,
} from '../lib/appUtils'
import { useConfig } from '../contexts/ConfigContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'

export type ImageStorageMode = 'local' | 'azure' | 's3' | 'dropbox' | 'gdrive'

type LoadRepoImageOptions = {
  silentNoRoot?: boolean
}

export function useRepoImageSettings({
  getHoloApi,
  ensureWritableMode,
  refreshGitState,
}: {
  getHoloApi: () => Window['holo'] | null
  ensureWritableMode: () => boolean
  refreshGitState: (fetchRemote?: boolean) => Promise<void>
}) {
  const {
    appAuthor, gitState,
    repoImageStorageMode, azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey,
    dropboxAccessToken, gdriveAccessToken,
    setRepoImageStorageMode, setRepoImageModeReady,
  } = useConfig()
  const { rootPath, setFolderIconByPath } = useWorkspace()
  const { globalConfigReady, setShowSettings } = useUI()
  const autoCommitRepoConfigChange = useCallback(async () => {
    if (!gitState.isRepo || !window.holo || !rootPath) {
      return
    }

    try {
      const commitMessage = buildAutoCommitMessage(appAuthor, 'UPDATE', rootPath, getRepoConfigPath(rootPath))
      await window.holo.gitCommit(commitMessage)
    } catch (error) {
      console.error('Auto-commit (repo config) failed:', error)
    }
  }, [appAuthor, gitState.isRepo, rootPath])

  const loadRepoImageSettings = useCallback(
    async (options?: LoadRepoImageOptions) => {
      if (!rootPath) {
        if (!options?.silentNoRoot) {
          setRepoImageStorageMode('local')
          setFolderIconByPath({})
        }
        setRepoImageModeReady(false)
        return
      }

      const holo = getHoloApi()
      if (!holo) {
        setRepoImageModeReady(false)
        return
      }

      setRepoImageModeReady(false)
      try {
        const repoConfig = (await holo.readRepoConfig().catch(() => null)) as {
          imageStorageMode?: ImageStorageMode
          imageStorage?: { mode?: ImageStorageMode }
          folderIcons?: Record<string, string>
        } | null

        const legacyMode = repoConfig?.imageStorage?.mode
        const mode = repoConfig?.imageStorageMode ?? legacyMode

        if (mode === 'local' || mode === 'azure' || mode === 's3' || mode === 'dropbox' || mode === 'gdrive') {
          setRepoImageStorageMode(mode)
        } else {
          setRepoImageStorageMode('local')
        }

        if (globalConfigReady && mode && mode !== 'local') {
          const hasAzure = !!(azureBlobContainerUrl.trim() && azureBlobSasToken.trim())
          const hasS3 = !!(s3Region.trim() && s3Bucket.trim() && s3AccessKeyId.trim() && s3SecretAccessKey.trim())
          const hasDropbox = !!dropboxAccessToken.trim()
          const hasGdrive = !!gdriveAccessToken.trim()
          const credOk = (mode === 'azure' && hasAzure)
            || (mode === 's3' && hasS3)
            || (mode === 'dropbox' && hasDropbox)
            || (mode === 'gdrive' && hasGdrive)

          if (!credOk) {
            window.alert(`Ce dépôt utilise le stockage d'images « ${mode} » mais les clés d'authentification ne sont pas configurées sur cette machine.\n\nVa dans Paramètres › Stockage d'images pour les saisir.`)
            setShowSettings(true)
          }
        }

        if (repoConfig?.folderIcons && typeof repoConfig.folderIcons === 'object') {
          const rawIcons = repoConfig.folderIcons as Record<string, string>
          const absIcons: Record<string, string> = {}
          for (const [key, icon] of Object.entries(rawIcons)) {
            const isAbsPath = key.startsWith('/') || /^[A-Za-z]:[/\\]/.test(key) || key.startsWith('~')
            const absKey = isAbsPath ? key : resolveRepoRelativePath(rootPath, key)
            absIcons[absKey] = icon
          }
          setFolderIconByPath(absIcons)
        } else {
          setFolderIconByPath({})
        }
      } catch {
        setRepoImageStorageMode('local')
        setFolderIconByPath({})
      } finally {
        setRepoImageModeReady(true)
      }
    },
    [
      azureBlobContainerUrl,
      azureBlobSasToken,
      dropboxAccessToken,
      gdriveAccessToken,
      getHoloApi,
      globalConfigReady,
      rootPath,
      s3AccessKeyId,
      s3Bucket,
      s3Region,
      s3SecretAccessKey,
      setFolderIconByPath,
      setRepoImageModeReady,
      setRepoImageStorageMode,
      setShowSettings,
    ],
  )

  const ensureImageProviderReady = useCallback(() => {
    if (repoImageStorageMode === 'local') {
      return true
    }

    if (repoImageStorageMode === 'azure' && (!azureBlobContainerUrl.trim() || !azureBlobSasToken.trim())) {
      window.alert('Configuration Azure incomplète (container URL + SAS token).')
      setShowSettings(true)
      return false
    }

    if (
      repoImageStorageMode === 's3'
      && (!s3Region.trim() || !s3Bucket.trim() || !s3AccessKeyId.trim() || !s3SecretAccessKey.trim())
    ) {
      window.alert('Configuration S3 incomplète (region, bucket, access key, secret key).')
      setShowSettings(true)
      return false
    }

    if (repoImageStorageMode === 'dropbox' && !dropboxAccessToken.trim()) {
      window.alert('Configuration Dropbox incomplète (access token).')
      setShowSettings(true)
      return false
    }

    if (repoImageStorageMode === 'gdrive' && !gdriveAccessToken.trim()) {
      window.alert('Configuration Google Drive incomplète (access token).')
      setShowSettings(true)
      return false
    }

    return true
  }, [
    azureBlobContainerUrl,
    azureBlobSasToken,
    dropboxAccessToken,
    gdriveAccessToken,
    repoImageStorageMode,
    s3AccessKeyId,
    s3Bucket,
    s3Region,
    s3SecretAccessKey,
    setShowSettings,
  ])

  const saveRepoImageConfig = useCallback(async () => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const existing = await holo.readRepoConfig().catch(() => null)
      const nextConfig = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), imageStorageMode: repoImageStorageMode }
        : { imageStorageMode: repoImageStorageMode }

      await holo.writeRepoConfig(nextConfig)
      setRepoImageModeReady(true)
      await refreshGitState(false)
      await autoCommitRepoConfigChange()
      window.alert('Configuration du dépôt sauvegardée.')
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [
    autoCommitRepoConfigChange,
    ensureWritableMode,
    getHoloApi,
    refreshGitState,
    repoImageStorageMode,
    rootPath,
    setRepoImageModeReady,
  ])

  const saveFolderIconConfig = useCallback(async (folderPath: string, icon: string) => {
    if (!ensureWritableMode()) {
      return
    }

    if (!rootPath) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const existing = await holo.readRepoConfig().catch(() => null)
      const folderIcons = (
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? (existing as Record<string, unknown>).folderIcons as Record<string, string> | undefined
          : undefined
      ) || {}

      const relKey = getRepoRelativeFolderPath(rootPath, folderPath)

      const legacyKeys = Object.keys(folderIcons).filter(
        (key) => key.startsWith('/') || /^[A-Za-z]:[/\\]/.test(key) || key.startsWith('~'),
      )
      for (const legacyKey of legacyKeys) {
        const normalized = legacyKey.replace(/[/\\]+$/, '')
        const normalizedFolderPath = folderPath.replace(/[/\\]+$/, '')
        if (normalized === normalizedFolderPath) {
          delete folderIcons[legacyKey]
        }
      }

      const nextFolderIcons = icon
        ? { ...folderIcons, [relKey]: icon }
        : { ...folderIcons }

      if (!icon && relKey in nextFolderIcons) {
        delete nextFolderIcons[relKey]
      }

      const nextConfig = existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>), folderIcons: nextFolderIcons }
        : { folderIcons: nextFolderIcons }

      await holo.writeRepoConfig(nextConfig)
      setFolderIconByPath((prev) => {
        if (icon) {
          return { ...prev, [folderPath]: icon }
        }

        if (!(folderPath in prev)) {
          return prev
        }

        const next = { ...prev }
        delete next[folderPath]
        return next
      })
      await refreshGitState(false)
      await autoCommitRepoConfigChange()
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [
    autoCommitRepoConfigChange,
    ensureWritableMode,
    getHoloApi,
    refreshGitState,
    rootPath,
    setFolderIconByPath,
  ])

  useEffect(() => {
    void loadRepoImageSettings()
  }, [loadRepoImageSettings])

  return {
    loadRepoImageSettings,
    ensureImageProviderReady,
    saveRepoImageConfig,
    saveFolderIconConfig,
  }
}
