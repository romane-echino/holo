import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { cn } from './utils/global'
import { FavoritePanel, AIPanel, Header, RecentPanel, Inspector, SearchModal, Sidebar, Onboarding, HoloSettingsDialog } from "./parts/"
import type { OnboardingWelcomeValue, HoloSettingsValue } from "./parts/"
import type { HoloDocument } from './parts/RecentPanel'
import { useWorkspace } from './contexts/WorkspaceContext'
import { useConfig } from './contexts/ConfigContext'
import { getBaseName, buildShareableHoloLink } from './lib/appUtils'
import { updateMarkdownBooleanHeaderField } from './lib/markdown'
import { usePopup } from './hooks/usePopup'
import { AddSpace } from './popup/AddSpace'
import { SpaceRoute } from './parts/SpacePanel'
import type { SpaceFileNode, TreeFileMeta } from './parts/SpacePanel'
import { Clock, Star, Bot, Archive, Folder, FileText, X } from 'lucide-react'
import { EditorFrame } from './parts/EditorFrame'
import { SpaceCredentialsModal } from './parts/SpaceCredentialsModal'
import type { SpaceCredentials } from './parts/Settings'
import { AppUpdateNotification } from './parts/AppUpdateNotification'
import { useAppUpdates } from './hooks/useAppUpdates'
import { applyTheme, applyAccent } from './lib/themeUtils'

// Extraction rapide des 3 champs frontmatter pour la mise à jour live de l'arborescence
function extractFmMeta(md: string): TreeFileMeta {
  const match = md.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result: TreeFileMeta = {}
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    if (key !== 'title' && key !== 'description' && key !== 'icon') continue
    const value = line.slice(colon + 1).trim().replace(/^['"']|['"']$/g, '')
    if (value) result[key as 'title' | 'description' | 'icon'] = value
  }
  return result
}


const PRIMARY_ITEMS = [
  { label: 'Récents', icon: Clock, to: '/recent' },
  { label: 'Favoris', icon: Star, to: '/favorites' },
  { label: 'Assistant IA', icon: Bot, to: '/ai' },
]

export default function App2() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const hasPanel = pathname !== '/'

  const { updateAvailable, updateReady, updateProgress, dismissUpdate } = useAppUpdates()

  const { appAuthor, gitEmail, gitState, setAppAuthor, setGitEmail,
    setAzureBlobContainerUrl, setAzureBlobSasToken,
    setS3Region, setS3Bucket, setS3AccessKeyId, setS3SecretAccessKey, setS3Endpoint, setS3PublicBaseUrl,
    setDropboxAccessToken, setDropboxFolderPath,
    setGdriveAccessToken, setGdriveFolderId,
    setRepoImageStorageMode,
    shareGatewayBaseUrl,
  } = useConfig()

  const { recentFolders, rootPath, recentFilePaths, fileMetaByPath, setFileMetaByPath, setRecentFilePaths, setRecentFolders } = useWorkspace()

  // ─── Favoris d'espaces ────────────────────────────────────────────────────
  const [favoriteFolders, setFavoriteFolders] = useState<string[]>([])

  // ─── Favoris de fichiers ──────────────────────────────────────────────────
  const [favoriteFilePaths, setFavoriteFilePaths] = useState<string[]>([])

  // ─── Recherche modale ─────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)

  // ─── Onboarding ───────────────────────────────────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)
  const [settingsValue, setSettingsValue] = useState<HoloSettingsValue | undefined>(undefined)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    if (!window.holo) { setOnboardingDone(true); return }
    window.holo.getHoloConfig()
      .then(async cfg => {
        // Onboarding
        if (import.meta.env.DEV) {
          setOnboardingDone(true)
        } else {
          const hasAuthor = typeof cfg['app-author'] === 'string' && (cfg['app-author'] as string).trim().length > 0
          const alreadyDone = cfg['app-onboarding-done'] === true
          setOnboardingDone(hasAuthor || alreadyDone)
        }
        // Favoris
        const savedFavs = cfg['space-favorites']
        if (Array.isArray(savedFavs)) setFavoriteFolders(savedFavs as string[])
        // Favoris fichiers
        const savedFileFavs = cfg['file-favorites']
        if (Array.isArray(savedFileFavs)) setFavoriteFilePaths(savedFileFavs as string[])
        // Fichiers récents — purger les chemins qui n'existent plus (archivés, supprimés)
        const savedRecents = cfg['recent-file-paths']
        if (Array.isArray(savedRecents)) {
          try {
            const existing = await window.holo?.filterExistingPaths(savedRecents as string[])
            setRecentFilePaths(existing ?? (savedRecents as string[]))
          } catch {
            setRecentFilePaths(savedRecents as string[])
          }
        }
        // Apparence
        const theme = (cfg['theme'] as HoloSettingsValue['theme']) ?? 'dark'
        const accent = (cfg['accent'] as HoloSettingsValue['accent']) ?? 'violet'
        applyTheme(theme)
        applyAccent(accent)
        // Valeurs settings
        const firstName = cfg['app-author-first-name'] as string || ''
        const lastName = cfg['app-author-last-name'] as string || ''
        const gitEmailValue = cfg['git-email'] as string || ''
        const fullName = `${firstName} ${lastName}`.trim() || cfg['app-author'] as string || ''
        // Restaure l'auteur et l'email dans le ConfigContext (affiché dans la Sidebar)
        if (fullName) setAppAuthor(fullName)
        if (gitEmailValue) setGitEmail(gitEmailValue)
        // Restaure les identifiants de stockage dans le ConfigContext
        setAzureBlobContainerUrl(cfg['azure-container-url'] as string || '')
        setAzureBlobSasToken(cfg['azure-sas-token'] as string || '')
        setS3Region(cfg['s3-region'] as string || '')
        setS3Bucket(cfg['s3-bucket'] as string || '')
        setS3AccessKeyId(cfg['s3-access-key-id'] as string || '')
        setS3SecretAccessKey(cfg['s3-secret-access-key'] as string || '')
        setS3Endpoint(cfg['s3-endpoint'] as string || '')
        setS3PublicBaseUrl(cfg['s3-public-base-url'] as string || '')
        setDropboxAccessToken(cfg['dropbox-access-token'] as string || '')
        setDropboxFolderPath(cfg['dropbox-folder-path'] as string || '')
        setGdriveAccessToken(cfg['gdrive-access-token'] as string || '')
        setGdriveFolderId(cfg['gdrive-folder-id'] as string || '')
        setSettingsValue({
          firstName,
          lastName,
          gitEmail: gitEmailValue,
          azureContainerUrl: cfg['azure-container-url'] as string || '',
          azureSasToken: cfg['azure-sas-token'] as string || '',
          s3Region: cfg['s3-region'] as string || '',
          s3Bucket: cfg['s3-bucket'] as string || '',
          s3AccessKeyId: cfg['s3-access-key-id'] as string || '',
          s3SecretAccessKey: cfg['s3-secret-access-key'] as string || '',
          s3Endpoint: cfg['s3-endpoint'] as string || '',
          s3PublicBaseUrl: cfg['s3-public-base-url'] as string || '',
          dropboxAccessToken: cfg['dropbox-access-token'] as string || '',
          dropboxFolderPath: cfg['dropbox-folder-path'] as string || '',
          gdriveAccessToken: cfg['gdrive-access-token'] as string || '',
          gdriveFolderId: cfg['gdrive-folder-id'] as string || '',
          aiProvider: (cfg['ai-provider'] as HoloSettingsValue['aiProvider']) ?? 'local',
          geminiApiKey: cfg['gemini-api-key'] as string || '',
          openAiApiKey: cfg['openai-api-key'] as string || '',
          systemPrompt: cfg['ai-system-prompt'] as string || '',
          theme,
          accent,
        })
      })
      .catch(() => setOnboardingDone(true))
  }, [])

  const handleOnboardingSubmit = useCallback(async (v: OnboardingWelcomeValue) => {
    const fullName = `${v.firstName.trim()} ${v.lastName.trim()}`.trim()
    setAppAuthor(fullName)
    setGitEmail(v.email.trim())
    await Promise.all([
      window.holo?.setHoloConfigValue('app-author', fullName),
      window.holo?.setHoloConfigValue('app-author-first-name', v.firstName.trim()),
      window.holo?.setHoloConfigValue('app-author-last-name', v.lastName.trim()),
      window.holo?.setHoloConfigValue('git-email', v.email.trim()),
      window.holo?.setHoloConfigValue('app-onboarding-done', true),
    ])
    // Sync settingsValue so the Settings dialog shows the submitted name/email
    setSettingsValue(prev => ({
      ...(prev ?? {} as HoloSettingsValue),
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      gitEmail: v.email.trim(),
    }))
    setOnboardingDone(true)
  }, [setAppAuthor, setGitEmail])

  const handleOnboardingSkip = useCallback(async () => {
    await window.holo?.setHoloConfigValue('app-onboarding-done', true)
    setOnboardingDone(true)
  }, [])

  // ─── Sauvegarde des paramètres ────────────────────────────────────────────
  const handleSettingsSave = useCallback(async (value: HoloSettingsValue) => {
    const fullName = `${value.firstName?.trim() ?? ''} ${value.lastName?.trim() ?? ''}`.trim()
    // Lire le config existant et merger en une seule écriture atomique
    const existing = await window.holo?.getHoloConfig() ?? {}
    await window.holo?.setHoloConfig({
      ...existing,
      'app-author': fullName,
      'app-author-first-name': value.firstName?.trim() ?? '',
      'app-author-last-name': value.lastName?.trim() ?? '',
      'git-email': value.gitEmail?.trim() ?? '',
      'azure-container-url': value.azureContainerUrl ?? '',
      'azure-sas-token': value.azureSasToken ?? '',
      's3-region': value.s3Region ?? '',
      's3-bucket': value.s3Bucket ?? '',
      's3-access-key-id': value.s3AccessKeyId ?? '',
      's3-secret-access-key': value.s3SecretAccessKey ?? '',
      's3-endpoint': value.s3Endpoint ?? '',
      's3-public-base-url': value.s3PublicBaseUrl ?? '',
      'dropbox-access-token': value.dropboxAccessToken ?? '',
      'dropbox-folder-path': value.dropboxFolderPath ?? '',
      'gdrive-access-token': value.gdriveAccessToken ?? '',
      'gdrive-folder-id': value.gdriveFolderId ?? '',
      'ai-provider': value.aiProvider ?? 'local',
      'gemini-api-key': value.geminiApiKey ?? '',
      'openai-api-key': value.openAiApiKey ?? '',
      'ai-system-prompt': value.systemPrompt ?? '',
      'theme': value.theme ?? 'dark',
      'accent': value.accent ?? 'violet',
    })
    // Update ConfigContext credentials
    setAzureBlobContainerUrl(value.azureContainerUrl ?? '')
    setAzureBlobSasToken(value.azureSasToken ?? '')
    setS3Region(value.s3Region ?? '')
    setS3Bucket(value.s3Bucket ?? '')
    setS3AccessKeyId(value.s3AccessKeyId ?? '')
    setS3SecretAccessKey(value.s3SecretAccessKey ?? '')
    setS3Endpoint(value.s3Endpoint ?? '')
    setS3PublicBaseUrl(value.s3PublicBaseUrl ?? '')
    setDropboxAccessToken(value.dropboxAccessToken ?? '')
    setDropboxFolderPath(value.dropboxFolderPath ?? '')
    setGdriveAccessToken(value.gdriveAccessToken ?? '')
    setGdriveFolderId(value.gdriveFolderId ?? '')
    if (fullName) setAppAuthor(fullName)
    if (value.gitEmail) setGitEmail(value.gitEmail.trim())
    applyTheme(value.theme ?? 'dark')
    applyAccent(value.accent ?? 'violet')
    setSettingsValue(value)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 3000)
  }, [setAppAuthor, setGitEmail, setAzureBlobContainerUrl, setAzureBlobSasToken, setS3Region, setS3Bucket, setS3AccessKeyId, setS3SecretAccessKey, setS3Endpoint, setS3PublicBaseUrl, setDropboxAccessToken, setDropboxFolderPath, setGdriveAccessToken, setGdriveFolderId])

  const handleSaveSpaceConfig = useCallback(async (spacePath: string, mode: string, credentials: SpaceCredentials) => {
    try {
      // Mode → .holo.json (commité)
      const existingSpace = (await window.holo?.readSpaceConfig(spacePath).catch(() => null)) ?? {}
      await window.holo?.writeSpaceConfig(spacePath, { ...existingSpace, imageStorageMode: mode })
      // Commit .holo.json via git auto-save
      const holoJsonPath = `${spacePath}/.holo.json`
      window.holo?.gitAutoSave(holoJsonPath, appAuthor || undefined, gitEmail || undefined).catch(() => {})
      // Identifiants → app config local (non commité), indexés par spacePath
      const appCfg = await window.holo?.getHoloConfig().catch(() => ({})) ?? {}
      const allCreds = (appCfg as any)['space-credentials'] ?? {}
      await window.holo?.setHoloConfig({
        ...(appCfg as any),
        'space-credentials': { ...allCreds, [spacePath]: credentials },
      })
      // Si c'est l'espace actif, mettre à jour le ConfigContext
      if (spacePath === rootPath) {
        setAzureBlobContainerUrl(credentials.azureContainerUrl ?? '')
        setAzureBlobSasToken(credentials.azureSasToken ?? '')
        setS3Region(credentials.s3Region ?? '')
        setS3Bucket(credentials.s3Bucket ?? '')
        setS3AccessKeyId(credentials.s3AccessKeyId ?? '')
        setS3SecretAccessKey(credentials.s3SecretAccessKey ?? '')
        setS3Endpoint(credentials.s3Endpoint ?? '')
        setS3PublicBaseUrl(credentials.s3PublicBaseUrl ?? '')
        setDropboxAccessToken(credentials.dropboxAccessToken ?? '')
        setDropboxFolderPath(credentials.dropboxFolderPath ?? '')
        setGdriveAccessToken(credentials.gdriveAccessToken ?? '')
        setGdriveFolderId(credentials.gdriveFolderId ?? '')
        setRepoImageStorageMode(mode as any)
      }
    } catch (err) {
      console.error('[App2] handleSaveSpaceConfig', err)
    }
  }, [rootPath, appAuthor, gitEmail, setAzureBlobContainerUrl, setAzureBlobSasToken, setS3Region, setS3Bucket, setS3AccessKeyId, setS3SecretAccessKey, setS3Endpoint, setS3PublicBaseUrl, setDropboxAccessToken, setDropboxFolderPath, setGdriveAccessToken, setGdriveFolderId, setRepoImageStorageMode])

  // ─── Identifiants manquants pour l'espace actif ────────────────────────────
  const [pendingCredentials, setPendingCredentials] = useState<{ spacePath: string; mode: string } | null>(null)

  useEffect(() => {
    if (!rootPath || !window.holo) return
    let cancelled = false
    ;(async () => {
      try {
        const [spaceCfg, appCfg] = await Promise.all([
          window.holo!.readSpaceConfig(rootPath).catch(() => null),
          window.holo!.getHoloConfig().catch(() => ({})),
        ])
        if (cancelled) return
        const mode = (spaceCfg as any)?.imageStorageMode ?? 'local'
        if (mode === 'local') return
        const allCreds = ((appCfg as any)?.['space-credentials'] ?? {}) as Record<string, Record<string, string>>
        const creds = allCreds[rootPath] ?? {}
        const hasAzure = !!(creds.azureContainerUrl?.trim() && creds.azureSasToken?.trim())
        const hasS3 = !!(creds.s3Region?.trim() && creds.s3Bucket?.trim() && creds.s3AccessKeyId?.trim() && creds.s3SecretAccessKey?.trim())
        const hasDropbox = !!creds.dropboxAccessToken?.trim()
        const hasGdrive = !!creds.gdriveAccessToken?.trim()
        const credOk = (mode === 'azure' && hasAzure) || (mode === 's3' && hasS3) || (mode === 'dropbox' && hasDropbox) || (mode === 'gdrive' && hasGdrive)
        if (!credOk) setPendingCredentials({ spacePath: rootPath, mode })
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [rootPath])

  // Listener pour le thème "system" (préférence OS)
  useEffect(() => {
    if (settingsValue?.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settingsValue?.theme])

  // Chargement initial des espaces (dossiers récents) depuis l'IPC Electron
  useEffect(() => {
    if (!window.holo) return
    window.holo.getRecentFolders()
      .then(folders => {
        if (Array.isArray(folders)) {
          setRecentFolders(folders)
          // Enregistrer tous les espaces connus dans main.js pour autoriser la lecture cross-espace
          window.holo?.registerKnownRoots(folders).catch(() => {})
        }
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persistance des fichiers récents
  useEffect(() => {
    if (recentFilePaths.length === 0) return
    window.holo?.setHoloConfigValue('recent-file-paths', recentFilePaths)
  }, [recentFilePaths])

  // ─── Statuts git de tous les espaces ─────────────────────────────────────
  type SpaceStatus = 'local' | 'git-sync' | 'git-readonly'
  const [spaceStatuses, setSpaceStatuses] = useState<Record<string, SpaceStatus>>({})

  useEffect(() => {
    if (!window.holo || recentFolders.length === 0) return
    window.holo.gitGetFolderStatuses(recentFolders)
      .then(s => setSpaceStatuses(s as Record<string, SpaceStatus>))
      .catch(() => {})
  }, [recentFolders])

  // Mise à jour temps-réel de l'espace actif depuis gitState
  useEffect(() => {
    if (!rootPath) return
    const status: SpaceStatus = !gitState.isRepo ? 'local' : gitState.hasRemote ? 'git-sync' : 'git-readonly'
    setSpaceStatuses(prev => ({ ...prev, [rootPath]: status }))
  }, [rootPath, gitState])

  // Navigation automatique vers l'espace quand un dossier est ouvert
  const prevRootPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!rootPath || rootPath === prevRootPathRef.current) return
    prevRootPathRef.current = rootPath
    navigate(`/space/${encodeURIComponent(rootPath)}`)
  }, [rootPath, navigate])

  // Raccourci clavier Ctrl+K → ouvrir/fermer la recherche
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const spaces = useMemo(
    () =>
      [...recentFolders]
        .sort((a, b) => getBaseName(a).localeCompare(getBaseName(b)))
        .map((path) => ({
          label: getBaseName(path),
          icon: Folder,
          to: `/space/${encodeURIComponent(path)}`,
          path,
        })),
    [recentFolders],
  )

  const addSpace = usePopup()

  const handleSpaceFavorite = useCallback((folderPath: string) => {
    setFavoriteFolders(prev => {
      const next = prev.includes(folderPath)
        ? prev.filter(p => p !== folderPath)
        : [...prev, folderPath]
      window.holo?.setHoloConfigValue('space-favorites', next)
      return next
    })
  }, [])

  const handleFileFavorite = useCallback((filePath: string) => {
    setFavoriteFilePaths(prev => {
      const next = prev.includes(filePath)
        ? prev.filter(p => p !== filePath)
        : [...prev, filePath]
      window.holo?.setHoloConfigValue('file-favorites', next)
      return next
    })
  }, [])

  const handleSpaceRemove = useCallback((folderPath: string) => {
    window.holo?.removeRecentFolder(folderPath)
    setRecentFolders(prev => prev.filter(p => p !== folderPath))
    setFavoriteFolders(prev => {
      const next = prev.filter(p => p !== folderPath)
      window.holo?.setHoloConfigValue('space-favorites', next)
      return next
    })
  }, [setRecentFolders])

  const handleSpaceOpenInExplorer = useCallback((folderPath: string) => {
    window.holo?.showItemInFolder(folderPath)
  }, [])

  // ─── Inspecteur (popover < 3xl) ───────────────────────────────────────
  const [inspectorOpen, setInspectorOpen] = useState(false)

  // ─── Paramètres ───────────────────────────────────────────────────────
  const [settingsOpen, setSettingsOpen] = useState(false)

  // ─── Taille de police de l'éditeur ────────────────────────────────────
  const [editorFontSize, setEditorFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('holo-editor-font-size')
    return saved ? Math.max(50, Math.min(150, Number(saved))) : 100
  })
  const handleEditorFontSizeChange = useCallback((v: number) => {
    setEditorFontSize(v)
    localStorage.setItem('holo-editor-font-size', String(v))
  }, [])

  // ─── Navigation mobile (panel ↔ editor) ───────────────────────────────
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false)
  const [pendingArchivePath, setPendingArchivePath] = useState<string | null>(null)

  const handleRestoreFile = useCallback(async (path: string) => {
    try {
      await window.holo?.restoreArchivedPath(path)
      window.dispatchEvent(new CustomEvent('holo:close-file', { detail: { path } }))
      window.dispatchEvent(new CustomEvent('holo:refresh-tree'))
      void window.holo?.gitAutoSave(null as unknown as string)
    } catch (err) {
      console.error('[App2] Impossible de restaurer :', err)
    }
  }, [])
  // ─── Métadonnées live du fichier ouvert (pour mise à jour immédiate de l'arborescence)
  const [currentFileMeta, setCurrentFileMeta] = useState<(TreeFileMeta & { path: string }) | undefined>(undefined)
  // ─── Fichier ouvert ────────────────────────────────────────────────────────
  type OpenedFile = { path: string; name: string; content: string }
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null)
  // Ref pour éviter les closures stales dans le callback de sauvegarde
  const openedFileRef = useRef<OpenedFile | null>(null)
  openedFileRef.current = openedFile
  // Ref stable pour appeler performGitSave sans forward reference
  const performGitSaveRef = useRef<() => Promise<void>>(async () => {})
  // Markdown live (mis à jour à chaque keystroke) — pour l'Inspector en temps réel
  const [liveMarkdown, setLiveMarkdown] = useState<string | null>(null)

  const handleSelectFile = useCallback(async (node: SpaceFileNode) => {
    if (node.type !== 'file') return
    // Annuler le timer de sauvegarde différée et déclencher immédiatement le git save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    // Git save immédiat du fichier précédent avant de switcher
    void performGitSaveRef.current()
    try {
      const content = await window.holo?.readFile(node.path) ?? ''
      setOpenedFile({ path: node.path, name: node.name, content })
      setLiveMarkdown(null) // réinitialiser le contenu live lors du changement de fichier
      setRecentFilePaths(prev => [node.path, ...prev.filter(p => p !== node.path)].slice(0, 50))
      setMobileEditorOpen(true)
    } catch (err) {
      console.error('[App2] Impossible de charger le fichier :', err)
    }
  }, [setRecentFilePaths])

  // ─── Données pour le panel Récents ────────────────────────────────────────
  const recentDocuments = useMemo<HoloDocument[]>(
    () => recentFilePaths.map(filePath => {
      const meta = fileMetaByPath[filePath]
      const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
      return {
        title: meta?.title || getBaseName(filePath).replace(/\.md$/i, ''),
        to: filePath,
        icon: '📄',
        subtitle: spacePath ? getBaseName(spacePath) : undefined,
        active: openedFile?.path === filePath,
      }
    }),
    [recentFilePaths, fileMetaByPath, recentFolders, openedFile?.path],
  )

  const handleRecentDocumentSelect = useCallback(async (doc: HoloDocument) => {
    const filePath = doc.to
    const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
    if (spacePath) {
      navigate(`/space/${encodeURIComponent(spacePath)}`)
      // Electron vérifie que le fichier est dans currentRootPath → on s'assure d'abord que le bon espace est ouvert
      await window.holo?.openRecentFolder(spacePath).catch(() => null)
    }
    void handleSelectFile({ id: filePath, path: filePath, name: getBaseName(filePath), type: 'file' })
  }, [recentFolders, navigate, handleSelectFile])

  const handleEmptyRecent = useCallback(() => {
    setRecentFilePaths([])
  }, [setRecentFilePaths])

  // ─── Données pour le panel Favoris ────────────────────────────────────────
  const favoriteDocuments = useMemo<HoloDocument[]>(
    () => favoriteFilePaths.map(filePath => {
      const meta = fileMetaByPath[filePath]
      const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
      return {
        title: meta?.title || getBaseName(filePath).replace(/\.md$/i, ''),
        to: filePath,
        icon: '📄',
        subtitle: spacePath ? getBaseName(spacePath) : undefined,
        active: openedFile?.path === filePath,
      }
    }),
    [favoriteFilePaths, fileMetaByPath, recentFolders, openedFile?.path],
  )

  const handleFavoriteDocumentSelect = useCallback(async (doc: HoloDocument) => {
    const filePath = doc.to
    const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
    if (spacePath) {
      navigate(`/space/${encodeURIComponent(spacePath)}`)
      await window.holo?.openRecentFolder(spacePath).catch(() => null)
    }
    void handleSelectFile({ id: filePath, path: filePath, name: getBaseName(filePath), type: 'file' })
  }, [recentFolders, navigate, handleSelectFile])

  // ─── Lien de partage ─────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const filePath = openedFileRef.current?.path
    if (!filePath) return
    const link = buildShareableHoloLink(rootPath, filePath, shareGatewayBaseUrl)
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // fallback for Electron context
      window.holo?.writeClipboardText?.(link)
    }
  }, [rootPath, shareGatewayBaseUrl])

  // ─── Sauvegarde git auto ────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'synced' | 'push-error' | 'error'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appAuthorRef = useRef(appAuthor)
  appAuthorRef.current = appAuthor
  const gitEmailRef = useRef(gitEmail)
  gitEmailRef.current = gitEmail

  const performGitSave = useCallback(async () => {
    const file = openedFileRef.current
    if (!file) return
    setSaveStatus('saving')
    setSaveErrorMsg(null)
    try {
      const result = await window.holo?.gitAutoSave(file.path, appAuthorRef.current || undefined, gitEmailRef.current || undefined)
      if (!result?.ok) {
        const msg = result?.error ?? 'Erreur de commit'
        setSaveErrorMsg(msg)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus(prev => prev === 'error' ? 'idle' : prev), 8000)
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((result as any).pushError) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSaveErrorMsg((result as any).pushError)
        setSaveStatus('push-error')
        setTimeout(() => setSaveStatus(prev => prev === 'push-error' ? 'idle' : prev), 8000)
        return
      }
      // not-a-repo ou no-remote : le fichier est enregistré localement uniquement
      if (result.reason === 'not-a-repo' || result.reason === 'no-remote') {
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000)
        return
      }
      setSaveStatus('synced')
      setTimeout(() => setSaveStatus(prev => prev === 'synced' ? 'idle' : prev), 4000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setSaveErrorMsg(msg)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(prev => prev === 'error' ? 'idle' : prev), 8000)
    }
  }, [])
  // Mise à jour du ref stable pour que handleSelectFile/beforeunload puissent l'appeler
  performGitSaveRef.current = performGitSave

  const scheduleGitSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(performGitSave, 10_000)
  }, [performGitSave])

  const handleMarkdownChange = useCallback(async (markdown: string) => {
    const file = openedFileRef.current
    if (!file) return
    
    // DEBUG: détecte les markdown dégradés (ex: listes avec items vides)
    const emptyListItems = (markdown.match(/^\s*-\s*$|^\s*\d+\.\s*$/gm) || []).length
    if (emptyListItems > 3 && markdown.length < 100) {
      console.warn(
        `[App2] Possible contenu dégradé détecté - ${emptyListItems} items vides. Sauvegarde skippée.\n` +
        `File: ${file.path}\nMarkdown: ${JSON.stringify(markdown.slice(0, 200))}`
      )
      // Ne pas sauvegarder un markdown manifestement dégradé
      return
    }
    
    // Mettre à jour le markdown live pour l'Inspector (TOC en temps réel)
    setLiveMarkdown(markdown)
    // Mettre à jour immédiatement les métadonnées live pour l'arborescence
    setCurrentFileMeta({ path: file.path, ...extractFmMeta(markdown) })
    try {
      await window.holo?.writeFile(file.path, markdown)
      setSaveStatus('saved')
      scheduleGitSave()
    } catch (err) {
      console.error('[App2] Impossible de sauvegarder le fichier :', err)
      setSaveStatus('error')
    }
  }, [scheduleGitSave])

  // Ctrl+S → sauvegarde immédiate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
        performGitSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [performGitSave])

  // Nettoyage du timer au démontage
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // Git save à la fermeture de l'app
  useEffect(() => {
    const handler = () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
      performGitSaveRef.current()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Fermer le fichier ouvert s'il est supprimé ou archivé depuis SpacePanel
  const handleToggleTemplate = useCallback(async () => {
    const path = openedFile?.path
    if (!path) return
    const cur = Boolean(fileMetaByPath[path]?.isTemplate)
    const content = await window.holo?.readFile(path)
    if (content == null) return
    const next = updateMarkdownBooleanHeaderField(content, 'template', !cur)
    await window.holo?.writeFile(path, next)
    setFileMetaByPath(prev => ({ ...prev, [path]: { ...(prev[path] ?? { title: '', description: '', isTemplate: false }), isTemplate: !cur } }))
    setOpenedFile(prev => prev ? { ...prev, content: next } : prev)
  }, [openedFile?.path, fileMetaByPath, setFileMetaByPath])

  useEffect(() => {
    const handler = (e: Event) => {
      const path = (e as CustomEvent<{ path: string }>).detail?.path
      if (!path) return
      if (openedFileRef.current?.path === path) {
        setOpenedFile(null)
      }
      // Retirer aussi des recents pour qu'il ne réapparaisse pas dans la recherche
      setRecentFilePaths(prev => prev.filter(p => p !== path))
    }
    window.addEventListener('holo:close-file', handler)
    return () => window.removeEventListener('holo:close-file', handler)
  }, [setRecentFilePaths])

  return (
    <div className="holo-window">
      {onboardingDone === null ? null : !onboardingDone ? (
        <div className="flex h-screen items-center justify-center overflow-y-auto bg-holo-bg p-4">
          <Onboarding onSubmit={handleOnboardingSubmit} onSkip={handleOnboardingSkip} />
        </div>
      ) : (
        <>
      <main className={cn(
        'grid h-full overflow-hidden text-holo-text',
        'grid-rows-[56px_minmax(0,1fr)]',
        hasPanel
          ? 'lg:grid-cols-[320px_320px_minmax(0,1fr)] 3xl:grid-cols-[320px_320px_minmax(0,1fr)_320px]'
          : 'lg:grid-cols-[320px_minmax(0,1fr)] 3xl:grid-cols-[320px_minmax(0,1fr)_320px]'
      )}>

        {/* Header — pleine largeur */}
        <div className="col-span-full holo-drag-region">
          <Header
            editorFontSize={editorFontSize}
            onEditorFontSizeChange={handleEditorFontSizeChange}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>

        {/* Sidebar : visible sur desktop, cachée sur mobile quand un panel est ouvert */}
        <div className={cn(
          'h-full lg:border-r border-holo-border-soft overflow-y-auto holo-scrollbar',
          hasPanel ? 'hidden lg:block' : 'block'
        )}>
          <Sidebar
            primaryItems={PRIMARY_ITEMS}
            spaces={spaces}
            onAddSpace={addSpace.show}
            userName={appAuthor || undefined}
            userMail={gitEmail || undefined}
            favoritePaths={favoriteFolders}
            spaceStatuses={spaceStatuses}
            onSpaceFavorite={handleSpaceFavorite}
            onSpaceRemove={handleSpaceRemove}
            onSpaceOpenInExplorer={handleSpaceOpenInExplorer}
            onSearch={() => setSearchOpen(true)}
          />
        </div>

        {/* Panneau secondaire — AbstractPanel gère le titre et le bouton retour */}
        {hasPanel && (
          <div className={cn('overflow-hidden lg:border-r border-holo-border-soft', mobileEditorOpen && 'hidden lg:block')}>
            <Routes>
              <Route path="/recent" element={
                <RecentPanel
                  documents={recentDocuments}
                  onSelectDocument={handleRecentDocumentSelect}
                  onEmptyRecent={handleEmptyRecent}
                />
              } />
              <Route path="/favorites" element={
                <FavoritePanel
                  documents={favoriteDocuments}
                  onSelectDocument={handleFavoriteDocumentSelect}
                />
              } />
              <Route path="/search" element={null} />
              <Route path="/space/:encodedPath" element={
                <SpaceRoute
                  onSelectFile={handleSelectFile}
                  selectedFilePath={openedFile?.path}
                  metaOverride={currentFileMeta}
                  isFavorite={favoriteFolders.includes(rootPath ?? '')}
                  onToggleFavorite={() => rootPath && handleSpaceFavorite(rootPath)}
                  onDetach={() => rootPath && handleSpaceRemove(rootPath)}
                  favoriteFilePaths={favoriteFilePaths}
                  onToggleFileFavorite={handleFileFavorite}
                />
              } />

              {/*TODO Only visible when ai settings are set */}
              <Route path="/ai" element={<AIPanel />} />
            </Routes>
          </div>
        )}

        {/* Zone éditeur — visible sur desktop et sur mobile quand un fichier est sélectionné */}
        <div className={cn('overflow-y-auto holo-scrollbar', mobileEditorOpen ? 'block' : 'hidden lg:block')}>
          {openedFile ? (
            <EditorFrame
              key={openedFile.path}
              filepath={openedFile.path}
              markdown={openedFile.content}
              onMarkdownChange={handleMarkdownChange}
              onToggleInspector={() => setInspectorOpen((o) => !o)}
              saveStatus={saveStatus}
              saveErrorMsg={saveErrorMsg ?? undefined}
              onMobileBack={() => setMobileEditorOpen(false)}
              contentFontScale={editorFontSize / 100}
              isFavorite={favoriteFilePaths.includes(openedFile.path)}
              onToggleFavorite={() => handleFileFavorite(openedFile.path)}
              onArchive={openedFile.path.includes('/.archive/') ? undefined : () => setPendingArchivePath(openedFile.path)}
              onRestore={openedFile.path.includes('/.archive/') ? () => handleRestoreFile(openedFile.path) : undefined}
              onShare={handleShare}
              isTemplate={Boolean(fileMetaByPath[openedFile.path]?.isTemplate)}
              onToggleTemplate={handleToggleTemplate}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-holo-text-faint">
              <FileText size={32} strokeWidth={1.2} className="opacity-30" />
              <p className="text-sm">Sélectionnez un fichier pour l’éditer</p>
            </div>
          )}
        </div>

        {/* Inspecteur — colonne droite, grands écrans */}
        <div className="hidden 3xl:block border-l border-holo-border-soft">
          <Inspector markdown={liveMarkdown ?? openedFile?.content} filePath={openedFile?.path} />
        </div>

      </main>

      <AddSpace open={addSpace.open} onClose={addSpace.hide} />

      {/* Inspecteur drawer — visible < 3xl */}
      <div
        className={cn(
          'fixed inset-0 z-40 3xl:hidden transition-opacity duration-200',
          inspectorOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setInspectorOpen(false)} />
        <div
          className={cn(
            'absolute inset-y-0 right-0 w-80 border-l border-holo-border-soft bg-holo-bg overflow-y-auto holo-scrollbar transition-transform duration-300',
            inspectorOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-holo-border-soft px-4 py-3">
            <span className="text-sm font-medium text-holo-text">Inspecteur</span>
            <button
              onClick={() => setInspectorOpen(false)}
              className="flex size-7 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
              aria-label="Fermer l'inspecteur"
            >
              <X size={14} />
            </button>
          </div>
          <Inspector markdown={liveMarkdown ?? openedFile?.content} filePath={openedFile?.path} />
        </div>
      </div>
        </>
      )}

      {/* Notification mise à jour */}
      {updateAvailable && (
        <AppUpdateNotification
          updateReady={updateReady}
          updateProgress={updateProgress}
          onInstall={() => window.holo?.installUpdate?.()}
          onDismiss={dismissUpdate}
        />
      )}

      {/* Modal identifiants espace */}
      {pendingCredentials && (
        <SpaceCredentialsModal
          spacePath={pendingCredentials.spacePath}
          mode={pendingCredentials.mode}
          onSave={async (credentials) => {
            await handleSaveSpaceConfig(pendingCredentials.spacePath, pendingCredentials.mode, credentials)
            setPendingCredentials(null)
          }}
          onDismiss={() => setPendingCredentials(null)}
        />
      )}

      <HoloSettingsDialog
        open={settingsOpen}
        value={settingsValue}
        saved={settingsSaved}
        spaces={recentFolders}
        currentSpace={rootPath ?? undefined}
        onSave={handleSettingsSave}
        onSaveSpaceConfig={handleSaveSpaceConfig}
        onChange={(value) => {
          // Prévisualisation en temps réel (sans persister)
          applyTheme(value.theme ?? 'dark')
          applyAccent(value.accent ?? 'violet')
        }}
        onClose={() => {
          // Revert à l'apparence sauvegardée si on ferme sans sauvegarder
          applyTheme(settingsValue?.theme ?? 'dark')
          applyAccent(settingsValue?.accent ?? 'violet')
          setSettingsOpen(false)
          setSettingsSaved(false)
        }}
      />

      {/* Confirmation d'archivage */}
      {pendingArchivePath && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-holo-xl border border-holo-border-soft bg-holo-bg p-6 shadow-[0_24px_80px_rgba(0,0,0,.6)]">
            <div className="mb-1 flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-amber-500/10 text-amber-400">
                <Archive size={16} />
              </div>
              <p className="text-sm font-semibold text-holo-text">Archiver ce fichier ?</p>
            </div>
            <p className="mb-5 ml-12 text-xs text-holo-text-faint">
              « {pendingArchivePath.split('/').at(-1)} » sera déplacé dans l'archive et pourra être restauré.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingArchivePath(null)}
                className="rounded-holo-md border border-holo-border-soft bg-holo-glass px-4 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const path = pendingArchivePath
                  setPendingArchivePath(null)
                  try {
                    await window.holo?.archivePath(path)
                    setOpenedFile(null)
                    window.dispatchEvent(new CustomEvent('holo:refresh-tree'))
                    void window.holo?.gitAutoSave(null as unknown as string)
                  } catch (err) {
                    console.error('[App2] Impossible d\'archiver :', err)
                  }
                }}
                className="rounded-holo-md bg-amber-500/80 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
              >
                Archiver
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recherche modale (Ctrl+K) */}
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectFile={(filePath) => {
          const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
          if (spacePath) navigate(`/space/${encodeURIComponent(spacePath)}`)
          void handleSelectFile({ id: filePath, path: filePath, name: getBaseName(filePath), type: 'file' })
        }}
      />
    </div>
  )
}
