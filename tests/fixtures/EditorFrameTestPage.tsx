import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { EditorFrame } from '../../src/parts/EditorFrame'
import { WorkspaceContext, type WorkspaceContextType } from '../../src/contexts/WorkspaceContext'
import { ConfigContext, type ConfigContextType } from '../../src/contexts/ConfigContext'
import '../../src/index.css'

declare global {
  interface Window {
    __PW_MD__?: string
  }
}

export const DEFAULT_EDITOR_FRAME_MD = [
  '---',
  'title: Titre initial',
  'description: Description initiale',
  'author: Playwright',
  'created: 2026-06-05T00:00:00.000Z',
  'updated: 2026-06-05T00:00:00.000Z',
  '---',
  '',
  'Corps initial.',
  '',
].join('\n')

const INITIAL_MD = window.__PW_MD__ ?? DEFAULT_EDITOR_FRAME_MD
const noopDispatch = (() => {}) as unknown as WorkspaceContextType['setRootPath']

function TestApp() {
  const [md, setMd] = useState(INITIAL_MD)

  const workspaceValue = useMemo(() => ({
    rootPath: '/playwright-workspace',
    setRootPath: noopDispatch,
    tree: null,
    setTree: noopDispatch,
    expandedDirectories: new Set<string>(),
    setExpandedDirectories: noopDispatch,
    selectedPath: null,
    setSelectedPath: noopDispatch,
    selectedType: null,
    setSelectedType: noopDispatch,
    draggedPath: null,
    setDraggedPath: noopDispatch,
    dropTargetPath: null,
    setDropTargetPath: noopDispatch,
    recentFolders: [],
    setRecentFolders: noopDispatch,
    recentFilePaths: [],
    setRecentFilePaths: noopDispatch,
    recentFolderIconByPath: {},
    setRecentFolderIconByPath: noopDispatch,
    fileIconByPath: {},
    setFileIconByPath: noopDispatch,
    folderIconByPath: {},
    setFolderIconByPath: noopDispatch,
    fileMetaByPath: {},
    setFileMetaByPath: noopDispatch,
    pathStatsByPath: {},
    setPathStatsByPath: noopDispatch,
    archivedFiles: [],
    setArchivedFiles: noopDispatch,
    activeSidebar: 'files',
    setActiveSidebar: noopDispatch,
    filesSection: 'explorer',
    setFilesSection: noopDispatch,
    contextMenu: null,
    setContextMenu: noopDispatch,
  }) as WorkspaceContextType, [])

  const configValue = useMemo(() => ({
    appAuthor: 'Playwright',
    setAppAuthor: noopDispatch,
    readOnlyMode: false,
    setReadOnlyMode: noopDispatch,
    gitEmail: '',
    setGitEmail: noopDispatch,
    gitState: { conflictedFiles: [] },
    setGitState: noopDispatch,
    isGitBusy: false,
    setIsGitBusy: noopDispatch,
    remoteEditBlock: null,
    setRemoteEditBlock: noopDispatch,
    syncFeedback: null,
    setSyncFeedback: noopDispatch,
    repoImageModeReady: false,
    setRepoImageModeReady: noopDispatch,
    repoImageStorageMode: 'repo',
    setRepoImageStorageMode: noopDispatch,
    azureBlobContainerUrl: '',
    setAzureBlobContainerUrl: noopDispatch,
    azureBlobSasToken: '',
    setAzureBlobSasToken: noopDispatch,
    s3Region: '',
    setS3Region: noopDispatch,
    s3Bucket: '',
    setS3Bucket: noopDispatch,
    s3AccessKeyId: '',
    setS3AccessKeyId: noopDispatch,
    s3SecretAccessKey: '',
    setS3SecretAccessKey: noopDispatch,
    s3Endpoint: '',
    setS3Endpoint: noopDispatch,
    s3PublicBaseUrl: '',
    setS3PublicBaseUrl: noopDispatch,
    dropboxAccessToken: '',
    setDropboxAccessToken: noopDispatch,
    dropboxFolderPath: '',
    setDropboxFolderPath: noopDispatch,
    gdriveAccessToken: '',
    setGdriveAccessToken: noopDispatch,
    gdriveFolderId: '',
    setGdriveFolderId: noopDispatch,
    openaiApiKey: '',
    setOpenaiApiKey: noopDispatch,
    geminiApiKey: '',
    setGeminiApiKey: noopDispatch,
    aiProvider: 'auto',
    setAiProvider: noopDispatch,
    openaiPrompt: '',
    setOpenaiPrompt: noopDispatch,
    shareGatewayBaseUrl: '',
    setShareGatewayBaseUrl: noopDispatch,
  }) as ConfigContextType, [])

  return (
    <WorkspaceContext.Provider value={workspaceValue}>
      <ConfigContext.Provider value={configValue}>
        <div data-testid="editor-frame-fixture" style={{ padding: '24px', maxWidth: '960px', margin: '0 auto' }}>
          <pre id="pw-editorframe-md-output" data-testid="pw-editorframe-md-output" style={{ display: 'none' }}>{md}</pre>
          <EditorFrame filepath="/playwright-workspace/doc.md" markdown={md} onMarkdownChange={setMd} />
        </div>
      </ConfigContext.Provider>
    </WorkspaceContext.Provider>
  )
}

createRoot(document.getElementById('root')!).render(<TestApp />)