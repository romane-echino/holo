import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from 'electron'
import updaterPkg from 'electron-updater'
import { execFile } from 'node:child_process'

const { autoUpdater } = updaterPkg
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import crypto from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged
const execFileAsync = promisify(execFile)
let currentRootPath = null
const MAX_RECENT_FOLDERS = 10
let updateState = { available: false, downloading: false, ready: false }

function getRecentFoldersFilePath() {
  return path.join(app.getPath('userData'), 'recent-folders.json')
}

async function readRecentFoldersRaw() {
  try {
    const raw = await fs.readFile(getRecentFoldersFilePath(), 'utf8')
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((entry) => typeof entry === 'string')
  } catch {
    return []
  }
}

async function writeRecentFolders(folders) {
  await fs.mkdir(path.dirname(getRecentFoldersFilePath()), { recursive: true })
  await fs.writeFile(getRecentFoldersFilePath(), JSON.stringify(folders, null, 2), 'utf8')
}

async function keepOnlyExistingDirectories(folderPaths) {
  const existing = []

  for (const folderPath of folderPaths) {
    try {
      const stats = await fs.stat(folderPath)

      if (stats.isDirectory()) {
        existing.push(folderPath)
      }
    } catch {
      // ignore paths no longer available
    }
  }

  return existing
}

async function getRecentFolders() {
  const rawFolders = await readRecentFoldersRaw()
  const existingFolders = await keepOnlyExistingDirectories(rawFolders)
  const trimmed = existingFolders.slice(0, MAX_RECENT_FOLDERS)

  if (JSON.stringify(trimmed) !== JSON.stringify(rawFolders)) {
    await writeRecentFolders(trimmed)
  }

  return trimmed
}

async function addRecentFolder(folderPath) {
  const normalizedTarget = path.resolve(folderPath)
  const recentFolders = await getRecentFolders()
  const deduplicated = [
    normalizedTarget,
    ...recentFolders.filter((entry) => path.resolve(entry) !== normalizedTarget),
  ]
  const trimmed = deduplicated.slice(0, MAX_RECENT_FOLDERS)
  await writeRecentFolders(trimmed)
  return trimmed
}

async function removeRecentFolder(folderPath) {
  const normalizedTarget = path.resolve(folderPath)
  const recentFolders = await getRecentFolders()
  const filtered = recentFolders.filter((entry) => path.resolve(entry) !== normalizedTarget)
  await writeRecentFolders(filtered)
  return filtered
}

function createDefaultGitState() {
  return {
    isRepo: false,
    branch: null,
    localChanges: 0,
    incoming: 0,
    outgoing: 0,
    conflictedFiles: [],
    lastFetchAt: null,
    error: null,
  }
}

function isPathInsideRoot(targetPath) {
  if (!currentRootPath) {
    return false
  }

  const relative = path.relative(currentRootPath, targetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function assertPathInsideRoot(targetPath) {
  if (!isPathInsideRoot(targetPath)) {
    throw new Error('Chemin hors du dossier ouvert.')
  }
}

function sanitizeName(name) {
  const trimmed = name.trim()

  if (!trimmed) {
    throw new Error('Le nom ne peut pas être vide.')
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Le nom ne doit pas contenir de séparateur de chemin.')
  }

  return trimmed
}

function getRepoNameFromUrl(rawUrl) {
  const cleaned = String(rawUrl ?? '').trim().replace(/\/+$/, '')

  if (!cleaned) {
    throw new Error('Le lien du dépôt est requis.')
  }

  const lastSegment = cleaned.split('/').pop() ?? ''
  const withoutGit = lastSegment.replace(/\.git$/i, '')
  const safeName = sanitizeName(withoutGit)

  return safeName
}

function withOptionalCredentials(rawUrl, username, password) {
  const safeUrl = assertExternalHttpUrl(rawUrl)
  const user = String(username ?? '').trim()
  const pass = String(password ?? '').trim()

  if (!user) {
    return safeUrl
  }

  const parsed = new URL(safeUrl)
  parsed.username = encodeURIComponent(user)
  parsed.password = encodeURIComponent(pass)
  return parsed.toString()
}

async function buildTree(entryPath) {
  const entries = (await fs.readdir(entryPath, { withFileTypes: true })).filter(
    (entry) => !entry.name.startsWith('.')
      && entry.name !== 'images'
      && (entry.isDirectory() || entry.name.toLowerCase().endsWith('.md')),
  )

  entries.sort((left, right) => {
    if (left.isDirectory() && !right.isDirectory()) {
      return -1
    }

    if (!left.isDirectory() && right.isDirectory()) {
      return 1
    }

    return left.name.localeCompare(right.name)
  })

  const children = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(entryPath, entry.name)

      if (entry.isDirectory()) {
        return {
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: await buildTree(fullPath),
        }
      }

      return {
        name: entry.name,
        path: fullPath,
        type: 'file',
      }
    }),
  )

  return children
}

async function getCurrentTreePayload() {
  if (!currentRootPath) {
    return null
  }

  const rootName = path.basename(currentRootPath)
  const children = await buildTree(currentRootPath)

  return {
    rootPath: currentRootPath,
    tree: {
      name: rootName,
      path: currentRootPath,
      type: 'directory',
      children,
    },
  }
}

async function runGit(args, cwd) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    })

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: 0,
    }
  } catch (error) {
    return {
      ok: false,
      stdout: (error.stdout ?? '').toString().trim(),
      stderr: (error.stderr ?? '').toString().trim(),
      code: error.code ?? 1,
    }
  }
}

async function isGitRepository(cwd) {
  const result = await runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  return result.ok && result.stdout === 'true'
}

async function getAheadBehind(cwd) {
  const result = await runGit(['rev-list', '--left-right', '--count', '@{upstream}...HEAD'], cwd)

  if (!result.ok) {
    return {
      incoming: 0,
      outgoing: 0,
    }
  }

  const [incomingText, outgoingText] = result.stdout.split(/\s+/)
  const incoming = Number.parseInt(incomingText ?? '0', 10)
  const outgoing = Number.parseInt(outgoingText ?? '0', 10)

  return {
    incoming: Number.isFinite(incoming) ? incoming : 0,
    outgoing: Number.isFinite(outgoing) ? outgoing : 0,
  }
}

async function getCurrentBranch(cwd) {
  const result = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  return result.ok ? result.stdout : null
}

async function hasRemoteNamed(cwd, remoteName) {
  const result = await runGit(['remote'], cwd)

  if (!result.ok) {
    return false
  }

  return result.stdout.split('\n').map((line) => line.trim()).includes(remoteName)
}

async function getGitState({ fetchRemote = false } = {}) {
  if (!currentRootPath) {
    return createDefaultGitState()
  }

  const isRepo = await isGitRepository(currentRootPath)

  if (!isRepo) {
    return createDefaultGitState()
  }

  let lastFetchAt = null
  let fetchError = null

  if (fetchRemote) {
    const fetchResult = await runGit(['fetch', '--all', '--prune'], currentRootPath)

    if (fetchResult.ok) {
      lastFetchAt = new Date().toISOString()
    } else {
      fetchError = fetchResult.stderr || fetchResult.stdout || 'Erreur fetch.'
    }
  }

  const branchResult = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], currentRootPath)
  const statusResult = await runGit(['status', '--porcelain'], currentRootPath)
  const { incoming, outgoing } = await getAheadBehind(currentRootPath)

  const localChanges = statusResult.ok
    ? statusResult.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length
    : 0

  const conflictedFiles = statusResult.ok
    ? getConflictedFilesFromStatusOutput(statusResult.stdout, currentRootPath)
    : []

  return {
    isRepo: true,
    branch: branchResult.ok ? branchResult.stdout : null,
    localChanges,
    incoming,
    outgoing,
    conflictedFiles,
    lastFetchAt,
    error: fetchError,
  }
}

function parsePorcelainLine(line) {
  const statusCode = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  const pathText = rawPath.includes('->') ? rawPath.split('->').pop()?.trim() ?? rawPath : rawPath
  return {
    statusCode,
    pathText,
  }
}

function isConflictStatus(statusCode) {
  return ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(statusCode)
}

function getConflictedFilesFromStatusOutput(statusOutput, cwd) {
  return statusOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(parsePorcelainLine)
    .filter((entry) => isConflictStatus(entry.statusCode))
    .map((entry) => path.join(cwd, entry.pathText))
}

function toNumstatValue(value) {
  if (value === '-' || value === '') {
    return 0
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseNumstatOutput(output) {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [addedText = '0', deletedText = '0', ...pathParts] = line.split('\t')

      return {
        filePath: pathParts.join('\t').trim(),
        added: toNumstatValue(addedText),
        deleted: toNumstatValue(deletedText),
      }
    })
    .filter((entry) => entry.filePath.length > 0)
}

async function createAutoCommitMessage(cwd) {
  const numstatResult = await runGit(['diff', '--cached', '--numstat'], cwd)

  if (!numstatResult.ok || !numstatResult.stdout) {
    return 'sync: mise à jour automatique'
  }

  const entries = parseNumstatOutput(numstatResult.stdout)

  if (entries.length === 0) {
    return 'sync: mise à jour automatique'
  }

  const totalAdded = entries.reduce((sum, entry) => sum + entry.added, 0)
  const totalDeleted = entries.reduce((sum, entry) => sum + entry.deleted, 0)
  const title = `sync: ${entries.length} fichier(s) modifié(s) (+${totalAdded}/-${totalDeleted})`
  const details = entries
    .map((entry) => `- ${entry.filePath} (+${entry.added}/-${entry.deleted})`)
    .join('\n')

  return `${title}\n\n${details}`
}

function ensureRootPath() {
  if (!currentRootPath) {
    throw new Error('Aucun dossier ouvert.')
  }

  return currentRootPath
}

async function ensureGitRepository(cwd) {
  if (!(await isGitRepository(cwd))) {
    throw new Error('Le dossier ouvert n’est pas un dépôt Git.')
  }
}

function getGitErrorMessage(result, fallback) {
  return result.stderr || result.stdout || fallback
}

function getWindowFromEvent(event) {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (!window) {
    throw new Error('Fenêtre introuvable.')
  }

  return window
}

function assertExternalHttpUrl(rawUrl) {
  let parsedUrl

  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error('URL invalide.')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Seules les URLs http(s) sont autorisées.')
  }

  return parsedUrl.toString()
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    frame: false,
    autoHideMenuBar: true,
    transparent: true,
    show: false,
    icon: path.join(__dirname, '../public/app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.setMenuBarVisibility(false)
  window.removeMenu()

  window.once('ready-to-show', () => {
    window.show()
  })

  if (isDev) {
    window.loadURL('http://localhost:5173')
    return
  }

  // Use app.getAppPath() for better compatibility with packaged apps (.asar)
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
  window.loadFile(indexPath)
}

ipcMain.handle('fs:open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  currentRootPath = result.filePaths[0]
  await addRecentFolder(currentRootPath)
  return getCurrentTreePayload()
})

ipcMain.handle('git:pick-clone-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('git:clone-repository', async (_event, payload) => {
  const repoUrl = String(payload?.repoUrl ?? '').trim()
  const username = String(payload?.username ?? '').trim()
  const password = String(payload?.password ?? '').trim()
  const destinationPath = String(payload?.destinationPath ?? '').trim()

  if (!repoUrl) {
    throw new Error('Le lien du dépôt est requis.')
  }

  if (!destinationPath) {
    throw new Error('Le dossier de destination est requis.')
  }

  const destinationStats = await fs.stat(destinationPath).catch(() => null)

  if (!destinationStats || !destinationStats.isDirectory()) {
    throw new Error('Le dossier de destination est invalide.')
  }

  const repoName = getRepoNameFromUrl(repoUrl)
  const cloneTargetPath = path.join(destinationPath, repoName)
  const cloneTargetExists = await fs.stat(cloneTargetPath).catch(() => null)

  if (cloneTargetExists) {
    throw new Error(`Le dossier cible existe déjà: ${cloneTargetPath}`)
  }

  const cloneUrl = withOptionalCredentials(repoUrl, username, password)
  const cloneResult = await runGit(['clone', cloneUrl, cloneTargetPath], destinationPath)

  if (!cloneResult.ok) {
    throw new Error(getGitErrorMessage(cloneResult, 'Échec du clone du dépôt.'))
  }

  currentRootPath = cloneTargetPath
  await addRecentFolder(currentRootPath)
  return getCurrentTreePayload()
})

ipcMain.handle('fs:get-recent-folders', async () => getRecentFolders())

ipcMain.handle('fs:remove-recent-folder', async (_event, folderPath) => removeRecentFolder(folderPath))

ipcMain.handle('fs:open-recent-folder', async (_event, folderPath) => {
  const targetPath = path.resolve(folderPath)
  const stats = await fs.stat(targetPath).catch(() => null)

  if (!stats || !stats.isDirectory()) {
    throw new Error('Le dossier récent n’existe plus ou est inaccessible.')
  }

  currentRootPath = targetPath
  await addRecentFolder(currentRootPath)
  return getCurrentTreePayload()
})

ipcMain.handle('window:minimize', async (event) => {
  const window = getWindowFromEvent(event)
  window.minimize()
  return { ok: true }
})

ipcMain.handle('window:toggle-maximize', async (event) => {
  const window = getWindowFromEvent(event)

  if (window.isMaximized()) {
    window.unmaximize()
    return { ok: true, isMaximized: false }
  }

  window.maximize()
  return { ok: true, isMaximized: true }
})

ipcMain.handle('window:close', async (event) => {
  const window = getWindowFromEvent(event)
  window.close()
  return { ok: true }
})

ipcMain.handle('window:toggle-devtools', async (event) => {
  const window = getWindowFromEvent(event)
  if (window.webContents.isDevToolsOpened()) {
    window.webContents.closeDevTools()
  } else {
    window.webContents.openDevTools()
  }
  return { ok: true }
})

ipcMain.handle('app:open-external-url', async (_event, rawUrl) => {
  const safeUrl = assertExternalHttpUrl(rawUrl)
  await shell.openExternal(safeUrl)
  return { ok: true }
})

ipcMain.handle('app:check-for-updates', async () => {
  try {
    await autoUpdater.checkForUpdatesAndNotify()
    return { ok: true, updateState }
  } catch (error) {
    console.error('Update check failed:', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('app:install-update', async () => {
  try {
    autoUpdater.quitAndInstall()
    return { ok: true }
  } catch (error) {
    console.error('Update install failed:', error)
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
})

ipcMain.handle('app:get-update-state', async () => updateState)
ipcMain.handle('app:get-version', async () => app.getVersion())

ipcMain.handle('fs:refresh-tree', async () => getCurrentTreePayload())

ipcMain.handle('fs:read-file', async (_event, filePath) => {
  assertPathInsideRoot(filePath)
  return fs.readFile(filePath, 'utf8')
})

ipcMain.handle('fs:get-path-stats', async (_event, targetPath) => {
  assertPathInsideRoot(targetPath)
  const stats = await fs.stat(targetPath)

  return {
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString(),
  }
})

ipcMain.handle('fs:write-file', async (_event, filePath, content) => {
  assertPathInsideRoot(filePath)
  await fs.writeFile(filePath, content, 'utf8')
  return { ok: true }
})

ipcMain.handle('fs:create-file', async (_event, parentDirectoryPath, name) => {
  assertPathInsideRoot(parentDirectoryPath)
  const safeName = sanitizeName(name)
  const targetPath = path.join(parentDirectoryPath, safeName)
  assertPathInsideRoot(targetPath)
  await fs.writeFile(targetPath, '', { flag: 'wx' })
  return { ok: true }
})

ipcMain.handle('fs:create-directory', async (_event, parentDirectoryPath, name) => {
  assertPathInsideRoot(parentDirectoryPath)
  const safeName = sanitizeName(name)
  const targetPath = path.join(parentDirectoryPath, safeName)
  assertPathInsideRoot(targetPath)
  await fs.mkdir(targetPath)
  return { ok: true }
})

ipcMain.handle('fs:delete-path', async (_event, targetPath) => {
  assertPathInsideRoot(targetPath)

  if (targetPath === currentRootPath) {
    throw new Error('Impossible de supprimer le dossier racine ouvert.')
  }

  await fs.rm(targetPath, { recursive: true, force: false })
  return { ok: true }
})

ipcMain.handle('fs:rename-path', async (_event, targetPath, newName) => {
  assertPathInsideRoot(targetPath)
  const safeName = sanitizeName(newName)
  const parentPath = path.dirname(targetPath)
  const newPath = path.join(parentPath, safeName)
  assertPathInsideRoot(newPath)
  await fs.rename(targetPath, newPath)
  return { ok: true, newPath }
})

ipcMain.handle('fs:move-path', async (_event, sourcePath, targetDirectoryPath) => {
  assertPathInsideRoot(sourcePath)
  assertPathInsideRoot(targetDirectoryPath)

  if (sourcePath === currentRootPath) {
    throw new Error('Impossible de déplacer le dossier racine ouvert.')
  }

  const sourceReal = path.resolve(sourcePath)
  const targetReal = path.resolve(targetDirectoryPath)

  if (sourceReal === targetReal) {
    throw new Error('Source et destination identiques.')
  }

  if (targetReal.startsWith(`${sourceReal}${path.sep}`)) {
    throw new Error('Impossible de déplacer un dossier dans lui-même.')
  }

  const targetPath = path.join(targetDirectoryPath, path.basename(sourcePath))
  assertPathInsideRoot(targetPath)

  await fs.rename(sourcePath, targetPath)
  return { ok: true, newPath: targetPath }
})

ipcMain.handle('git:get-state', async (_event, fetchRemote = false) =>
  getGitState({ fetchRemote: Boolean(fetchRemote) }),
)

ipcMain.handle('git:fetch', async () => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const result = await runGit(['fetch', '--all', '--prune'], cwd)

  if (!result.ok) {
    throw new Error(getGitErrorMessage(result, 'Échec du fetch Git.'))
  }

  return {
    ok: true,
    output: result.stdout,
  }
})

ipcMain.handle('git:commit', async (_event, message) => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const commitMessage = String(message ?? '').trim()

  if (!commitMessage) {
    throw new Error('Le message de commit est requis.')
  }

  const addResult = await runGit(['add', '-A'], cwd)

  if (!addResult.ok) {
    throw new Error(getGitErrorMessage(addResult, 'Échec du git add.'))
  }

  const commitResult = await runGit(['commit', '-m', commitMessage], cwd)

  if (!commitResult.ok) {
    throw new Error(getGitErrorMessage(commitResult, 'Échec du commit.'))
  }

  let pushResult = await runGit(['push'], cwd)

  if (!pushResult.ok) {
    const branchName = await getCurrentBranch(cwd)
    const hasOrigin = await hasRemoteNamed(cwd, 'origin')
    const needsUpstream = /upstream branch|no upstream branch|set-upstream/i.test(
      `${pushResult.stderr}\n${pushResult.stdout}`,
    )

    if (needsUpstream && branchName && hasOrigin) {
      pushResult = await runGit(['push', '-u', 'origin', branchName], cwd)
    }
  }

  if (!pushResult.ok) {
    return {
      ok: true,
      committed: true,
      pushed: false,
      output: commitResult.stdout,
      pushError: getGitErrorMessage(
        pushResult,
        'Commit créé localement, mais push impossible. Il faut probablement récupérer les changements distants avant de renvoyer.',
      ),
    }
  }

  return {
    ok: true,
    committed: true,
    pushed: true,
    output: commitResult.stdout,
    pushError: null,
  }
})

ipcMain.handle('git:sync', async () => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const fetchResult = await runGit(['fetch', '--all', '--prune'], cwd)

  if (!fetchResult.ok) {
    throw new Error(getGitErrorMessage(fetchResult, 'Échec du fetch Git.'))
  }

  const statusBeforeResult = await runGit(['status', '--porcelain'], cwd)

  if (!statusBeforeResult.ok) {
    throw new Error(getGitErrorMessage(statusBeforeResult, 'Impossible de lire le statut Git.'))
  }

  const conflictsBefore = getConflictedFilesFromStatusOutput(statusBeforeResult.stdout, cwd)

  if (conflictsBefore.length > 0) {
    return {
      ok: true,
      committed: false,
      pulled: false,
      pushed: false,
      hadConflicts: true,
      conflictedFiles: conflictsBefore,
      commitMessage: null,
      error: 'Conflits détectés. Résous-les avant de synchroniser.',
    }
  }

  const hasLocalChanges = statusBeforeResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0).length > 0

  let committed = false
  let commitMessage = null

  if (hasLocalChanges) {
    const addResult = await runGit(['add', '-A'], cwd)

    if (!addResult.ok) {
      throw new Error(getGitErrorMessage(addResult, 'Échec du git add.'))
    }

    commitMessage = await createAutoCommitMessage(cwd)
    const commitResult = await runGit(['commit', '-m', commitMessage], cwd)

    if (!commitResult.ok) {
      const isNoChanges = /nothing to commit|no changes added/i.test(
        `${commitResult.stderr}\n${commitResult.stdout}`,
      )

      if (!isNoChanges) {
        throw new Error(getGitErrorMessage(commitResult, 'Échec du commit automatique.'))
      }
    } else {
      committed = true
    }
  }

  const pullResult = await runGit(['pull', '--rebase'], cwd)

  if (!pullResult.ok) {
    const statusAfterPull = await runGit(['status', '--porcelain'], cwd)
    const conflictsAfterPull = statusAfterPull.ok
      ? getConflictedFilesFromStatusOutput(statusAfterPull.stdout, cwd)
      : []

    if (conflictsAfterPull.length > 0) {
      return {
        ok: true,
        committed,
        pulled: false,
        pushed: false,
        hadConflicts: true,
        conflictedFiles: conflictsAfterPull,
        commitMessage,
        error: getGitErrorMessage(
          pullResult,
          'Conflits détectés pendant la synchronisation. Résolution requise.',
        ),
      }
    }

    throw new Error(getGitErrorMessage(pullResult, 'Échec du pull (rebase).'))
  }

  const { outgoing } = await getAheadBehind(cwd)
  let pushed = false
  let pushError = null

  if (outgoing > 0 || committed) {
    let pushResult = await runGit(['push'], cwd)

    if (!pushResult.ok) {
      const branchName = await getCurrentBranch(cwd)
      const hasOrigin = await hasRemoteNamed(cwd, 'origin')
      const needsUpstream = /upstream branch|no upstream branch|set-upstream/i.test(
        `${pushResult.stderr}\n${pushResult.stdout}`,
      )

      if (needsUpstream && branchName && hasOrigin) {
        pushResult = await runGit(['push', '-u', 'origin', branchName], cwd)
      }
    }

    if (pushResult.ok) {
      pushed = true
    } else {
      pushError = getGitErrorMessage(pushResult, 'Synchronisation partielle : le push a échoué.')
    }
  }

  return {
    ok: true,
    committed,
    pulled: true,
    pushed,
    hadConflicts: false,
    conflictedFiles: [],
    commitMessage,
    error: pushError,
  }
})

ipcMain.handle('git:pull', async () => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const result = await runGit(['pull'], cwd)

  if (!result.ok) {
    throw new Error(getGitErrorMessage(result, 'Échec du pull.'))
  }

  return {
    ok: true,
    output: result.stdout,
  }
})

ipcMain.handle('git:merge', async (_event, branch) => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const branchName = String(branch ?? '').trim()

  if (!branchName) {
    throw new Error('La branche à merger est requise.')
  }

  const result = await runGit(['merge', branchName], cwd)

  if (!result.ok) {
    throw new Error(getGitErrorMessage(result, 'Échec du merge.'))
  }

  return {
    ok: true,
    output: result.stdout,
  }
})

ipcMain.handle('fs:save-image', async (_event, name, dataBase64) => {
  if (!currentRootPath) throw new Error('Aucun dossier ouvert.')

  const imagesDir = path.join(currentRootPath, 'images')
  await fs.mkdir(imagesDir, { recursive: true })

  const ext = path.extname(name) || '.png'
  const base = path.basename(name, ext).replace(/[^a-z0-9_-]/gi, '_')
  
  // Generate hash from file content to avoid duplicates
  const hash = crypto.createHash('sha256').update(dataBase64).digest('hex').substring(0, 8)
  const uniqueName = `${base}-${hash}${ext}`
  const destPath = path.join(imagesDir, uniqueName)

  const buffer = Buffer.from(dataBase64, 'base64')
  await fs.writeFile(destPath, buffer)

  return { ok: true, relativePath: `images/${uniqueName}`, absolutePath: destPath }
})

ipcMain.handle('fs:load-image', async (_event, relativePath) => {
  if (!currentRootPath) throw new Error('Aucun dossier ouvert.')
  
  // Decode the path in case it contains URL-encoded characters
  let decodedPath = String(relativePath ?? '')
  try {
    decodedPath = decodeURIComponent(decodedPath)
  } catch {
    // Keep original path when decode fails (e.g. stray %)
  }
  const imagePath = path.join(currentRootPath, decodedPath)
  const normalizedRoot = path.normalize(currentRootPath)
  const normalizedPath = path.normalize(imagePath)
  const normalizedRootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`
  
  // Security check: ensure file is within project root
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRootWithSep)) {
    throw new Error('Accès refusé.')
  }
  
  try {
    const data = await fs.readFile(normalizedPath)
    const base64 = data.toString('base64')
    const ext = path.extname(normalizedPath).toLowerCase()
    let mimeType = 'image/png'
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg'
    else if (ext === '.gif') mimeType = 'image/gif'
    else if (ext === '.webp') mimeType = 'image/webp'
    else if (ext === '.svg') mimeType = 'image/svg+xml'
    
    return { ok: true, dataUrl: `data:${mimeType};base64,${base64}` }
  } catch (error) {
    throw new Error(`Impossible de charger l'image: ${error instanceof Error ? error.message : String(error)}`)
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()

  // Configure auto-updater
  if (!isDev) {
    const isIgnorableUpdateError = (error) => {
      const code = error && typeof error === 'object' ? error.code : null
      const statusCode = error && typeof error === 'object' ? error.statusCode : null
      return code === 'HTTP_ERROR_404' || statusCode === 404
    }

    autoUpdater.on('update-available', () => {
      updateState.available = true
      updateState.downloading = true
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('app:update-available')
      })
    })

    autoUpdater.on('update-downloaded', () => {
      updateState.downloading = false
      updateState.ready = true
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('app:update-ready')
      })
    })

    autoUpdater.on('download-progress', (progressObj) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('app:update-progress', { percent: progressObj.percent })
      })
    })

    autoUpdater.on('error', (error) => {
      if (isIgnorableUpdateError(error)) {
        console.log('Updater: aucune release disponible (404), vérification ignorée.')
        return
      }

      console.error('Updater error:', error)
    })

    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      if (!isIgnorableUpdateError(error)) {
        console.error('Initial update check failed:', error)
      }
    })

    setInterval(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        if (!isIgnorableUpdateError(error)) {
          console.error('Periodic update check failed:', error)
        }
      })
    }, 60 * 60 * 1000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
