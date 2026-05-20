import { SettingsModal } from './SettingsModal'
import { useConfig } from '../contexts/ConfigContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'
import { CHANGELOG_ENTRIES } from '../constants/changelog'

interface AppSettingsModalProps {
  appVersion: string
  currentVersionChangelog: import('../types/shared').ChangelogEntry | undefined | null
  updateAvailable: boolean
  updateReady: boolean
  saveRepoImageConfig: () => Promise<void>
  submitAuthorProfile: () => void
  openChangelog: (version: string) => void
}

export function AppSettingsModal({
  appVersion,
  currentVersionChangelog,
  updateAvailable,
  updateReady,
  saveRepoImageConfig,
  submitAuthorProfile,
  openChangelog,
}: AppSettingsModalProps) {
  const {
    appAuthor, setAppAuthor, gitEmail, setGitEmail,
    repoImageStorageMode, setRepoImageStorageMode, repoImageModeReady,
    azureBlobContainerUrl, setAzureBlobContainerUrl,
    azureBlobSasToken, setAzureBlobSasToken,
    s3Region, setS3Region, s3Bucket, setS3Bucket,
    s3AccessKeyId, setS3AccessKeyId, s3SecretAccessKey, setS3SecretAccessKey,
    s3Endpoint, setS3Endpoint, s3PublicBaseUrl, setS3PublicBaseUrl,
    dropboxAccessToken, setDropboxAccessToken, dropboxFolderPath, setDropboxFolderPath,
    gdriveAccessToken, setGdriveAccessToken, gdriveFolderId, setGdriveFolderId,
    aiProvider, setAiProvider, geminiApiKey, setGeminiApiKey,
    openaiApiKey, setOpenaiApiKey, openaiPrompt, setOpenaiPrompt,
    shareGatewayBaseUrl, setShareGatewayBaseUrl,
  } = useConfig()
  const { rootPath } = useWorkspace()
  const {
    showSettings, setShowSettings, seenChangelogVersion,
    showAuthorModal, authorModalMode, authorModalValue,
    setAuthorModalValue, setShowAuthorModal,
  } = useUI()

  if (!showSettings) return null

  return (
    <SettingsModal
      showSettings={showSettings}
      onClose={() => setShowSettings(false)}
      appAuthor={appAuthor}
      onSetAppAuthor={setAppAuthor}
      gitEmail={gitEmail}
      onSetGitEmail={setGitEmail}
      repoImageStorageMode={repoImageStorageMode}
      onSetRepoImageStorageMode={setRepoImageStorageMode}
      azureBlobContainerUrl={azureBlobContainerUrl}
      onSetAzureBlobContainerUrl={setAzureBlobContainerUrl}
      azureBlobSasToken={azureBlobSasToken}
      onSetAzureBlobSasToken={setAzureBlobSasToken}
      s3Region={s3Region}
      onSetS3Region={setS3Region}
      s3Bucket={s3Bucket}
      onSetS3Bucket={setS3Bucket}
      s3AccessKeyId={s3AccessKeyId}
      onSetS3AccessKeyId={setS3AccessKeyId}
      s3SecretAccessKey={s3SecretAccessKey}
      onSetS3SecretAccessKey={setS3SecretAccessKey}
      s3Endpoint={s3Endpoint}
      onSetS3Endpoint={setS3Endpoint}
      s3PublicBaseUrl={s3PublicBaseUrl}
      onSetS3PublicBaseUrl={setS3PublicBaseUrl}
      dropboxAccessToken={dropboxAccessToken}
      onSetDropboxAccessToken={setDropboxAccessToken}
      dropboxFolderPath={dropboxFolderPath}
      onSetDropboxFolderPath={setDropboxFolderPath}
      gdriveAccessToken={gdriveAccessToken}
      onSetGdriveAccessToken={setGdriveAccessToken}
      gdriveFolderId={gdriveFolderId}
      onSetGdriveFolderId={setGdriveFolderId}
      repoImageModeReady={repoImageModeReady}
      onSaveRepoImageConfig={() => { void saveRepoImageConfig() }}
      rootPath={rootPath}
      aiProvider={aiProvider}
      onSetAiProvider={setAiProvider}
      geminiApiKey={geminiApiKey}
      onSetGeminiApiKey={setGeminiApiKey}
      openaiApiKey={openaiApiKey}
      onSetOpenaiApiKey={setOpenaiApiKey}
      openaiPrompt={openaiPrompt}
      onSetOpenaiPrompt={setOpenaiPrompt}
      appVersion={appVersion}
      currentVersionChangelog={currentVersionChangelog ?? null}
      seenChangelogVersion={seenChangelogVersion}
      changelogEntries={CHANGELOG_ENTRIES}
      onOpenChangelog={openChangelog}      updateAvailable={updateAvailable}
      updateReady={updateReady}
      onCheckForUpdates={() => { void window.holo?.checkForUpdates() }}
      onInstallUpdate={() => { void window.holo?.installUpdate() }}
      shareGatewayBaseUrl={shareGatewayBaseUrl}
      onSetShareGatewayBaseUrl={setShareGatewayBaseUrl}
      showAuthorModal={showAuthorModal}
      authorModalMode={authorModalMode}
      authorModalValue={authorModalValue}
      onSetAuthorModalValue={setAuthorModalValue}
      onCloseAuthorModal={() => setShowAuthorModal(false)}
      onSubmitAuthorProfile={submitAuthorProfile}
    />
  )
}
