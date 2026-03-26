import { useCallback, useEffect, useMemo, useState } from 'react'

type NodeType = 'file' | 'directory'

type TreeNode = {
  name: string
  path: string
  type: NodeType
  children?: TreeNode[]
}

type OpenFolderResult = {
  rootPath: string
  tree: TreeNode
} | null

type NameDialog =
  | {
    mode: 'create-file' | 'create-directory'
    value: string
  }
  | {
    mode: 'rename'
    value: string
    targetPath: string
  }

type GitDialog =
  | {
    mode: 'commit'
    value: string
  }
  | {
    mode: 'merge'
    value: string
  }

type GitState = {
  isRepo: boolean
  branch: string | null
  localChanges: number
  incoming: number
  outgoing: number
  conflictedFiles: string[]
  lastFetchAt: string | null
  error: string | null
}

type SyncFeedback = {
  status: 'idle' | 'success' | 'warning' | 'error'
  message: string | null
  at: string | null
}

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

const DEFAULT_GIT_STATE: GitState = {
  isRepo: false,
  branch: null,
  localChanges: 0,
  incoming: 0,
  outgoing: 0,
  conflictedFiles: [],
  lastFetchAt: null,
  error: null,
}

const DEFAULT_SYNC_FEEDBACK: SyncFeedback = {
  status: 'idle',
  message: null,
  at: null,
}

function normalizeGitState(input: Partial<GitState> | null | undefined): GitState {
  return {
    ...DEFAULT_GIT_STATE,
    ...(input ?? {}),
    conflictedFiles: Array.isArray(input?.conflictedFiles) ? input.conflictedFiles : [],
  }
}

function getFriendlyGitErrorMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase()

  if (
    /authentication failed|could not read username|permission denied \(publickey\)|could not read from remote repository|repository not found/.test(
      message,
    )
  ) {
    return 'Échec de connexion GitHub. Vérifie ton compte (SSH/identifiants) puis réessaie Synchroniser.'
  }

  if (/could not resolve host|name or service not known|network is unreachable|timed out/.test(message)) {
    return 'Impossible de joindre GitHub (réseau/DNS). Vérifie la connexion Internet puis réessaie.'
  }

  return rawMessage
}

function getParentPath(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index <= 0) {
    return targetPath
  }

  return normalized.slice(0, index)
}

function getBaseName(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index < 0) {
    return normalized
  }

  return normalized.slice(index + 1)
}

function getDirectoryTarget(rootPath: string | null, selectedPath: string | null, selectedType: NodeType | null) {
  if (!rootPath) {
    return null
  }

  if (!selectedPath || !selectedType) {
    return rootPath
  }

  if (selectedType === 'directory') {
    return selectedPath
  }

  return getParentPath(selectedPath)
}

function TreeItem({
  node,
  selectedPath,
  onSelect,
  expandedDirectories,
  onToggleDirectory,
  level = 0,
}: {
  node: TreeNode
  selectedPath: string | null
  onSelect: (node: TreeNode) => void
  expandedDirectories: Set<string>
  onToggleDirectory: (directoryPath: string) => void
  level?: number
}) {
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const isExpanded = isDirectory ? expandedDirectories.has(node.path) : false

  return (
    <li>
      <button
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
          isSelected
            ? 'bg-[#7B61FF]/20 border border-[#7B61FF]/50 text-[#7B61FF]'
            : 'text-white/60 hover:text-white/90 hover:bg-white/5'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          onSelect(node)

          if (isDirectory) {
            onToggleDirectory(node.path)
          }
        }}
      >
        <span className="w-5 text-center text-xs">
          {isDirectory ? (isExpanded ? '▾' : '▸') : '•'}
        </span>
        <span className="w-5 text-center text-sm">{node.type === 'directory' ? '📁' : '📄'}</span>
        <span className="truncate text-xs">{node.name}</span>
      </button>

      {node.type === 'directory' && isExpanded && node.children && node.children.length > 0 && (
        <ul className="mt-0.5">
          {node.children.map((childNode) => (
            <TreeItem
              key={childNode.path}
              node={childNode}
              selectedPath={selectedPath}
              onSelect={onSelect}
              expandedDirectories={expandedDirectories}
              onToggleDirectory={onToggleDirectory}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function App() {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set())
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null)
  const [gitState, setGitState] = useState<GitState>(DEFAULT_GIT_STATE)
  const [gitDialog, setGitDialog] = useState<GitDialog | null>(null)
  const [isGitBusy, setIsGitBusy] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState<SyncFeedback>(DEFAULT_SYNC_FEEDBACK)
  const [activeSidebar, setActiveSidebar] = useState<'files' | 'git'>('files')
  const desktopApiAvailable = typeof window.holo !== 'undefined'

  // Récupérer l'onglet actif
  const activeTab = useMemo(
    () => openTabs.find((tab) => tab.path === activeTabPath),
    [activeTabPath, openTabs],
  )

  const getHoloApi = useCallback(() => {
    if (!window.holo) {
      window.alert(
        "L'API Electron n'est pas disponible. Lance l'application avec `npm run dev` (Electron), pas uniquement Vite dans le navigateur.",
      )
      return null
    }

    return window.holo
  }, [])

  const refreshTree = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = (await holo.refreshTree()) as OpenFolderResult

    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
  }, [getHoloApi])

  const openFolder = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = (await holo.openFolder()) as OpenFolderResult

    if (!result) {
      return
    }

    setRootPath(result.rootPath)
    setTree(result.tree)
    setSelectedPath(result.rootPath)
    setSelectedType('directory')
    setExpandedDirectories(new Set())
    setOpenTabs([])
    setActiveTabPath(null)
    setGitState(DEFAULT_GIT_STATE)

    const nextGitState = await holo.gitGetState(true)
    setGitState(normalizeGitState(nextGitState))
  }, [getHoloApi])

  const refreshGitState = useCallback(
    async (fetchRemote = false) => {
      if (!rootPath) {
        setGitState(DEFAULT_GIT_STATE)
        return
      }

      const holo = getHoloApi()

      if (!holo) {
        return
      }

      const nextGitState = await holo.gitGetState(fetchRemote)
      setGitState(normalizeGitState(nextGitState))
    },
    [getHoloApi, rootPath],
  )

  useEffect(() => {
    if (!rootPath) {
      setGitState(DEFAULT_GIT_STATE)
      return
    }

    void refreshGitState(true)
  }, [refreshGitState, rootPath])

  useEffect(() => {
    if (!rootPath || !gitState.isRepo) {
      return
    }

    const interval = window.setInterval(() => {
      void refreshGitState(true)
    }, 60_000)

    return () => window.clearInterval(interval)
  }, [gitState.isRepo, refreshGitState, rootPath])

  const toggleDirectory = useCallback((directoryPath: string) => {
    setExpandedDirectories((previous) => {
      const next = new Set(previous)

      if (next.has(directoryPath)) {
        next.delete(directoryPath)
      } else {
        next.add(directoryPath)
      }

      return next
    })
  }, [])

  const openFile = useCallback(
    async (filePath: string) => {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      try {
        // Vérifier si le fichier est déjà ouvert dans les tabs actuels
        const existingTab = openTabs.find((tab) => tab.path === filePath)
        if (existingTab) {
          setActiveTabPath(filePath)
          return
        }

        // Charger le fichier
        const nextContent = await holo.readFile(filePath)
        const newTab: OpenTab = {
          path: filePath,
          name: getBaseName(filePath),
          content: nextContent,
          isDirty: false,
        }
        setOpenTabs((prev) => [...prev, newTab])
        setActiveTabPath(filePath)
      } catch (error) {
        window.alert((error as Error).message)
      }
    },
    [getHoloApi, openTabs],
  )

  const onSelectNode = useCallback(
    async (node: TreeNode) => {
      setSelectedPath(node.path)
      setSelectedType(node.type)

      if (node.type === 'file') {
        const isDirty = activeTab?.isDirty ?? false
        if (isDirty && activeTabPath && activeTabPath !== node.path) {
          const continueWithoutSave = window.confirm(
            'Le fichier courant a des modifications non sauvegardées. Continuer sans sauvegarder ?'
          )

          if (!continueWithoutSave) {
            return
          }
        }

        await openFile(node.path)
      }
    },
    [activeTab, activeTabPath, openFile],
  )

  const saveCurrentFile = useCallback(async () => {
    if (!activeTab) {
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.writeFile(activeTab.path, activeTab.content)
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.path === activeTab.path ? { ...tab, isDirty: false } : tab,
      ),
    )
    await refreshTree()
    await refreshGitState(false)
  }, [activeTab, getHoloApi, refreshGitState, refreshTree])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSaveKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'

      if (!isSaveKey) {
        return
      }

      event.preventDefault()
      if (activeTab) {
        void saveCurrentFile()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [saveCurrentFile, activeTab])

  const directoryTarget = useMemo(
    () => getDirectoryTarget(rootPath, selectedPath, selectedType),
    [rootPath, selectedPath, selectedType],
  )

  const openCreateFileDialog = useCallback(() => {
    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    setNameDialog({ mode: 'create-file', value: '' })
  }, [rootPath])

  const openCreateDirectoryDialog = useCallback(() => {
    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    setNameDialog({ mode: 'create-directory', value: '' })
  }, [rootPath])

  const openRenameDialog = useCallback(() => {
    if (!rootPath) {
      window.alert('Ouvre d’abord un dossier.')
      return
    }

    if (!selectedPath) {
      window.alert('Sélectionne un fichier ou un dossier à renommer.')
      return
    }

    if (selectedPath === rootPath) {
      window.alert('Le dossier racine ne peut pas être renommé.')
      return
    }

    setNameDialog({
      mode: 'rename',
      value: getBaseName(selectedPath),
      targetPath: selectedPath,
    })
  }, [rootPath, selectedPath])

  const submitNameDialog = useCallback(async () => {
    if (!nameDialog || !rootPath) {
      return
    }

    const value = nameDialog.value.trim()

    if (!value) {
      window.alert('Le nom ne peut pas être vide.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      if (nameDialog.mode === 'create-file') {
        const targetDirectory = directoryTarget ?? rootPath
        await holo.createFile(targetDirectory, value)
      } else if (nameDialog.mode === 'create-directory') {
        const targetDirectory = directoryTarget ?? rootPath
        await holo.createDirectory(targetDirectory, value)
      } else if (nameDialog.mode === 'rename') {
        const renameTargetPath = nameDialog.targetPath
        const result = await holo.renamePath(renameTargetPath, value)

        // Mettre à jour les tabs si un onglet du fichier renommé est ouvert
        setOpenTabs((prev) =>
          prev.map((tab) =>
            tab.path === renameTargetPath
              ? { ...tab, path: result.newPath, name: getBaseName(result.newPath) }
              : tab,
          ),
        )
        if (activeTabPath === renameTargetPath) {
          setActiveTabPath(result.newPath)
        }

        setSelectedPath(result.newPath)
      }

      setNameDialog(null)
      await refreshTree()
      await refreshGitState(false)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [directoryTarget, getHoloApi, nameDialog, activeTabPath, refreshGitState, refreshTree, rootPath])

  const deleteSelected = useCallback(async () => {
    if (!selectedPath || !rootPath || selectedPath === rootPath) {
      return
    }

    const confirmed = window.confirm('Confirmer la suppression ?')

    if (!confirmed) {
      return
    }

    try {
      const holo = getHoloApi()

      if (!holo) {
        return
      }

      await holo.deletePath(selectedPath)

      // Fermer les onglets du fichier supprimé
      setOpenTabs((prev) => prev.filter((tab) => tab.path !== selectedPath))
      if (activeTabPath === selectedPath) {
        setActiveTabPath(null)
      }

      setSelectedPath(rootPath)
      setSelectedType('directory')
      await refreshTree()
      await refreshGitState(false)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [getHoloApi, activeTabPath, refreshGitState, refreshTree, rootPath, selectedPath])

  const openCommitDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n’est pas un dépôt Git.')
      return
    }

    setGitDialog({ mode: 'commit', value: '' })
  }, [gitState.isRepo])

  const openMergeDialog = useCallback(() => {
    if (!gitState.isRepo) {
      window.alert('Le dossier ouvert n’est pas un dépôt Git.')
      return
    }

    setGitDialog({ mode: 'merge', value: '' })
  }, [gitState.isRepo])

  const submitGitDialog = useCallback(async () => {
    if (!gitDialog) {
      return
    }

    const value = gitDialog.value.trim()

    if (!value) {
      window.alert(gitDialog.mode === 'commit' ? 'Message de commit requis.' : 'Nom de branche requis.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      if (gitDialog.mode === 'commit') {
        const commitResult = await holo.gitCommit(value)

        if (commitResult.pushed) {
          window.alert('Commit créé et envoyé automatiquement.')
        } else {
          window.alert(
            `Commit créé localement, mais l’envoi automatique a échoué.\n\n${commitResult.pushError ?? 'Fais un pull ou résous les conflits avant de réessayer.'}`,
          )
        }
      } else {
        await holo.gitMerge(value)
      }

      setGitDialog(null)
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, gitDialog, refreshGitState])

  const pullChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitPull()
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

  const fetchChanges = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      await holo.gitFetch()
      await refreshGitState(true)
    } catch (error) {
      window.alert((error as Error).message)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

  const syncRepository = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    setIsGitBusy(true)

    try {
      const syncResult = await holo.gitSync()
      await refreshGitState(true)

      if (syncResult.hadConflicts) {
        const message = `Conflits détectés pendant la synchronisation. ${syncResult.error ?? ''}`.trim()
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(`${message}\n\nOuvre les fichiers listés ci-dessous pour les résoudre.`)
        return
      }

      if (syncResult.error) {
        const message = `Synchronisation partielle : ${getFriendlyGitErrorMessage(syncResult.error)}`
        setSyncFeedback({
          status: 'warning',
          message,
          at: new Date().toISOString(),
        })
        window.alert(message)
        return
      }

      const commitInfo = syncResult.committed
        ? '\n- Commit automatique créé.'
        : '\n- Aucun commit nécessaire.'

      const pushInfo = syncResult.pushed
        ? '\n- Push effectué.'
        : '\n- Aucun push nécessaire.'

      const successMessage = `Synchronisation terminée.${commitInfo}${pushInfo}`
      setSyncFeedback({
        status: 'success',
        message: successMessage,
        at: new Date().toISOString(),
      })
      window.alert(successMessage)
    } catch (error) {
      const friendlyMessage = getFriendlyGitErrorMessage((error as Error).message)
      setSyncFeedback({
        status: 'error',
        message: friendlyMessage,
        at: new Date().toISOString(),
      })
      window.alert(friendlyMessage)
      await refreshGitState(false)
    } finally {
      setIsGitBusy(false)
    }
  }, [getHoloApi, refreshGitState])

  const conflictedFiles = normalizeGitState(gitState).conflictedFiles

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
    [openFile],
  )


  return (
    <main
      className="h-screen bg-[#242527] text-white font-sans gap-x-2 grid overflow-hidden grid-cols-[auto_1fr] grid-rows-[64px_1fr]"
      style={{ gridTemplateAreas: `'appbar appbar' 'sidebar content'` }}
    >

      {/* App header */}
      <header className="flex items-center pr-3" style={{ gridArea: 'appbar' }}>
        <div className="flex-1">
          <img src="/logo.png" height={40} width={120} alt="logo" />
        </div>
        <div className="flex gap-2 text-white/50">
          <button className="size-8 text-white/50 hover:text-white cursor-pointer"><i className="fa-jelly-duo fa-regular fa-minus" /></button>
          <button className="size-8 text-white/50 hover:text-white cursor-pointer"><i className="fa-jelly-duo fa-regular fa-square" /></button>
          <button className="size-8 text-white/50 hover:text-white cursor-pointer"><i className="fa-jelly-duo fa-regular fa-xmark" /></button>
        </div>
      </header>

      <aside className="max-w-[492px] flex gap-2 z-10 pl-2 font-quicksand" style={{ gridArea: 'sidebar' }}>

        {/* Icônes de navigation principale */}
        <nav className="flex flex-col gap-4 pt-4">

          {/* Bouton Fichiers */}
          <div
            className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
              activeSidebar === 'files'
                ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
            }`}
            onClick={() => setActiveSidebar('files')}
          >
            <i className="fa-jelly-duo fa-regular fa-folder text-2xl" />
          </div>

          {/* Bouton Git — badges incoming/outgoing juste en dessous */}
          <div className="relative flex flex-col items-center gap-1">
            <div
              className={`relative size-12 rounded-full flex items-center justify-center cursor-pointer ${
                activeSidebar === 'git'
                  ? 'border-2 border-[#7B61FF]/50 text-[#7B61FF]'
                  : 'border border-white/5 hover:border-[#7B61FF]/30 text-white/30 hover:text-[#7B61FF]/50'
              }`}
              onClick={() => setActiveSidebar('git')}
            >
              <i className="fa-brands fa-github text-2xl" />
            </div>

            {/* Badges incoming / outgoing — visibles seulement si valeur > 0 */}
            <div className="flex flex-col gap-1 items-center pointer-events-none">
              {gitState.incoming > 0 && (
                <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                  <i className="fa-solid fa-arrow-down text-[10px]" />
                  <span className="font-bold">{gitState.incoming}</span>
                </div>
              )}
              {gitState.outgoing > 0 && (
                <div className="bg-[#7B61FF]/50 rounded-full flex items-center justify-center pl-1 pr-2 border-2 border-[#242527] text-xs text-white gap-0.5">
                  <i className="fa-solid fa-arrow-up text-[10px]" />
                  <span className="font-bold">{gitState.outgoing}</span>
                </div>
              )}
            </div>
          </div>

        </nav>

        {/* Panel Fichiers */}
        {activeSidebar === 'files' && (
          <nav className="bg-[#1f2021] min-w-[300px] rounded-t-lg overflow-x-hidden overflow-y-auto flex-1 p-5 flex flex-col gap-3">
            
            {/* Titre du dossier */}
            <div>
              <h2 className="text-sm font-semibold text-white/80 truncate">
                {rootPath ? `📁 ${getBaseName(rootPath)}` : 'Aucun dossier'}
              </h2>
            </div>

            {/* Boutons actions */}
            <div className="flex flex-wrap gap-2">
              <button
                className="px-2.5 py-1 rounded text-xs font-medium bg-[#7B61FF]/20 border border-[#7B61FF]/50 text-[#7B61FF] hover:bg-[#7B61FF]/30 hover:border-[#7B61FF] disabled:opacity-50"
                onClick={() => void openFolder()}
                title="Ouvrir un dossier"
              >
                <i className="fa-solid fa-folder-open mr-1" />
                Ouvrir
              </button>
              <button
                className="px-2.5 py-1 rounded text-xs font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                onClick={() => void refreshTree()}
                disabled={!rootPath}
                title="Rafraîchir l'arborescence"
              >
                <i className="fa-solid fa-arrow-rotate-right mr-1" />
                Rafraîchir
              </button>
            </div>

            {/* Boutons CRUD */}
            <div className="flex flex-wrap gap-2">
              <button
                className="px-2.5 py-1 rounded text-xs font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                onClick={openCreateFileDialog}
                disabled={!rootPath}
                title="Créer un fichier"
              >
                <i className="fa-solid fa-file-plus mr-1" />
                Fichier
              </button>
              <button
                className="px-2.5 py-1 rounded text-xs font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                onClick={openCreateDirectoryDialog}
                disabled={!rootPath}
                title="Créer un dossier"
              >
                <i className="fa-solid fa-folder-plus mr-1" />
                Dossier
              </button>
              <button
                className="px-2.5 py-1 rounded text-xs font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                onClick={openRenameDialog}
                disabled={!selectedPath || selectedPath === rootPath}
                title="Renommer"
              >
                <i className="fa-solid fa-pen mr-1" />
                Renommer
              </button>
              <button
                className="px-2.5 py-1 rounded text-xs font-medium border border-red-900/50 text-red-400 hover:border-red-700/80 hover:text-red-300 disabled:opacity-50"
                onClick={() => void deleteSelected()}
                disabled={!selectedPath || selectedPath === rootPath}
                title="Supprimer"
              >
                <i className="fa-solid fa-trash mr-1" />
                Supprimer
              </button>
            </div>

            {/* Arborescence */}
            {tree ? (
              <ul className="space-y-0.5 flex-1 overflow-auto">
                <TreeItem
                  node={tree!}
                  selectedPath={selectedPath}
                  onSelect={onSelectNode}
                  expandedDirectories={expandedDirectories}
                  onToggleDirectory={toggleDirectory}
                />
              </ul>
            ) : (
              <p className="text-xs text-white/40 text-center py-8">
                {desktopApiAvailable ? 'Ouvre un dossier pour commencer' : 'API Electron indisponible'}
              </p>
            )}
          </nav>
        )}

        {/* Panel Git */}
        {activeSidebar === 'git' && (
          <nav className="bg-[#1f2021] w-[300px] rounded-t-lg overflow-x-hidden overflow-y-auto flex-1 p-5 flex flex-col gap-3">
            
            {/* Titre */}
            <div>
              <h2 className="text-sm font-semibold text-white/80">
                🌿 Git
              </h2>
            </div>

            {/* Contenu selon état du repo */}
            {!rootPath ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ouvre un dossier pour utiliser Git
              </p>
            ) : !gitState.isRepo ? (
              <p className="text-xs text-white/40 text-center py-8">
                Ce dossier n'est pas un dépôt Git
              </p>
            ) : (
              <>
                {/* Branche et indicateurs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Branche</span>
                    <span className="text-xs font-semibold text-[#7B61FF]">{gitState.branch ?? '?'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Local</div>
                      <div className="text-xs font-bold text-white/80">✏️ {gitState.localChanges}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Sortants</div>
                      <div className="text-xs font-bold text-white/80">⬆️ {gitState.outgoing}</div>
                    </div>
                    <div className="bg-white/5 rounded px-1.5 py-1 text-center">
                      <div className="text-[10px] text-white/50">Entrants</div>
                      <div className="text-xs font-bold text-white/80">⬇️ {gitState.incoming}</div>
                    </div>
                  </div>
                </div>

                {/* Bouton Synchroniser */}
                <button
                  className="px-3 py-2 rounded text-xs font-bold bg-[#7B61FF] text-white hover:bg-[#6D4FD8] disabled:opacity-50 disabled:bg-[#7B61FF]/50 flex items-center justify-center gap-2"
                  onClick={() => void syncRepository()}
                  disabled={isGitBusy}
                  title="Synchroniser avec le dépôt distant"
                >
                  {isGitBusy ? (
                    <>
                      <i className="fa-solid fa-spinner fa-spin text-xs" />
                      Synchro...
                    </>
                  ) : (
                    <>
                      <i className="fa-solid fa-arrows-rotate text-xs" />
                      Synchroniser
                    </>
                  )}
                </button>

                {/* Boutons secondaires */}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openCommitDialog}
                    disabled={isGitBusy || gitState.localChanges === 0}
                    title="Créer un commit"
                  >
                    <i className="fa-solid fa-check mr-1" />
                    Commit
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void pullChanges()}
                    disabled={isGitBusy}
                    title="Tirer les changements"
                  >
                    <i className="fa-solid fa-arrow-down mr-1" />
                    Pull
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={openMergeDialog}
                    disabled={isGitBusy}
                    title="Fusionner une branche"
                  >
                    <i className="fa-solid fa-code-merge mr-1" />
                    Merge
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void fetchChanges()}
                    disabled={isGitBusy}
                    title="Récupérer les changements distants"
                  >
                    <i className="fa-solid fa-download mr-1" />
                    Fetch
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 rounded text-[10px] font-medium border border-white/10 text-white/70 hover:border-white/30 hover:text-white disabled:opacity-50"
                    onClick={() => void refreshGitState(false)}
                    disabled={isGitBusy}
                    title="Rafraîchir l'état Git"
                  >
                    <i className="fa-solid fa-arrow-rotate-right mr-1" />
                    Raf.
                  </button>
                </div>

                {/* Feedback de synchro */}
                {syncFeedback.message && (
                  <div
                    className={`rounded px-3 py-2 text-xs space-y-1 ${
                      syncFeedback.status === 'success'
                        ? 'bg-emerald-900/30 border border-emerald-700/50 text-emerald-200'
                        : syncFeedback.status === 'warning'
                          ? 'bg-amber-900/30 border border-amber-700/50 text-amber-200'
                          : 'bg-red-900/30 border border-red-700/50 text-red-200'
                    }`}
                  >
                    <p className="font-medium text-[10px] leading-tight">{syncFeedback.message}</p>
                    {syncFeedback.at && (
                      <p className="text-[9px] opacity-60">
                        {new Date(syncFeedback.at!).toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                )}

                {/* Erreur Git */}
                {gitState.error && (
                  <div className="rounded px-3 py-2 text-xs bg-red-900/30 border border-red-700/50 text-red-200">
                    <p className="font-medium text-[10px]">{gitState.error}</p>
                  </div>
                )}

                {/* Last fetch */}
                {gitState.lastFetchAt && (
                  <p className="text-[10px] text-white/40 text-center">
                    Fetch: {new Date(gitState.lastFetchAt).toLocaleTimeString()}
                  </p>
                )}

                {/* Conflicted files */}
                {conflictedFiles.length > 0 && (
                  <div className="rounded px-3 py-2 border border-amber-700/50 bg-amber-900/20 space-y-2">
                    <p className="text-[10px] font-bold text-amber-200">
                      ⚠️ {conflictedFiles.length} conflit(s)
                    </p>
                    <ul className="space-y-1">
                      {conflictedFiles.map((filePath) => (
                        <li key={filePath}>
                          <button
                            className="w-full truncate rounded border border-amber-700/30 bg-white/5 px-2 py-1 text-left text-[9px] text-amber-100 hover:bg-amber-900/20 hover:border-amber-700/50"
                            onClick={() => void openConflictedFile(filePath)}
                            title={filePath}
                          >
                            {getBaseName(filePath)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </nav>
        )}

      </aside>

      {/* Zone d'édition principale */}
      <section className="flex flex-1 flex-col bg-[#292929]" style={{ gridArea: 'content' }}>
          {/* Tab bar */}
          <div className="flex items-center border-b border-white/10 bg-[#242527]">
            {openTabs.length === 0 ? (
              <div className="flex-1 px-4 py-2 text-xs text-white/40">
                Aucun fichier ouvert
              </div>
            ) : (
              <>
                {openTabs.map((tab) => (
                  <button
                    key={tab.path}
                    className={`group flex items-center gap-2 border-r border-white/5 px-3 py-2 text-xs font-medium transition-colors ${
                      activeTabPath === tab.path
                        ? 'bg-[#1f2021] text-white'
                        : 'text-white/60 hover:text-white/80 hover:bg-white/5'
                    }`}
                    onClick={() => setActiveTabPath(tab.path)}
                  >
                    <span className="truncate max-w-[150px]">{tab.name}</span>
                    {tab.isDirty && <span className="text-xs">•</span>}
                    <button
                      className="ml-1 rounded px-1 opacity-0 hover:bg-white/20 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenTabs((prev) => prev.filter((t) => t.path !== tab.path))
                        if (activeTabPath === tab.path) {
                          setActiveTabPath(openTabs.length > 1 ? openTabs[0].path : null)
                        }
                      }}
                      title="Fermer"
                    >
                      <i className="fa-solid fa-xmark text-[9px]" />
                    </button>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Éditeur */}
          <div className="flex-1 p-4 flex flex-col">
            {activeTab ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-white/50">
                    {activeTab.path} {activeTab.isDirty ? '• non sauvegardé' : ''}
                  </span>
                  <button
                    className="rounded bg-[#7B61FF] px-3 py-1 text-xs font-medium text-white hover:bg-[#6D4FD8] disabled:opacity-50"
                    onClick={() => void saveCurrentFile()}
                    disabled={!activeTab.isDirty}
                    title="Sauvegarder (Ctrl+S)"
                  >
                    <i className="fa-solid fa-floppy-disk mr-1" />
                    Sauvegarder
                  </button>
                </div>
                <textarea
                  className="flex-1 resize-none rounded bg-[#1f2021] border border-white/10 p-3 font-mono text-sm text-white/90 outline-none focus:border-[#7B61FF]/50 focus:bg-[#262729]"
                  value={activeTab.content}
                  onChange={(event) => {
                    setOpenTabs((prev) =>
                      prev.map((tab) =>
                        tab.path === activeTabPath
                          ? { ...tab, content: event.target.value, isDirty: true }
                          : tab,
                      ),
                    )
                  }}
                  placeholder="Édite ton fichier ici..."
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-center text-sm text-white/40">
                  Clique sur un fichier pour commencer l'édition
                </p>
              </div>
            )}
          </div>
        </section>

      {nameDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">
              {nameDialog!.mode === 'create-file'
                ? 'Créer un fichier'
                : nameDialog!.mode === 'create-directory'
                  ? 'Créer un dossier'
                  : 'Renommer'}
            </h2>

            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault()
                void submitNameDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                value={nameDialog!.value}
                onChange={(event) =>
                  setNameDialog((previous) =>
                    previous
                      ? {
                        ...previous,
                        value: event.target.value,
                      }
                      : previous,
                  )
                }
                placeholder="Nom"
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                  onClick={() => setNameDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {gitDialog && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-slate-900">
              {gitDialog!.mode === 'commit' ? 'Nouveau commit' : 'Merge une branche'}
            </h2>

            <form
              className="mt-3"
              onSubmit={(event) => {
                event.preventDefault()
                void submitGitDialog()
              }}
            >
              <input
                autoFocus
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
                value={gitDialog!.value}
                onChange={(event) =>
                  setGitDialog((previous) =>
                    previous
                      ? {
                        ...previous,
                        value: event.target.value,
                      }
                      : previous,
                  )
                }
                placeholder={gitDialog!.mode === 'commit' ? 'Message de commit' : 'Nom de branche'}
              />

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
                  onClick={() => setGitDialog(null)}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
