import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { cn } from './utils/global'
import { FavoritePanel, AIPanel, Header, RecentPanel, Inspector, Sidebar, Onboarding, HoloSettingsDialog } from "./parts/"
import type { OnboardingWelcomeValue, HoloSettingsValue } from "./parts/"
import type { HoloDocument } from './parts/RecentPanel'
import { useWorkspace } from './contexts/WorkspaceContext'
import { useConfig } from './contexts/ConfigContext'
import { getBaseName } from './lib/appUtils'
import { usePopup } from './hooks/usePopup'
import { AddSpace } from './popup/AddSpace'
import { SpaceRoute } from './parts/SpacePanel'
import type { SpaceFileNode, TreeFileMeta } from './parts/SpacePanel'
import { Clock, Star, Bot, Folder, FileText, X } from 'lucide-react'
import { EditorFrame } from './parts/EditorFrame'
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
    if (value) result[key as keyof TreeFileMeta] = value
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

  const { appAuthor, gitEmail, gitState, setAppAuthor, setGitEmail } = useConfig()

  // ─── Favoris d'espaces ────────────────────────────────────────────────────
  const [favoriteFolders, setFavoriteFolders] = useState<string[]>([])

  // ─── Favoris de fichiers ──────────────────────────────────────────────────
  const [favoriteFilePaths, setFavoriteFilePaths] = useState<string[]>([])

  // ─── Onboarding ───────────────────────────────────────────────────────────
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)
  const [settingsValue, setSettingsValue] = useState<HoloSettingsValue | undefined>(undefined)
  const [settingsSaved, setSettingsSaved] = useState(false)

  useEffect(() => {
    if (!window.holo) { setOnboardingDone(true); return }
    window.holo.getHoloConfig()
      .then(cfg => {
        // Onboarding
        if (import.meta.env.DEV) {
          setOnboardingDone(true)
        } else {
          const hasAuthor = typeof cfg['app-author'] === 'string' && (cfg['app-author'] as string).trim().length > 0
          setOnboardingDone(hasAuthor)
        }
        // Favoris
        const savedFavs = cfg['space-favorites']
        if (Array.isArray(savedFavs)) setFavoriteFolders(savedFavs as string[])
        // Favoris fichiers
        const savedFileFavs = cfg['file-favorites']
        if (Array.isArray(savedFileFavs)) setFavoriteFilePaths(savedFileFavs as string[])
        // Fichiers récents
        const savedRecents = cfg['recent-file-paths']
        if (Array.isArray(savedRecents)) setRecentFilePaths(savedRecents as string[])
        // Apparence
        const theme = (cfg['theme'] as HoloSettingsValue['theme']) ?? 'dark'
        const accent = (cfg['accent'] as HoloSettingsValue['accent']) ?? 'violet'
        applyTheme(theme)
        applyAccent(accent)
        // Valeurs settings
        setSettingsValue({
          firstName: cfg['app-author-first-name'] as string || '',
          lastName: cfg['app-author-last-name'] as string || '',
          gitEmail: cfg['git-email'] as string || '',
          imageStorageMode: (cfg['image-storage-mode'] as HoloSettingsValue['imageStorageMode']) ?? 'local',
          azureContainerUrl: cfg['azure-container-url'] as string || '',
          azureSasToken: cfg['azure-sas-token'] as string || '',
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
    setOnboardingDone(true)
  }, [setAppAuthor, setGitEmail])

  const handleOnboardingSkip = useCallback(async () => {
    await window.holo?.setHoloConfigValue('app-onboarding-done', true)
    setOnboardingDone(true)
  }, [])

  // ─── Sauvegarde des paramètres ────────────────────────────────────────────
  const handleSettingsSave = useCallback(async (value: HoloSettingsValue) => {
    const fullName = `${value.firstName?.trim() ?? ''} ${value.lastName?.trim() ?? ''}`.trim()
    await Promise.all([
      window.holo?.setHoloConfigValue('app-author', fullName),
      window.holo?.setHoloConfigValue('app-author-first-name', value.firstName?.trim() ?? ''),
      window.holo?.setHoloConfigValue('app-author-last-name', value.lastName?.trim() ?? ''),
      window.holo?.setHoloConfigValue('git-email', value.gitEmail?.trim() ?? ''),
      window.holo?.setHoloConfigValue('image-storage-mode', value.imageStorageMode ?? 'local'),
      window.holo?.setHoloConfigValue('azure-container-url', value.azureContainerUrl ?? ''),
      window.holo?.setHoloConfigValue('azure-sas-token', value.azureSasToken ?? ''),
      window.holo?.setHoloConfigValue('ai-provider', value.aiProvider ?? 'local'),
      window.holo?.setHoloConfigValue('gemini-api-key', value.geminiApiKey ?? ''),
      window.holo?.setHoloConfigValue('openai-api-key', value.openAiApiKey ?? ''),
      window.holo?.setHoloConfigValue('ai-system-prompt', value.systemPrompt ?? ''),
      window.holo?.setHoloConfigValue('theme', value.theme ?? 'dark'),
      window.holo?.setHoloConfigValue('accent', value.accent ?? 'violet'),
    ])
    if (fullName) setAppAuthor(fullName)
    if (value.gitEmail) setGitEmail(value.gitEmail.trim())
    applyTheme(value.theme ?? 'dark')
    applyAccent(value.accent ?? 'violet')
    setSettingsValue(value)
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 3000)
  }, [setAppAuthor, setGitEmail])

  // Listener pour le thème "system" (préférence OS)
  useEffect(() => {
    if (settingsValue?.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settingsValue?.theme])

  const { recentFolders, rootPath, recentFilePaths, fileMetaByPath, setRecentFilePaths, setRecentFolders } = useWorkspace()

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
  // ─── Métadonnées live du fichier ouvert (pour mise à jour immédiate de l'arborescence)
  const [currentFileMeta, setCurrentFileMeta] = useState<(TreeFileMeta & { path: string }) | undefined>(undefined)
  // ─── Fichier ouvert ────────────────────────────────────────────────────────
  type OpenedFile = { path: string; name: string; content: string }
  const [openedFile, setOpenedFile] = useState<OpenedFile | null>(null)
  // Ref pour éviter les closures stales dans le callback de sauvegarde
  const openedFileRef = useRef<OpenedFile | null>(null)
  openedFileRef.current = openedFile

  const handleSelectFile = useCallback(async (node: SpaceFileNode) => {
    if (node.type !== 'file') return
    try {
      const content = await window.holo?.readFile(node.path) ?? ''
      setOpenedFile({ path: node.path, name: node.name, content })
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

  const handleRecentDocumentSelect = useCallback((doc: HoloDocument) => {
    const filePath = doc.to
    const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
    if (spacePath) navigate(`/space/${encodeURIComponent(spacePath)}`)
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

  const handleFavoriteDocumentSelect = useCallback((doc: HoloDocument) => {
    const filePath = doc.to
    const spacePath = recentFolders.find(f => filePath.startsWith(f + '/'))
    if (spacePath) navigate(`/space/${encodeURIComponent(spacePath)}`)
    void handleSelectFile({ id: filePath, path: filePath, name: getBaseName(filePath), type: 'file' })
  }, [recentFolders, navigate, handleSelectFile])

  // ─── Sauvegarde git auto ────────────────────────────────────────────────────
  type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const appAuthorRef = useRef(appAuthor)
  appAuthorRef.current = appAuthor
  const gitEmailRef = useRef(gitEmail)
  gitEmailRef.current = gitEmail

  const performGitSave = useCallback(async () => {
    const file = openedFileRef.current
    if (!file) return
    setSaveStatus('saving')
    try {
      await window.holo?.gitAutoSave(file.path, appAuthorRef.current || undefined, gitEmailRef.current || undefined)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(prev => prev === 'saved' ? 'idle' : prev), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus(prev => prev === 'error' ? 'idle' : prev), 5000)
    }
  }, [])

  const scheduleGitSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(performGitSave, 10_000)
  }, [performGitSave])

  const handleMarkdownChange = useCallback(async (markdown: string) => {
    const file = openedFileRef.current
    if (!file) return
    // Mettre à jour immédiatement les métadonnées live pour l'arborescence
    setCurrentFileMeta({ path: file.path, ...extractFmMeta(markdown) })
    try {
      await window.holo?.writeFile(file.path, markdown)
      setSaveStatus('unsaved')
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
              onMobileBack={() => setMobileEditorOpen(false)}
              contentFontScale={editorFontSize / 100}
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
          <Inspector markdown={openedFile?.content} filePath={openedFile?.path} />
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
          <Inspector markdown={openedFile?.content} filePath={openedFile?.path} />
        </div>
      </div>
        </>
      )}

      <HoloSettingsDialog
        open={settingsOpen}
        value={settingsValue}
        saved={settingsSaved}
        onSave={handleSettingsSave}
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
    </div>
  )
}
