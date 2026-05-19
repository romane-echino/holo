import { useCallback, useEffect } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'

type GlobalConfigValues = {
  globalConfigReady: boolean
  appAuthor: string
  readOnlyMode: boolean
  seenChangelogVersion: string
  gitEmail: string
  azureBlobContainerUrl: string
  azureBlobSasToken: string
  s3Region: string
  s3Bucket: string
  s3AccessKeyId: string
  s3SecretAccessKey: string
  s3Endpoint: string
  s3PublicBaseUrl: string
  dropboxAccessToken: string
  dropboxFolderPath: string
  gdriveAccessToken: string
  gdriveFolderId: string
  openaiApiKey: string
  geminiApiKey: string
  aiProvider: 'auto' | 'openai' | 'gemini'
  openaiPrompt: string
  shareGatewayBaseUrl: string
}

type UseGlobalConfigParams = {
  getHoloApi: () => Window['holo'] | null
  initialOpenaiPrompt: string
  initialShareGatewayBaseUrl: string
  values: GlobalConfigValues
  setAppAuthor: (value: string) => void
  setReadOnlyMode: (value: boolean) => void
  setSeenChangelogVersion: (value: string) => void
  setGitEmail: (value: string) => void
  setAzureBlobContainerUrl: (value: string) => void
  setAzureBlobSasToken: (value: string) => void
  setS3Region: (value: string) => void
  setS3Bucket: (value: string) => void
  setS3AccessKeyId: (value: string) => void
  setS3SecretAccessKey: (value: string) => void
  setS3Endpoint: (value: string) => void
  setS3PublicBaseUrl: (value: string) => void
  setDropboxAccessToken: (value: string) => void
  setDropboxFolderPath: (value: string) => void
  setGdriveAccessToken: (value: string) => void
  setGdriveFolderId: (value: string) => void
  setOpenaiApiKey: (value: string) => void
  setGeminiApiKey: (value: string) => void
  setAiProvider: (value: 'auto' | 'openai' | 'gemini') => void
  setOpenaiPrompt: (value: string) => void
  setShareGatewayBaseUrl: (value: string) => void
  setAuthorModalMode: (mode: 'startup' | 'edit') => void
  setAuthorModalValue: (value: string) => void
  setShowAuthorModal: (show: boolean) => void
  setGlobalConfigReady: (ready: boolean) => void
}

function usePersistedConfigValue(
  ready: boolean,
  key: string,
  value: unknown,
  persistConfigValue: (key: string, value: unknown) => Promise<void>,
) {
  useEffect(() => {
    if (ready) {
      void persistConfigValue(key, value)
    }
  }, [key, persistConfigValue, ready, value])
}

export function useGlobalConfig({
  getHoloApi,
  initialOpenaiPrompt,
  initialShareGatewayBaseUrl,
  values,
  setAppAuthor,
  setReadOnlyMode,
  setSeenChangelogVersion,
  setGitEmail,
  setAzureBlobContainerUrl,
  setAzureBlobSasToken,
  setS3Region,
  setS3Bucket,
  setS3AccessKeyId,
  setS3SecretAccessKey,
  setS3Endpoint,
  setS3PublicBaseUrl,
  setDropboxAccessToken,
  setDropboxFolderPath,
  setGdriveAccessToken,
  setGdriveFolderId,
  setOpenaiApiKey,
  setGeminiApiKey,
  setAiProvider,
  setOpenaiPrompt,
  setShareGatewayBaseUrl,
  setAuthorModalMode,
  setAuthorModalValue,
  setShowAuthorModal,
  setGlobalConfigReady,
}: UseGlobalConfigParams) {
  const persistConfigValue = useCallback(
    async (key: string, value: unknown) => {
      const holo = getHoloApi()
      if (holo) {
        try {
          await holo.setHoloConfigValue(key, value)
        } catch (error) {
          console.error(`Failed to persist ${key}:`, error)
        }
      }
    },
    [getHoloApi],
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    let cancelled = false

    const loadConfig = async () => {
      const holo = getHoloApi()
      const cfg = await holo?.getHoloConfig?.().catch(() => ({} as Record<string, unknown>))
      const config = cfg && typeof cfg === 'object' ? cfg : {}

      const fromConfigOrLocal = (configKey: string, localKey: string, fallback = '') => {
        const cfgValue = config[configKey]
        if (typeof cfgValue === 'string' && cfgValue.trim().length > 0) {
          return cfgValue
        }
        const localValue = window.localStorage.getItem(localKey)
        if (localValue && localValue.trim().length > 0) {
          void holo?.setHoloConfigValue?.(configKey, localValue)
          return localValue
        }
        return fallback
      }

      const fromConfigOrLocalBoolean = (configKey: string, localKey: string, fallback = false) => {
        const cfgValue = config[configKey]
        if (typeof cfgValue === 'boolean') {
          return cfgValue
        }
        const localValue = window.localStorage.getItem(localKey)
        if (localValue === 'true' || localValue === 'false') {
          const parsed = localValue === 'true'
          void holo?.setHoloConfigValue?.(configKey, parsed)
          return parsed
        }
        return fallback
      }

      const author = fromConfigOrLocal('app-author', 'holo-author', '')
      const readOnly = fromConfigOrLocalBoolean('app-read-only', 'holo-read-only', false)
      const seenVersion = fromConfigOrLocal('seen-changelog-version', 'holo-seen-changelog-version', '')
      const email = fromConfigOrLocal('git-email', 'holo-git-email', '')
      const azureContainerUrl = fromConfigOrLocal('azure-container-url', 'holo-azure-container-url', '')
      const azureSasToken = fromConfigOrLocal('azure-sas-token', 'holo-azure-sas-token', '')
      const s3RegionValue = fromConfigOrLocal('s3-region', 'holo-s3-region', '')
      const s3BucketValue = fromConfigOrLocal('s3-bucket', 'holo-s3-bucket', '')
      const s3AccessKeyIdValue = fromConfigOrLocal('s3-access-key-id', 'holo-s3-access-key-id', '')
      const s3SecretAccessKeyValue = fromConfigOrLocal('s3-secret-access-key', 'holo-s3-secret-access-key', '')
      const s3EndpointValue = fromConfigOrLocal('s3-endpoint', 'holo-s3-endpoint', '')
      const s3PublicBaseUrlValue = fromConfigOrLocal('s3-public-base-url', 'holo-s3-public-base-url', '')
      const dropboxAccessTokenValue = fromConfigOrLocal('dropbox-access-token', 'holo-dropbox-access-token', '')
      const dropboxFolderPathValue = fromConfigOrLocal('dropbox-folder-path', 'holo-dropbox-folder-path', '/holo-images')
      const gdriveAccessTokenValue = fromConfigOrLocal('gdrive-access-token', 'holo-gdrive-access-token', '')
      const gdriveFolderIdValue = fromConfigOrLocal('gdrive-folder-id', 'holo-gdrive-folder-id', '')
      const openaiKey = fromConfigOrLocal('openai-api-key', 'holo-openai-key', '')
      const geminiKey = fromConfigOrLocal('gemini-api-key', 'holo-gemini-key', '')
      const providerRaw = fromConfigOrLocal('ai-provider', 'holo-ai-provider', 'auto')
      const prompt = fromConfigOrLocal('openai-prompt', 'holo-openai-prompt', initialOpenaiPrompt)
      const gatewayBaseUrl = fromConfigOrLocal('share-gateway-base-url', 'holo-share-gateway-url', initialShareGatewayBaseUrl)

      if (cancelled) {
        return
      }

      if (author) {
        setAppAuthor(author)
      } else {
        setAuthorModalMode('startup')
        setAuthorModalValue('')
        setShowAuthorModal(true)
      }

      setReadOnlyMode(readOnly)
      setSeenChangelogVersion(normalizeVersionLabel(seenVersion))
      if (email) setGitEmail(email)
      if (azureContainerUrl) setAzureBlobContainerUrl(azureContainerUrl)
      if (azureSasToken) setAzureBlobSasToken(azureSasToken)
      if (s3RegionValue) setS3Region(s3RegionValue)
      if (s3BucketValue) setS3Bucket(s3BucketValue)
      if (s3AccessKeyIdValue) setS3AccessKeyId(s3AccessKeyIdValue)
      if (s3SecretAccessKeyValue) setS3SecretAccessKey(s3SecretAccessKeyValue)
      if (s3EndpointValue) setS3Endpoint(s3EndpointValue)
      if (s3PublicBaseUrlValue) setS3PublicBaseUrl(s3PublicBaseUrlValue)
      if (dropboxAccessTokenValue) setDropboxAccessToken(dropboxAccessTokenValue)
      if (dropboxFolderPathValue) setDropboxFolderPath(dropboxFolderPathValue)
      if (gdriveAccessTokenValue) setGdriveAccessToken(gdriveAccessTokenValue)
      if (gdriveFolderIdValue) setGdriveFolderId(gdriveFolderIdValue)
      if (openaiKey) setOpenaiApiKey(openaiKey)
      if (geminiKey) setGeminiApiKey(geminiKey)
      if (providerRaw === 'auto' || providerRaw === 'openai' || providerRaw === 'gemini') {
        setAiProvider(providerRaw)
      }
      if (prompt) setOpenaiPrompt(prompt)
      if (gatewayBaseUrl) setShareGatewayBaseUrl(gatewayBaseUrl)

      setGlobalConfigReady(true)
    }

    void loadConfig()

    return () => {
      cancelled = true
    }
  }, [getHoloApi, initialOpenaiPrompt, initialShareGatewayBaseUrl, setAppAuthor, setReadOnlyMode, setSeenChangelogVersion, setGitEmail, setAzureBlobContainerUrl, setAzureBlobSasToken, setS3Region, setS3Bucket, setS3AccessKeyId, setS3SecretAccessKey, setS3Endpoint, setS3PublicBaseUrl, setDropboxAccessToken, setDropboxFolderPath, setGdriveAccessToken, setGdriveFolderId, setOpenaiApiKey, setGeminiApiKey, setAiProvider, setOpenaiPrompt, setShareGatewayBaseUrl, setAuthorModalMode, setAuthorModalValue, setShowAuthorModal, setGlobalConfigReady])

  usePersistedConfigValue(values.globalConfigReady, 'app-author', values.appAuthor, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'app-read-only', values.readOnlyMode, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'seen-changelog-version', values.seenChangelogVersion, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'git-email', values.gitEmail, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'azure-container-url', values.azureBlobContainerUrl, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'azure-sas-token', values.azureBlobSasToken, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-region', values.s3Region, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-bucket', values.s3Bucket, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-access-key-id', values.s3AccessKeyId, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-secret-access-key', values.s3SecretAccessKey, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-endpoint', values.s3Endpoint, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 's3-public-base-url', values.s3PublicBaseUrl, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'dropbox-access-token', values.dropboxAccessToken, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'dropbox-folder-path', values.dropboxFolderPath, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'gdrive-access-token', values.gdriveAccessToken, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'gdrive-folder-id', values.gdriveFolderId, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'openai-api-key', values.openaiApiKey, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'gemini-api-key', values.geminiApiKey, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'ai-provider', values.aiProvider, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'openai-prompt', values.openaiPrompt, persistConfigValue)
  usePersistedConfigValue(values.globalConfigReady, 'share-gateway-base-url', values.shareGatewayBaseUrl, persistConfigValue)
}
