import { useCallback, useEffect } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'

export function useGlobalConfig({ getHoloApi }: { getHoloApi: () => Window['holo'] | null }) {
  const {
    appAuthor, readOnlyMode, gitEmail,
    azureBlobContainerUrl, azureBlobSasToken, s3Region, s3Bucket,
    s3AccessKeyId, s3SecretAccessKey, s3Endpoint, s3PublicBaseUrl,
    dropboxAccessToken, dropboxFolderPath, gdriveAccessToken, gdriveFolderId,
    openaiApiKey, geminiApiKey, aiProvider, openaiPrompt, shareGatewayBaseUrl,
    setAppAuthor, setReadOnlyMode, setGitEmail,
    setAzureBlobContainerUrl, setAzureBlobSasToken, setS3Region, setS3Bucket,
    setS3AccessKeyId, setS3SecretAccessKey, setS3Endpoint, setS3PublicBaseUrl,
    setDropboxAccessToken, setDropboxFolderPath, setGdriveAccessToken, setGdriveFolderId,
    setOpenaiApiKey, setGeminiApiKey, setAiProvider, setOpenaiPrompt, setShareGatewayBaseUrl,
  } = useConfig()
  const {
    globalConfigReady, seenChangelogVersion, setSeenChangelogVersion, setGlobalConfigReady,
    setAuthorModalMode, setAuthorModalValue, setShowAuthorModal,
  } = useUI()

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
      const prompt = fromConfigOrLocal('openai-prompt', 'holo-openai-prompt', openaiPrompt)
      const gatewayBaseUrl = fromConfigOrLocal('share-gateway-base-url', 'holo-share-gateway-url', shareGatewayBaseUrl)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getHoloApi])

  // Persist each config value when it changes
  useEffect(() => { if (globalConfigReady) void persistConfigValue('app-author', appAuthor) }, [globalConfigReady, appAuthor, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('app-read-only', readOnlyMode) }, [globalConfigReady, readOnlyMode, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('seen-changelog-version', seenChangelogVersion) }, [globalConfigReady, seenChangelogVersion, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('git-email', gitEmail) }, [globalConfigReady, gitEmail, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('azure-container-url', azureBlobContainerUrl) }, [globalConfigReady, azureBlobContainerUrl, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('azure-sas-token', azureBlobSasToken) }, [globalConfigReady, azureBlobSasToken, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-region', s3Region) }, [globalConfigReady, s3Region, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-bucket', s3Bucket) }, [globalConfigReady, s3Bucket, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-access-key-id', s3AccessKeyId) }, [globalConfigReady, s3AccessKeyId, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-secret-access-key', s3SecretAccessKey) }, [globalConfigReady, s3SecretAccessKey, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-endpoint', s3Endpoint) }, [globalConfigReady, s3Endpoint, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('s3-public-base-url', s3PublicBaseUrl) }, [globalConfigReady, s3PublicBaseUrl, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('dropbox-access-token', dropboxAccessToken) }, [globalConfigReady, dropboxAccessToken, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('dropbox-folder-path', dropboxFolderPath) }, [globalConfigReady, dropboxFolderPath, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('gdrive-access-token', gdriveAccessToken) }, [globalConfigReady, gdriveAccessToken, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('gdrive-folder-id', gdriveFolderId) }, [globalConfigReady, gdriveFolderId, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('openai-api-key', openaiApiKey) }, [globalConfigReady, openaiApiKey, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('gemini-api-key', geminiApiKey) }, [globalConfigReady, geminiApiKey, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('ai-provider', aiProvider) }, [globalConfigReady, aiProvider, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('openai-prompt', openaiPrompt) }, [globalConfigReady, openaiPrompt, persistConfigValue])
  useEffect(() => { if (globalConfigReady) void persistConfigValue('share-gateway-base-url', shareGatewayBaseUrl) }, [globalConfigReady, shareGatewayBaseUrl, persistConfigValue])
}
