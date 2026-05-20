import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { ImageStorageMode } from '../hooks/useRepoImageSettings'
import type { GitState, RemoteEditBlock } from '../types/git'

export interface ConfigContextType {
  // App Author
  appAuthor: string
  setAppAuthor: Dispatch<SetStateAction<string>>

  // Readonly Mode (moved from EditorContext for config purposes)
  readOnlyMode: boolean
  setReadOnlyMode: Dispatch<SetStateAction<boolean>>

  // Git Configuration
  gitEmail: string
  setGitEmail: Dispatch<SetStateAction<string>>
  gitState: GitState
  setGitState: Dispatch<SetStateAction<GitState>>
  isGitBusy: boolean
  setIsGitBusy: Dispatch<SetStateAction<boolean>>
  remoteEditBlock: RemoteEditBlock
  setRemoteEditBlock: Dispatch<SetStateAction<RemoteEditBlock>>
  syncFeedback: any
  setSyncFeedback: Dispatch<SetStateAction<any>>

  // Image Storage Configuration
  repoImageModeReady: boolean
  setRepoImageModeReady: Dispatch<SetStateAction<boolean>>
  repoImageStorageMode: ImageStorageMode
  setRepoImageStorageMode: Dispatch<SetStateAction<ImageStorageMode>>

  // Azure Blob Configuration
  azureBlobContainerUrl: string
  setAzureBlobContainerUrl: Dispatch<SetStateAction<string>>
  azureBlobSasToken: string
  setAzureBlobSasToken: Dispatch<SetStateAction<string>>

  // S3 Configuration
  s3Region: string
  setS3Region: Dispatch<SetStateAction<string>>
  s3Bucket: string
  setS3Bucket: Dispatch<SetStateAction<string>>
  s3AccessKeyId: string
  setS3AccessKeyId: Dispatch<SetStateAction<string>>
  s3SecretAccessKey: string
  setS3SecretAccessKey: Dispatch<SetStateAction<string>>
  s3Endpoint: string
  setS3Endpoint: Dispatch<SetStateAction<string>>
  s3PublicBaseUrl: string
  setS3PublicBaseUrl: Dispatch<SetStateAction<string>>

  // Dropbox Configuration
  dropboxAccessToken: string
  setDropboxAccessToken: Dispatch<SetStateAction<string>>
  dropboxFolderPath: string
  setDropboxFolderPath: Dispatch<SetStateAction<string>>

  // Google Drive Configuration
  gdriveAccessToken: string
  setGdriveAccessToken: Dispatch<SetStateAction<string>>
  gdriveFolderId: string
  setGdriveFolderId: Dispatch<SetStateAction<string>>

  // AI Configuration
  openaiApiKey: string
  setOpenaiApiKey: Dispatch<SetStateAction<string>>
  geminiApiKey: string
  setGeminiApiKey: Dispatch<SetStateAction<string>>
  aiProvider: 'auto' | 'openai' | 'gemini'
  setAiProvider: Dispatch<SetStateAction<'auto' | 'openai' | 'gemini'>>
  openaiPrompt: string
  setOpenaiPrompt: Dispatch<SetStateAction<string>>

  // Share Gateway
  shareGatewayBaseUrl: string
  setShareGatewayBaseUrl: Dispatch<SetStateAction<string>>
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

export function useConfig() {
  const context = useContext(ConfigContext)
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider')
  }
  return context
}

export { ConfigContext }
