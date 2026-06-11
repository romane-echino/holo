import { app, BrowserWindow, Menu, MenuItem, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron'
import updaterPkg from 'electron-updater'
import { execFile, spawn } from 'node:child_process'

const { autoUpdater } = updaterPkg
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import crypto from 'node:crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isDev = !app.isPackaged
const hasSingleInstanceLock = app.requestSingleInstanceLock()
const execFileAsync = promisify(execFile)
let currentRootPath = null
const knownRootPaths = new Set() // tous les espaces jamais ouverts (pour la lecture cross-espace)
const MAX_RECENT_FOLDERS = 10
const ARCHIVE_DIR_NAME = '.archive'
let updateState = { available: false, downloading: false, ready: false }

if (!hasSingleInstanceLock) {
  app.quit()
}

function getRecentFoldersFilePath() {
  return path.join(getHoloDataDir(), 'recent-folders.json')
}

function getLegacyRecentFoldersFilePath() {
  return path.join(app.getPath('userData'), 'recent-folders.json')
}

function getHoloDataDir() {
  return path.join(app.getPath('appData'), 'holo')
}

function getLegacyHoloConfigPath() {
  return path.join(app.getPath('userData'), 'holo-config.json')
}

function getLegacySearchIndexPath() {
  return path.join(app.getPath('userData'), 'search-index.json')
}

async function readUtf8WithLegacyFallback(preferredPath, legacyPath) {
  try {
    return await fs.readFile(preferredPath, 'utf8')
  } catch (error) {
    if (error?.code !== 'ENOENT' || !legacyPath || legacyPath === preferredPath) {
      throw error
    }

    return await fs.readFile(legacyPath, 'utf8')
  }
}

async function readRecentFoldersRaw() {
  try {
    const raw = await readUtf8WithLegacyFallback(getRecentFoldersFilePath(), getLegacyRecentFoldersFilePath())
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

// Sérialise toutes les mutations de recent-folders.json pour éviter les pertes
// de mises à jour (read-modify-write concurrents qui se clobberent mutuellement,
// ce qui faisait disparaître des espaces).
let recentFoldersWriteChain = Promise.resolve()
function withRecentFoldersLock(task) {
  const result = recentFoldersWriteChain.then(task, task)
  recentFoldersWriteChain = result.then(() => undefined, () => undefined)
  return result
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
  // Retourne la liste brute sans purge — la purge des dossiers manquants
  // ne s'effectue qu'au démarrage via cleanupRecentFolders() pour éviter
  // que des dossiers temporairement inaccessibles (réseau, montage…) soient
  // supprimés définitivement lors d'une simple lecture.
  const rawFolders = await readRecentFoldersRaw()
  return rawFolders.slice(0, MAX_RECENT_FOLDERS)
}

// Appelée une seule fois au démarrage pour supprimer les entrées invalides.
async function cleanupRecentFolders() {
  return withRecentFoldersLock(async () => {
    const rawFolders = await readRecentFoldersRaw()
    const existingFolders = await keepOnlyExistingDirectories(rawFolders)
    const trimmed = existingFolders.slice(0, MAX_RECENT_FOLDERS)
    if (JSON.stringify(trimmed) !== JSON.stringify(rawFolders)) {
      await writeRecentFolders(trimmed)
    }
    return trimmed
  })
}

async function addRecentFolder(folderPath) {
  const normalizedTarget = path.resolve(folderPath)
  return withRecentFoldersLock(async () => {
    const rawFolders = await readRecentFoldersRaw()
    const deduplicated = [
      normalizedTarget,
      ...rawFolders.filter((entry) => path.resolve(entry) !== normalizedTarget),
    ]
    const trimmed = deduplicated.slice(0, MAX_RECENT_FOLDERS)
    await writeRecentFolders(trimmed)
    return trimmed
  })
}

async function removeRecentFolder(folderPath) {
  const normalizedTarget = path.resolve(folderPath)
  return withRecentFoldersLock(async () => {
    const rawFolders = await readRecentFoldersRaw()
    const filtered = rawFolders.filter((entry) => path.resolve(entry) !== normalizedTarget)
    await writeRecentFolders(filtered)
    return filtered
  })
}

function getHoloConfigPath() {
  const dir = getHoloDataDir()
  return path.join(dir, 'holo-config.json')
}

function getSearchIndexPath() {
  return path.join(getHoloDataDir(), 'search-index.json')
}

async function readHoloConfig() {
  try {
    const raw = await readUtf8WithLegacyFallback(getHoloConfigPath(), getLegacyHoloConfigPath())
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

async function writeHoloConfig(config) {
  await fs.mkdir(path.dirname(getHoloConfigPath()), { recursive: true })
  await fs.writeFile(getHoloConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

// Sérialise toutes les mutations de la config pour éviter les pertes de mises à jour
// (read-modify-write concurrents qui se clobberent mutuellement).
let configWriteChain = Promise.resolve()
function withConfigLock(task) {
  const result = configWriteChain.then(task, task)
  configWriteChain = result.then(() => undefined, () => undefined)
  return result
}

async function getHoloConfigValue(key) {
  const config = await readHoloConfig()
  return config[key] ?? null
}

async function setHoloConfigValue(key, value) {
  return withConfigLock(async () => {
    const config = await readHoloConfig()
    if (value === null || value === undefined) {
      delete config[key]
    } else {
      config[key] = value
    }
    await writeHoloConfig(config)
  })
}

async function getHoloConfig() {
  return await readHoloConfig()
}

async function setHoloConfig(cfg) {
  return withConfigLock(async () => {
    await writeHoloConfig(typeof cfg === 'object' && cfg !== null ? cfg : {})
  })
}

function normalizeMarkdownFilename(name) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) return 'untitled.md'
  if (/\.md$/i.test(trimmed)) {
    return trimmed.replace(/\.md$/i, '.md')
  }

  const lastSlashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const lastDotIndex = trimmed.lastIndexOf('.')
  const hasExtension = lastDotIndex > lastSlashIndex

  if (!hasExtension) {
    return `${trimmed}.md`
  }

  return `${trimmed.slice(0, lastDotIndex)}.md`
}

function createDefaultGitState() {
  return {
    isRepo: false,
    branch: null,
    localChanges: 0,
    incoming: 0,
    outgoing: 0,
    conflictedFiles: [],
    operationInProgress: 'none',
    lastFetchAt: null,
    error: null,
  }
}

function isPathInsideRoot(targetPath) {
  if (!currentRootPath) {
    return false
  }

  const normalizedRootPath = path.resolve(currentRootPath)
  const normalizedTargetPath = path.resolve(String(targetPath ?? ''))
  const relative = path.relative(normalizedRootPath, normalizedTargetPath)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function isPathInsideAnyKnownRoot(targetPath) {
  if (isPathInsideRoot(targetPath)) return true
  const normalizedTargetPath = path.resolve(String(targetPath ?? ''))
  for (const root of knownRootPaths) {
    const relative = path.relative(path.resolve(root), normalizedTargetPath)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return true
  }
  return false
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

function getArchiveRootPath() {
  const rootPath = ensureRootPath()
  return path.join(rootPath, ARCHIVE_DIR_NAME)
}

function getArchiveRelativePathFromOriginal(targetPath) {
  const rootPath = ensureRootPath()
  const relative = path.relative(rootPath, targetPath)

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Chemin de fichier invalide pour archivage.')
  }

  return relative
}

function getOriginalPathFromArchivePath(archivePath) {
  const rootPath = ensureRootPath()
  const archiveRoot = getArchiveRootPath()
  const relativeFromArchive = path.relative(archiveRoot, archivePath)

  if (!relativeFromArchive || relativeFromArchive.startsWith('..') || path.isAbsolute(relativeFromArchive)) {
    throw new Error('Chemin archivé invalide.')
  }

  return path.join(rootPath, relativeFromArchive)
}

async function collectMarkdownFilesRecursively(startDirectory) {
  const entries = await fs.readdir(startDirectory, { withFileTypes: true })
  const results = []

  for (const entry of entries) {
    const fullPath = path.join(startDirectory, entry.name)

    if (entry.isDirectory()) {
      results.push(...(await collectMarkdownFilesRecursively(fullPath)))
      continue
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      results.push(fullPath)
    }
  }

  return results
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

function getImageMimeTypeFromExtension(extension) {
  const ext = extension.toLowerCase()

  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.ico') return 'image/x-icon'
  if (ext === '.avif') return 'image/avif'
  return 'image/png'
}

function normalizeAzureContainerUrl(rawUrl) {
  let parsed

  try {
    parsed = new URL(String(rawUrl ?? '').trim())
  } catch {
    throw new Error('URL du container Azure invalide.')
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Le container Azure doit utiliser HTTPS.')
  }

  parsed.search = ''
  parsed.hash = ''

  if (!parsed.pathname || parsed.pathname === '/') {
    throw new Error('Le chemin du container Azure est requis.')
  }

  return parsed.toString().replace(/\/+$/, '')
}

function normalizeAzureSasToken(rawToken) {
  const token = String(rawToken ?? '').trim().replace(/^\?+/, '')

  if (!token) {
    throw new Error('Le SAS token Azure est requis.')
  }

  return token
}

async function uploadImageToAzureBlob({ containerUrl, sasToken, blobName, buffer, mimeType }) {
  const normalizedContainerUrl = normalizeAzureContainerUrl(containerUrl)
  const normalizedSasToken = normalizeAzureSasToken(sasToken)
  const encodedBlobName = encodeURIComponent(blobName)
  const uploadUrl = `${normalizedContainerUrl}/${encodedBlobName}?${normalizedSasToken}`

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2023-11-03',
      'Content-Type': mimeType,
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`Upload Azure impossible (${response.status})${details ? `: ${details.slice(0, 180)}` : ''}`)
  }

  return uploadUrl
}

function normalizeS3Endpoint(rawEndpoint) {
  const value = String(rawEndpoint ?? '').trim()

  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('Endpoint S3 invalide.')
    }

    return url.toString().replace(/\/+$/, '')
  } catch {
    throw new Error('Endpoint S3 invalide.')
  }
}

function buildS3PublicUrl({ bucket, region, endpoint, key, publicBaseUrl }) {
  const customBase = String(publicBaseUrl ?? '').trim().replace(/\/+$/, '')

  if (customBase) {
    return `${customBase}/${encodeURIComponent(key)}`
  }

  if (endpoint) {
    return `${endpoint.replace(/\/+$/, '')}/${bucket}/${encodeURIComponent(key)}`
  }

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodeURIComponent(key)}`
}

async function uploadImageToS3({ region, bucket, accessKeyId, secretAccessKey, endpoint, key, buffer, mimeType, publicBaseUrl }) {
  const normalizedRegion = String(region ?? '').trim()
  const normalizedBucket = String(bucket ?? '').trim()
  const normalizedAccessKeyId = String(accessKeyId ?? '').trim()
  const normalizedSecretAccessKey = String(secretAccessKey ?? '').trim()

  if (!normalizedRegion || !normalizedBucket || !normalizedAccessKeyId || !normalizedSecretAccessKey) {
    throw new Error('Configuration S3 incomplète (region/bucket/access keys).')
  }

  const normalizedEndpoint = normalizeS3Endpoint(endpoint)

  const s3Client = new S3Client({
    region: normalizedRegion,
    endpoint: normalizedEndpoint,
    credentials: {
      accessKeyId: normalizedAccessKeyId,
      secretAccessKey: normalizedSecretAccessKey,
    },
    forcePathStyle: Boolean(normalizedEndpoint),
  })

  await s3Client.send(new PutObjectCommand({
    Bucket: normalizedBucket,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
  }))

  return buildS3PublicUrl({
    bucket: normalizedBucket,
    region: normalizedRegion,
    endpoint: normalizedEndpoint,
    key,
    publicBaseUrl,
  })
}

function normalizeDropboxFolderPath(rawFolderPath) {
  const trimmed = String(rawFolderPath ?? '').trim()

  if (!trimmed) {
    return '/holo-images'
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '') || '/holo-images'
}

function normalizeDropboxDirectLink(sharedUrl) {
  try {
    const parsed = new URL(sharedUrl)
    parsed.searchParams.set('raw', '1')
    parsed.searchParams.delete('dl')
    return parsed.toString()
  } catch {
    return sharedUrl
  }
}

async function callDropboxApi(endpoint, accessToken, payload) {
  const response = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const bodyText = await response.text().catch(() => '')

  if (!response.ok) {
    throw new Error(`Dropbox API ${endpoint} (${response.status})${bodyText ? `: ${bodyText.slice(0, 180)}` : ''}`)
  }

  if (!bodyText) {
    return null
  }

  return JSON.parse(bodyText)
}

async function getOrCreateDropboxSharedLink(accessToken, dropboxPath) {
  try {
    const created = await callDropboxApi('sharing/create_shared_link_with_settings', accessToken, {
      path: dropboxPath,
      settings: { requested_visibility: 'public' },
    })

    if (created?.url) {
      return normalizeDropboxDirectLink(created.url)
    }
  } catch {
    // fallback: try reading existing shared links
  }

  const listed = await callDropboxApi('sharing/list_shared_links', accessToken, {
    path: dropboxPath,
    direct_only: true,
  })

  const existingUrl = listed?.links?.[0]?.url

  if (!existingUrl) {
    throw new Error('Impossible de générer un lien partageable Dropbox.')
  }

  return normalizeDropboxDirectLink(existingUrl)
}

async function uploadImageToDropbox({ accessToken, folderPath, fileName, buffer }) {
  const normalizedToken = String(accessToken ?? '').trim()

  if (!normalizedToken) {
    throw new Error('Le token Dropbox est requis.')
  }

  const normalizedFolder = normalizeDropboxFolderPath(folderPath)
  const targetPath = `${normalizedFolder}/${fileName}`

  const uploadResponse = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
      'Dropbox-API-Arg': JSON.stringify({
        path: targetPath,
        mode: 'add',
        autorename: true,
        mute: true,
      }),
      'Content-Type': 'application/octet-stream',
    },
    body: buffer,
  })

  const uploadText = await uploadResponse.text().catch(() => '')

  if (!uploadResponse.ok) {
    throw new Error(`Upload Dropbox impossible (${uploadResponse.status})${uploadText ? `: ${uploadText.slice(0, 180)}` : ''}`)
  }

  let uploadData = null
  try {
    uploadData = uploadText ? JSON.parse(uploadText) : null
  } catch {
    uploadData = null
  }

  const uploadedPath = uploadData?.path_lower || uploadData?.path_display || targetPath
  return getOrCreateDropboxSharedLink(normalizedToken, uploadedPath)
}

async function uploadImageToGoogleDrive({ accessToken, folderId, fileName, buffer, mimeType }) {
  const normalizedToken = String(accessToken ?? '').trim()

  if (!normalizedToken) {
    throw new Error('Le token Google Drive est requis.')
  }

  const normalizedFolderId = String(folderId ?? '').trim()
  const metadata = {
    name: fileName,
    ...(normalizedFolderId ? { parents: [normalizedFolderId] } : {}),
  }

  const boundary = `holo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    'utf8',
  )
  const mediaHeaderPart = Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  )
  const endingPart = Buffer.from(`\r\n--${boundary}--`, 'utf8')
  const multipartBody = Buffer.concat([metadataPart, mediaHeaderPart, buffer, endingPart])

  const uploadResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,webContentLink', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'Content-Length': String(multipartBody.length),
    },
    body: multipartBody,
  })

  const uploadText = await uploadResponse.text().catch(() => '')

  if (!uploadResponse.ok) {
    throw new Error(`Upload Google Drive impossible (${uploadResponse.status})${uploadText ? `: ${uploadText.slice(0, 180)}` : ''}`)
  }

  let uploadData = null
  try {
    uploadData = uploadText ? JSON.parse(uploadText) : null
  } catch {
    uploadData = null
  }

  const fileId = uploadData?.id

  if (!fileId) {
    throw new Error('Google Drive: identifiant de fichier introuvable après upload.')
  }

  const permissionResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      role: 'reader',
      type: 'anyone',
    }),
  })

  if (!permissionResponse.ok) {
    const details = await permissionResponse.text().catch(() => '')
    throw new Error(`Google Drive: impossible de rendre l'image publique (${permissionResponse.status})${details ? `: ${details.slice(0, 180)}` : ''}`)
  }

  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
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

// ─── Identifiants git enregistrés (chiffrés via safeStorage) ─────────────────
// Sauvegardés par hôte (github.com, dev.azure.com…) dans holo-config.json sous
// la clé « git-credentials ». Le mot de passe/token est chiffré au repos quand
// le chiffrement OS est disponible, sinon stocké en base64 (repli).
function getGitHostFromUrl(rawUrl) {
  try {
    return new URL(String(rawUrl ?? '').trim()).host.toLowerCase()
  } catch {
    return null
  }
}

function encryptSecret(plain) {
  const text = String(plain ?? '')
  if (!text) return ''

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return `enc:${safeStorage.encryptString(text).toString('base64')}`
    }
  } catch {
    // repli ci-dessous
  }

  return `plain:${Buffer.from(text, 'utf8').toString('base64')}`
}

function decryptSecret(stored) {
  if (typeof stored !== 'string' || !stored) return ''

  if (stored.startsWith('enc:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    } catch {
      return ''
    }
  }

  if (stored.startsWith('plain:')) {
    try {
      return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    } catch {
      return ''
    }
  }

  return ''
}

async function getSavedGitCredentials(host) {
  if (!host) return null

  const config = await readHoloConfig()
  const all = config['git-credentials']
  if (!all || typeof all !== 'object' || Array.isArray(all)) return null

  const entry = all[host]
  if (!entry || typeof entry !== 'object') return null

  const username = typeof entry.username === 'string' ? entry.username : ''
  const password = decryptSecret(entry.password)
  if (!username && !password) return null

  return { username, password }
}

async function saveGitCredentials(host, username, password) {
  if (!host) return

  return withConfigLock(async () => {
    const config = await readHoloConfig()
    const all = config['git-credentials'] && typeof config['git-credentials'] === 'object' && !Array.isArray(config['git-credentials'])
      ? config['git-credentials']
      : {}

    all[host] = {
      username: String(username ?? ''),
      password: encryptSecret(password),
    }
    config['git-credentials'] = all
    await writeHoloConfig(config)
  })
}

// Détecte une erreur d'authentification git à partir de la sortie d'erreur.
function isGitAuthFailure(result) {
  const text = `${result?.stderr ?? ''} ${result?.stdout ?? ''}`.toLowerCase()
  return (
    text.includes('authentication failed')
    || text.includes('could not read username')
    || text.includes('could not read password')
    || text.includes('invalid username or password')
    || text.includes('terminal prompts disabled')
    || text.includes('http basic: access denied')
    || text.includes('403')
    || text.includes('401')
  )
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
    // core.quotePath=false : évite l'échappement octal des noms non-ASCII (accents)
    // dans les sorties porcelain/numstat, pour que les chemins restent exploitables.
    // GIT_TERMINAL_PROMPT=0 : empêche git de rester bloqué sur un prompt d'identifiants
    // (aucun terminal disponible dans l'app) → l'échec d'auth remonte proprement.
    const { stdout, stderr } = await execFileAsync('git', ['-c', 'core.quotePath=false', ...args], {
      cwd,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
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

// Résout le répertoire .git réel (gère .git fichier des worktrees/submodules).
async function getGitDir(cwd) {
  const result = await runGit(['rev-parse', '--git-dir'], cwd)
  if (!result.ok || !result.stdout) return null
  return path.isAbsolute(result.stdout) ? result.stdout : path.join(cwd, result.stdout)
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

// Détecte l'opération git en cours afin d'interpréter correctement
// les côtés « ours »/« theirs » d'un conflit (ils sont inversés en rebase).
async function getInProgressOperation(cwd) {
  const gitDir = await getGitDir(cwd)
  if (!gitDir) return 'none'

  if (
    (await pathExists(path.join(gitDir, 'rebase-merge'))) ||
    (await pathExists(path.join(gitDir, 'rebase-apply')))
  ) {
    return 'rebase'
  }

  if (await pathExists(path.join(gitDir, 'MERGE_HEAD'))) {
    return 'merge'
  }

  return 'none'
}

// Résout un conflit en conservant les DEUX versions : retire uniquement les lignes
// de marqueurs (<<<<<<< / ======= / >>>>>>>) situées à l'intérieur des blocs de conflit,
// en gardant tout le contenu des deux côtés dans l'ordre du fichier.
function resolveKeepBothSides(content) {
  const lines = content.split('\n')
  const out = []
  let inConflict = false

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) { inConflict = true; continue }
    if (inConflict && line.startsWith('=======')) { continue }
    if (inConflict && line.startsWith('>>>>>>>')) { inConflict = false; continue }
    out.push(line)
  }

  return out.join('\n')
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

  const remoteResult = await runGit(['remote'], currentRootPath)
  const hasRemote = remoteResult.ok && remoteResult.stdout.trim().length > 0

  const operationInProgress = await getInProgressOperation(currentRootPath)

  return {
    isRepo: true,
    hasRemote,
    branch: branchResult.ok ? branchResult.stdout : null,
    localChanges,
    incoming,
    outgoing,
    conflictedFiles,
    operationInProgress,
    lastFetchAt,
    error: fetchError,
  }
}

/**
 * Déquote un chemin issu d'une sortie git (status/diff). Git entoure de guillemets
 * et échappe (style C) les chemins « inhabituels » (espaces, accents, guillemets…).
 * Renvoie le chemin réel exploitable côté système de fichiers.
 */
function unquoteGitPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length < 2) {
    return rawPath
  }
  if (!(rawPath.startsWith('"') && rawPath.endsWith('"'))) {
    return rawPath
  }

  const inner = rawPath.slice(1, -1)
  let result = ''
  let hadOctal = false
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i]
    if (char !== '\\') {
      result += char
      continue
    }

    const next = inner[i + 1]
    switch (next) {
      case 'n':
        result += '\n'
        i += 1
        break
      case 't':
        result += '\t'
        i += 1
        break
      case 'r':
        result += '\r'
        i += 1
        break
      case '"':
        result += '"'
        i += 1
        break
      case '\\':
        result += '\\'
        i += 1
        break
      default:
        // Séquence octale \NNN (présente quand core.quotePath n'est pas désactivé).
        if (next !== undefined && next >= '0' && next <= '7') {
          const octal = inner.slice(i + 1, i + 4)
          const code = Number.parseInt(octal, 8)
          if (Number.isFinite(code)) {
            result += String.fromCharCode(code)
            hadOctal = true
            i += octal.length
            break
          }
        }
        result += char
        break
    }
  }

  // Sans échappement octal (core.quotePath=false), la chaîne est déjà de l'UTF-8 valide.
  if (!hadOctal) {
    return result
  }

  // Les séquences octales produisent des octets UTF-8 individuels : on les recompose.
  try {
    const bytes = Uint8Array.from(Array.from(result, (c) => c.charCodeAt(0) & 0xff))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return result
  }
}

function parsePorcelainLine(line) {
  const statusCode = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  const unquoted = unquoteGitPath(rawPath)
  const pathText = unquoted.includes('->')
    ? unquoteGitPath(unquoted.split('->').pop()?.trim() ?? unquoted)
    : unquoted
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
        filePath: unquoteGitPath(pathParts.join('\t').trim()),
        added: toNumstatValue(addedText),
        deleted: toNumstatValue(deletedText),
      }
    })
    .filter((entry) => entry.filePath.length > 0)
}

function normalizeRemoteToWebUrl(rawRemote) {
  const remote = String(rawRemote ?? '').trim()
  if (!remote) return null

  const sshMatch = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/i)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }

  if (/^ssh:\/\//i.test(remote)) {
    try {
      const parsed = new URL(remote)
      const pathname = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/i, '')

      if (parsed.hostname === 'ssh.dev.azure.com' && pathname.startsWith('v3/')) {
        const [, organization, project, repository] = pathname.split('/')
        if (organization && project && repository) {
          return `https://dev.azure.com/${organization}/${project}/_git/${repository}`
        }
      }

      return `https://${parsed.hostname}/${pathname}`
    } catch {
      return null
    }
  }

  if (/^https?:\/\//i.test(remote)) {
    try {
      const parsed = new URL(remote)
      parsed.username = ''
      parsed.password = ''
      return `${parsed.origin}${parsed.pathname.replace(/\.git$/i, '')}`
    } catch {
      return null
    }
  }

  return null
}

function buildCommitUrl(remoteWebUrl, hash) {
  if (!remoteWebUrl || !hash) return null

  const normalized = remoteWebUrl.replace(/\/+$/, '')

  if (/bitbucket/i.test(normalized)) {
    return `${normalized}/commits/${hash}`
  }

  return `${normalized}/commit/${hash}`
}

function collectDiffPreviewLines(output, maxPerKind = 2, maxChars = 140) {
  const additionsPreview = []
  const deletionsPreview = []

  for (const line of String(output ?? '').split('\n')) {
    if (!line) continue
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('@@') || line.startsWith('+++') || line.startsWith('---')) {
      continue
    }

    const normalizedLine = line.slice(1).trim()
    if ((line.startsWith('+') || line.startsWith('-')) && isIgnorableMarkdownMetadataLine(normalizedLine)) {
      continue
    }

    if (line.startsWith('+') && additionsPreview.length < maxPerKind) {
      const preview = normalizedLine.replace(/\s+/g, ' ').slice(0, maxChars)
      if (preview) additionsPreview.push(preview)
      continue
    }

    if (line.startsWith('-') && deletionsPreview.length < maxPerKind) {
      const preview = normalizedLine.replace(/\s+/g, ' ').slice(0, maxChars)
      if (preview) deletionsPreview.push(preview)
    }
  }

  return { additionsPreview, deletionsPreview }
}

function isIgnorableMarkdownMetadataLine(line) {
  const normalized = String(line ?? '').trim()
  if (!normalized || normalized === '---') return true
  return /^(updated(?:[-_ ]?at)?|modified(?:[-_ ]?at)?|last[-_ ]?modified)\s*:/i.test(normalized)
}

function isIgnorableActivityDiff(output) {
  const changedLines = String(output ?? '')
    .split('\n')
    .filter(Boolean)
    .filter((line) => !line.startsWith('diff --git') && !line.startsWith('index ') && !line.startsWith('@@') && !line.startsWith('+++') && !line.startsWith('---'))
    .filter((line) => line.startsWith('+') || line.startsWith('-'))
    .map((line) => line.slice(1).trim())
    .filter(Boolean)

  return changedLines.length > 0 && changedLines.every(isIgnorableMarkdownMetadataLine)
}

async function getPrimaryRemoteWebUrl(cwd) {
  const remoteResult = await runGit(['remote', 'get-url', 'origin'], cwd)
  if (!remoteResult.ok || !remoteResult.stdout) return null
  return normalizeRemoteToWebUrl(remoteResult.stdout)
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

function normalizeArgPath(rawArg) {
  const trimmed = String(rawArg ?? '').trim().replace(/^"+|"+$/g, '')

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('file://')) {
    try {
      return fileURLToPath(trimmed)
    } catch {
      return ''
    }
  }

  return trimmed
}

async function getLaunchPayloadFromArgv(argv) {
  const rootArg = argv.find((arg) => arg.startsWith('--holo-root='))
  const fileArg = argv.find((arg) => arg.startsWith('--holo-file='))

  if (rootArg || fileArg) {
    return {
      rootPath: rootArg ? rootArg.slice('--holo-root='.length) : '',
      filePath: fileArg ? fileArg.slice('--holo-file='.length) : '',
    }
  }

  for (const arg of argv) {
    if (typeof arg !== 'string') {
      continue
    }

    const normalizedArg = arg.trim().replace(/^"+|"+$/g, '')

    if (!normalizedArg.toLowerCase().startsWith('holo://')) {
      continue
    }

    try {
      const parsedUrl = new URL(normalizedArg)
      const repoName = decodeURIComponent(parsedUrl.hostname.trim())
      const relativeFilePath = decodeURIComponent(parsedUrl.pathname || '').replace(/^\/+/, '')

      if (!repoName) {
        return {
          rootPath: '',
          filePath: '',
          startupError: 'Lien holo invalide: dépôt manquant.',
        }
      }

      if (!relativeFilePath.toLowerCase().endsWith('.md')) {
        return {
          rootPath: '',
          filePath: '',
          startupError: 'Lien holo invalide: le fichier ciblé doit être un .md.',
        }
      }

      const recentFolders = await getRecentFolders()
      const matchingRepo = recentFolders.find((folderPath) =>
        path.basename(folderPath).toLowerCase() === repoName.toLowerCase(),
      )

      if (!matchingRepo) {
        return {
          rootPath: '',
          filePath: '',
          startupError: `Aucun dépôt correspondant trouvé: ${repoName}`,
        }
      }

      const targetFilePath = path.join(matchingRepo, relativeFilePath)
      const targetStats = await fs.stat(targetFilePath).catch(() => null)

      if (!targetStats || !targetStats.isFile()) {
        return {
          rootPath: '',
          filePath: '',
          startupError: `Fichier introuvable dans le dépôt ${repoName}: ${relativeFilePath}`,
        }
      }

      return {
        rootPath: matchingRepo,
        filePath: targetFilePath,
      }
    } catch {
      return {
        rootPath: '',
        filePath: '',
        startupError: 'Impossible de lire le lien holo transmis au lancement.',
      }
    }
  }

  for (const arg of argv) {
    if (typeof arg !== 'string' || arg.startsWith('-')) {
      continue
    }

    const normalizedArgPath = normalizeArgPath(arg)

    if (!normalizedArgPath) {
      continue
    }

    const candidatePath = path.resolve(normalizedArgPath)
    const stats = await fs.stat(candidatePath).catch(() => null)

    if (!stats || !stats.isFile()) {
      continue
    }

    if (!candidatePath.toLowerCase().endsWith('.md')) {
      continue
    }

    return {
      rootPath: path.dirname(candidatePath),
      filePath: candidatePath,
    }
  }

  return {
    rootPath: '',
    filePath: '',
    startupError: '',
  }
}

function spawnDetachedHoloInstance({ rootPath = '', filePath = '' } = {}) {
  const args = []

  if (!app.isPackaged) {
    args.push(path.join(__dirname, 'main.js'))
  }

  if (rootPath) {
    args.push(`--holo-root=${rootPath}`)
  }

  if (filePath) {
    args.push(`--holo-file=${filePath}`)
  }

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
  })

  child.unref()
}

function createWindow(launchPayload = null) {
  const isWindows = process.platform === 'win32'
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 320,
    minHeight: 640,
    title: "Holo",
    frame: false,
    // Sur Windows, titleBarStyle:'hidden' réactive l'Aero snap (drag vers le haut/côtés)
    // et les raccourcis Win+flèches, tout en conservant le rendu personnalisé.
    ...(isWindows && { titleBarStyle: 'hidden' }),
    transparent: !isWindows,
    backgroundColor: isWindows ? '#1a1a2e' : '#00000000',
    vibrancy: "under-window",
    visualEffectState: "active",
    show: false,
    icon: path.join(__dirname, '../public/app-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: true,
    },
  })

  window.setMenuBarVisibility(false)
  window.removeMenu()

  // Native spellcheck context menu
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable || params.dictionarySuggestions.length === 0) return
    const menu = new Menu()
    for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => window.webContents.replaceMisspelling(suggestion),
      }))
    }
    menu.append(new MenuItem({ type: 'separator' }))
    menu.append(new MenuItem({
      label: 'Ignorer',
      click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
    }))
    menu.popup({ window })
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  navigateWindowToLaunchPayload(window, launchPayload)
}

function navigateWindowToLaunchPayload(window, launchPayload = null) {
  const query = {}
  if (launchPayload?.rootPath) {
    query.rootPath = launchPayload.rootPath
  }
  if (launchPayload?.filePath) {
    query.filePath = launchPayload.filePath
  }
  if (launchPayload?.startupError) {
    query.startupError = launchPayload.startupError
  }

  if (isDev) {
    const queryString = new URLSearchParams(query).toString()
    window.loadURL(queryString ? `http://localhost:5173?${queryString}` : 'http://localhost:5173')
    return
  }

  // Use app.getAppPath() for better compatibility with packaged apps (.asar)
  const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
  window.loadFile(indexPath, { query })
}

app.on('second-instance', (_event, argv) => {
  void (async () => {
    const payload = await getLaunchPayloadFromArgv(argv)
    const window = BrowserWindow.getAllWindows()[0]

    if (!window) {
      createWindow(payload)
      return
    }

    if (window.isMinimized()) window.restore()
    window.focus()

    if (payload.rootPath || payload.filePath || payload.startupError) {
      navigateWindowToLaunchPayload(window, payload)
    }
  })()
})

ipcMain.handle('fs:open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  currentRootPath = result.filePaths[0]
  knownRootPaths.add(currentRootPath)
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
  let username = String(payload?.username ?? '').trim()
  let password = String(payload?.password ?? '').trim()
  const destinationPath = String(payload?.destinationPath ?? '').trim()
  const remember = payload?.remember !== false

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

  // Aucun identifiant fourni → on réutilise ceux enregistrés pour cet hôte.
  const host = getGitHostFromUrl(repoUrl)
  if (!username && !password) {
    const saved = await getSavedGitCredentials(host)
    if (saved) {
      username = saved.username
      password = saved.password
    }
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
    // En cas d'échec (auth refusée, URL invalide…), git peut laisser un dossier
    // cible partiellement créé. On le supprime pour qu'une nouvelle tentative
    // (après correction des identifiants) ne bute pas sur « le dossier existe déjà ».
    await fs.rm(cloneTargetPath, { recursive: true, force: true }).catch(() => {})

    if (isGitAuthFailure(cloneResult)) {
      const authError = new Error('Authentification refusée : vérifiez le nom d\'utilisateur et le token.')
      authError.code = 'AUTH_FAILED'
      throw authError
    }

    throw new Error(getGitErrorMessage(cloneResult, 'Échec du clone du dépôt.'))
  }

  // Clone réussi avec des identifiants → on les mémorise (chiffrés) pour cet hôte.
  if (remember && host && (username || password)) {
    await saveGitCredentials(host, username, password).catch(() => {})
  }

  currentRootPath = cloneTargetPath
  knownRootPaths.add(currentRootPath)
  await addRecentFolder(currentRootPath)
  return getCurrentTreePayload()
})

// Renvoie l'éventuel nom d'utilisateur enregistré pour l'hôte d'une URL de dépôt
// (sans jamais exposer le mot de passe/token au renderer).
ipcMain.handle('git:get-saved-credentials', async (_event, rawUrl) => {
  const host = getGitHostFromUrl(rawUrl)
  const saved = await getSavedGitCredentials(host)
  if (!saved) return null
  return { username: saved.username, hasPassword: Boolean(saved.password) }
})


ipcMain.handle('fs:get-recent-folders', async () => getRecentFolders())

ipcMain.handle('fs:get-recent-folder-icon', async (_event, folderPath) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) {
    return null
  }

  const normalizedFolderPath = path.resolve(folderPath)
  const recentFolders = await getRecentFolders()

  if (!recentFolders.includes(normalizedFolderPath)) {
    return null
  }

  const configPath = path.join(normalizedFolderPath, '.holo.json')
  const configStats = await fs.stat(configPath).catch(() => null)

  if (!configStats || !configStats.isFile()) {
    return null
  }

  try {
    const rawConfig = await fs.readFile(configPath, 'utf8')
    const parsedConfig = JSON.parse(rawConfig)
    const folderIcons = parsedConfig?.folderIcons

    if (!folderIcons || typeof folderIcons !== 'object' || Array.isArray(folderIcons)) {
      return null
    }

    const icon = folderIcons[normalizedFolderPath] ?? folderIcons[folderPath]
    return typeof icon === 'string' && icon.trim().length > 0 ? icon : null
  } catch {
    return null
  }
})

ipcMain.handle('fs:remove-recent-folder', async (_event, folderPath) => removeRecentFolder(folderPath))

ipcMain.handle('shell:show-item-in-folder', async (_event, folderPath) => {
  shell.showItemInFolder(path.resolve(folderPath))
  return { ok: true }
})

ipcMain.handle('shell:open-path', async (_event, targetPath) => {
  const errorMessage = await shell.openPath(path.resolve(targetPath))
  if (errorMessage) {
    throw new Error(errorMessage)
  }
  return { ok: true }
})

ipcMain.handle('search-index:get-path', async () => getSearchIndexPath())

ipcMain.handle('search-index:read', async () => {
  try {
    return await readUtf8WithLegacyFallback(getSearchIndexPath(), getLegacySearchIndexPath())
  } catch {
    return null
  }
})

ipcMain.handle('search-index:write', async (_event, content) => {
  await fs.mkdir(path.dirname(getSearchIndexPath()), { recursive: true })
  await fs.writeFile(getSearchIndexPath(), String(content ?? ''), 'utf8')
  return { ok: true }
})

ipcMain.handle('fs:open-recent-folder', async (_event, folderPath) => {
  const targetPath = path.resolve(folderPath)
  const stats = await fs.stat(targetPath).catch(() => null)

  if (!stats || !stats.isDirectory()) {
    throw new Error('Le dossier récent n’existe plus ou est inaccessible.')
  }

  currentRootPath = targetPath
  knownRootPaths.add(currentRootPath)
  await addRecentFolder(currentRootPath)
  return getCurrentTreePayload()
})

ipcMain.handle('app:get-config', async () => getHoloConfig())
ipcMain.handle('app:set-config', async (_event, cfg) => {
  await setHoloConfig(cfg)
  return { ok: true }
})
ipcMain.handle('app:get-config-value', async (_event, key) => getHoloConfigValue(key))
ipcMain.handle('app:set-config-value', async (_event, key, value) => {
  await setHoloConfigValue(key, value)
  return { ok: true }
})
ipcMain.handle('app:factory-reset', async () => {
  // Réinitialisation d'usine : supprime la configuration globale, la liste des
  // espaces/dossiers liés et l'index de recherche (chemins actuels + legacy).
  const targets = [
    getHoloConfigPath(),
    getLegacyHoloConfigPath(),
    getRecentFoldersFilePath(),
    getLegacyRecentFoldersFilePath(),
    getSearchIndexPath(),
    getLegacySearchIndexPath(),
  ]
  await withConfigLock(() =>
    withRecentFoldersLock(async () => {
      for (const target of targets) {
        try {
          await fs.rm(target, { force: true })
        } catch {
          // ignore les fichiers déjà absents
        }
      }
    }),
  )
  return { ok: true }
})
ipcMain.handle('clipboard:write-text', async (_event, text) => {
  console.log('Received clipboard write-text request:', { text })
  clipboard.writeText(String(text ?? ''))
  return { ok: true }
})
ipcMain.handle('clipboard:get-formats', async () => clipboard.availableFormats())
ipcMain.handle('clipboard:has-format', async (_event, format) => clipboard.has(String(format)))
ipcMain.handle('clipboard:read-format', async (_event, format) => {
  try {
    return clipboard.read(String(format))
  } catch {
    return ''
  }
})

ipcMain.handle('window:minimize', async (event) => {
  const window = getWindowFromEvent(event)
  window.minimize()
  return { ok: true }
})

ipcMain.handle('window:get-state', async (event) => {
  const window = getWindowFromEvent(event)
  return {
    ok: true,
    isMaximized: window.isMaximized(),
    platform: process.platform,
  }
})

ipcMain.handle('window:drag-from-maximized', async (event, payload) => {
  const window = getWindowFromEvent(event)

  if (process.platform !== 'win32' || !window.isMaximized()) {
    return { ok: false, isMaximized: window.isMaximized() }
  }

  const pointerScreenX = Number(payload?.pointerScreenX ?? 0)
  const pointerScreenY = Number(payload?.pointerScreenY ?? 0)
  const pointerOffsetRatioX = Math.min(1, Math.max(0, Number(payload?.pointerOffsetRatioX ?? 0.5)))
  const headerHeight = Math.max(1, Number(payload?.headerHeight ?? 64))

  window.unmaximize()

  const [restoredWidth] = window.getSize()
  const targetX = Math.round(pointerScreenX - restoredWidth * pointerOffsetRatioX)
  const targetY = Math.max(0, Math.round(pointerScreenY - Math.min(headerHeight / 2, 24)))

  window.setPosition(targetX, targetY)

  return {
    ok: true,
    isMaximized: false,
  }
})

ipcMain.handle('window:set-position', async (event, payload) => {
  const window = getWindowFromEvent(event)
  const x = Math.round(Number(payload?.x ?? 0))
  const y = Math.round(Number(payload?.y ?? 0))

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error('Position de fenêtre invalide.')
  }

  window.setPosition(x, y)
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
ipcMain.handle('app:export-pdf', async (event, payload) => {
  const rawHtml = typeof payload?.html === 'string' ? payload.html : ''
  const rawSuggestedName = typeof payload?.suggestedName === 'string' ? payload.suggestedName : 'document'

  if (!rawHtml.trim()) {
    throw new Error('Contenu PDF vide.')
  }

  const ownerWindow = BrowserWindow.fromWebContents(event.sender)
  const safeBaseName = rawSuggestedName
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.pdf$/i, '') || 'document'

  const defaultPdfPath = path.join(app.getPath('documents'), `${safeBaseName}.pdf`)
  const saveResult = await dialog.showSaveDialog(ownerWindow ?? undefined, {
    title: 'Exporter en PDF',
    defaultPath: defaultPdfPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true }
  }

  let printWindow = null
  try {
    printWindow = new BrowserWindow({
      show: false,
      width: 1240,
      height: 1754,
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
      },
    })

    await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(rawHtml)}`)
    await new Promise((resolve) => setTimeout(resolve, 120))

    const pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 1,
      landscape: false,
      preferCSSPageSize: true,
    })

    await fs.writeFile(saveResult.filePath, pdfBuffer)

    return { ok: true, filePath: saveResult.filePath }
  } finally {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy()
    }
  }
})
ipcMain.handle('app:open-file-in-new-window', async (_event, payload) => {
  const rootPath = String(payload?.rootPath ?? '').trim()
  const filePath = String(payload?.filePath ?? '').trim()

  if (!rootPath) {
    throw new Error('Le dossier racine est requis.')
  }

  const rootStats = await fs.stat(rootPath).catch(() => null)
  if (!rootStats || !rootStats.isDirectory()) {
    throw new Error('Le dossier racine est invalide.')
  }

  if (filePath) {
    const fileStats = await fs.stat(filePath).catch(() => null)
    if (!fileStats || !fileStats.isFile()) {
      throw new Error('Le fichier demandé est introuvable.')
    }
  }

  spawnDetachedHoloInstance({ rootPath, filePath })
  return { ok: true }
})

ipcMain.handle('fs:refresh-tree', async () => getCurrentTreePayload())

ipcMain.handle('fs:register-known-roots', (_event, paths) => {
  if (Array.isArray(paths)) { for (const p of paths) if (typeof p === 'string') knownRootPaths.add(p) }
  return { ok: true }
})

ipcMain.handle('fs:read-file', async (_event, filePath) => {
  // Autoriser la lecture dans tous les espaces connus (pour la recherche cross-espace)
  if (!isPathInsideAnyKnownRoot(filePath)) {
    throw new Error('Chemin hors du dossier ouvert.')
  }
  return fs.readFile(filePath, 'utf8')
})

ipcMain.handle('fs:read-file-optional', async (_event, filePath) => {
  if (!isPathInsideAnyKnownRoot(filePath)) {
    throw new Error('Chemin hors du dossier ouvert.')
  }
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
})

ipcMain.handle('fs:get-path-stats', async (_event, targetPath) => {
  if (!isPathInsideAnyKnownRoot(targetPath)) {
    throw new Error('Chemin hors du dossier ouvert.')
  }
  const stats = await fs.stat(targetPath)

  return {
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtime.toISOString(),
  }
})

ipcMain.handle('fs:write-file', async (_event, filePath, content) => {
  assertPathInsideRoot(filePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
  return { ok: true }
})

ipcMain.handle('fs:create-file', async (_event, parentDirectoryPath, name) => {
  assertPathInsideRoot(parentDirectoryPath)
  const safeName = sanitizeName(normalizeMarkdownFilename(name))
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

ipcMain.handle('fs:scan-md-files', async (_event, folderPath) => {
  try {
    const stat = await fs.stat(folderPath).catch(() => null)
    if (!stat?.isDirectory()) return []
    async function scanDir(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      const results = []
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue // ignorer les dossiers cachés (.archive, .git, etc.)
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          results.push(...(await scanDir(fullPath)))
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          results.push(fullPath)
        }
      }
      return results
    }
    return await scanDir(folderPath)
  } catch { return [] }
})

ipcMain.handle('fs:filter-existing-paths', async (_event, paths) => {
  if (!Array.isArray(paths)) return []
  const results = await Promise.all(
    paths.map(async (p) => {
      try { await fs.access(p); return p } catch { return null }
    })
  )
  return results.filter(Boolean)
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

ipcMain.handle('fs:copy-file', async (_event, sourcePath, targetDirectoryPath) => {
  assertPathInsideRoot(sourcePath)
  assertPathInsideRoot(targetDirectoryPath)

  // Vérifier que la source existe et est un fichier
  const stats = await fs.stat(sourcePath).catch(() => null)
  if (!stats || !stats.isFile()) {
    throw new Error('Seuls les fichiers peuvent être dupliqués.')
  }

  // Générer un nom unique pour la copie
  const basename = path.basename(sourcePath)
  const ext = path.extname(basename)
  const nameWithoutExt = basename.slice(0, -ext.length)

  let copyPath = path.join(targetDirectoryPath, `${nameWithoutExt} (copie)${ext}`)
  let counter = 1

  while (await fs.stat(copyPath).catch(() => null)) {
    copyPath = path.join(targetDirectoryPath, `${nameWithoutExt} (copie ${counter})${ext}`)
    counter++
  }

  assertPathInsideRoot(copyPath)

  // Copier le fichier
  await fs.copyFile(sourcePath, copyPath)
  return { ok: true, newPath: copyPath }
})

ipcMain.handle('fs:archive-path', async (_event, targetPath) => {
  assertPathInsideRoot(targetPath)

  if (targetPath === currentRootPath) {
    throw new Error('Impossible d’archiver le dossier racine ouvert.')
  }

  const stats = await fs.stat(targetPath).catch(() => null)

  if (!stats || !stats.isFile()) {
    throw new Error('Seuls les fichiers peuvent être archivés.')
  }

  const archiveRoot = getArchiveRootPath()
  const relativePath = getArchiveRelativePathFromOriginal(targetPath)
  const destinationPath = path.join(archiveRoot, relativePath)
  const destinationDirectory = path.dirname(destinationPath)

  await fs.mkdir(destinationDirectory, { recursive: true })

  const destinationExists = await fs.stat(destinationPath).catch(() => null)
  let finalDestinationPath = destinationPath

  if (destinationExists) {
    const ext = path.extname(destinationPath)
    const base = destinationPath.slice(0, Math.max(0, destinationPath.length - ext.length))
    finalDestinationPath = `${base}-${Date.now()}${ext}`
  }

  await fs.rename(targetPath, finalDestinationPath)

  return {
    ok: true,
    archivedPath: finalDestinationPath,
    originalPath: targetPath,
  }
})

ipcMain.handle('fs:list-archived-files', async () => {
  if (!currentRootPath) return []
  const archiveRoot = getArchiveRootPath()
  const archiveStats = await fs.stat(archiveRoot).catch(() => null)

  if (!archiveStats || !archiveStats.isDirectory()) {
    return []
  }

  const archivedMarkdownFiles = await collectMarkdownFilesRecursively(archiveRoot)

  return archivedMarkdownFiles.map((archivedPath) => ({
    archivedPath,
    originalPath: getOriginalPathFromArchivePath(archivedPath),
    name: path.basename(archivedPath),
  }))
})

ipcMain.handle('fs:restore-archived-path', async (_event, archivedPath) => {
  assertPathInsideRoot(archivedPath)

  const archiveRoot = getArchiveRootPath()
  const relativeFromArchive = path.relative(archiveRoot, archivedPath)

  if (!relativeFromArchive || relativeFromArchive.startsWith('..') || path.isAbsolute(relativeFromArchive)) {
    throw new Error('Le fichier sélectionné n’est pas dans l’archive.')
  }

  const originalPath = path.join(ensureRootPath(), relativeFromArchive)
  assertPathInsideRoot(originalPath)

  const archivedStats = await fs.stat(archivedPath).catch(() => null)

  if (!archivedStats || !archivedStats.isFile()) {
    throw new Error('Fichier archivé introuvable.')
  }

  const originalExists = await fs.stat(originalPath).catch(() => null)

  if (originalExists) {
    throw new Error('Un fichier existe déjà à l’emplacement de restauration.')
  }

  await fs.mkdir(path.dirname(originalPath), { recursive: true })
  await fs.rename(archivedPath, originalPath)

  return {
    ok: true,
    archivedPath,
    restoredPath: originalPath,
  }
})

ipcMain.handle('git:get-state', async (_event, fetchRemote = false) =>
  getGitState({ fetchRemote: Boolean(fetchRemote) }),
)

ipcMain.handle('git:get-folder-statuses', async (_event, folderPaths) => {
  const results = {}
  await Promise.all(
    (folderPaths ?? []).map(async (folderPath) => {
      try {
        const isRepo = await isGitRepository(folderPath)
        if (!isRepo) { results[folderPath] = 'local'; return }
        const remoteResult = await runGit(['remote'], folderPath)
        results[folderPath] = remoteResult.ok && remoteResult.stdout.trim().length > 0
          ? 'git-sync'
          : 'git-readonly'
      } catch {
        results[folderPath] = 'local'
      }
    })
  )
  return results
})

ipcMain.handle('git:get-file-log', async (_event, filePath, maxCount = 10) => {
  const cwd = currentRootPath
  if (!cwd) return []

  const isRepo = await isGitRepository(cwd)
  if (!isRepo) return []

  const result = await runGit(
    ['log', '--follow', `-n`, String(maxCount), '--pretty=format:%H\x1f%an\x1f%ae\x1f%at\x1f%s', '--', filePath],
    cwd,
  )

  if (!result.ok || !result.stdout) return []

  return result.stdout.split('\n').map((line) => {
    const [hash, authorName, authorEmail, timestamp, subject] = line.split('\x1f')
    return {
      hash: hash ?? '',
      shortHash: (hash ?? '').slice(0, 7),
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      timestamp: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : '',
      subject: subject ?? '',
    }
  })
})

ipcMain.handle('git:get-file-activity', async (_event, filePath, maxCount = 10) => {
  const cwd = currentRootPath
  if (!cwd) return []

  const isRepo = await isGitRepository(cwd)
  if (!isRepo) return []

  const resolvedFilePath = path.resolve(String(filePath ?? ''))
  const relativeFilePath = path.relative(cwd, resolvedFilePath)
  if (!relativeFilePath || relativeFilePath.startsWith('..') || path.isAbsolute(relativeFilePath)) return []

  const logResult = await runGit(
    ['log', '--follow', '-n', String(maxCount), '--pretty=format:%H\x1f%an\x1f%ae\x1f%at\x1f%s', '--', relativeFilePath],
    cwd,
  )

  if (!logResult.ok || !logResult.stdout) return []

  const remoteWebUrl = await getPrimaryRemoteWebUrl(cwd)
  const commits = logResult.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, authorName, authorEmail, timestamp, subject] = line.split('\x1f')
    return {
      hash: hash ?? '',
      shortHash: (hash ?? '').slice(0, 7),
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      timestamp: timestamp ? new Date(Number(timestamp) * 1000).toISOString() : '',
      subject: subject ?? '',
    }
  })

  const activities = await Promise.all(commits.map(async (commit) => {
    const numstatResult = await runGit(['show', '--format=', '--numstat', commit.hash, '--', relativeFilePath], cwd)
    const diffResult = await runGit(['show', '--format=', '--unified=0', commit.hash, '--', relativeFilePath], cwd)
    if (isIgnorableActivityDiff(diffResult.stdout)) return null
    const stats = parseNumstatOutput(numstatResult.stdout).find(Boolean) ?? { added: 0, deleted: 0 }
    const previews = collectDiffPreviewLines(diffResult.stdout)

    return {
      ...commit,
      added: stats.added,
      deleted: stats.deleted,
      additionsPreview: previews.additionsPreview,
      deletionsPreview: previews.deletionsPreview,
      commitUrl: buildCommitUrl(remoteWebUrl, commit.hash),
    }
  }))

  return activities.filter(Boolean)
})

ipcMain.handle('git:get-contributors', async () => {
  const cwd = currentRootPath
  if (!cwd) return []

  const isRepo = await isGitRepository(cwd)
  if (!isRepo) return []

  const result = await runGit(['shortlog', '-sne', '--all'], cwd)
  if (!result.ok || !result.stdout) return []

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(.+?)\s+<([^>]+)>$/)
      if (!match) return null

      return {
        commitCount: Number(match[1]),
        authorName: match[2] ?? '',
        authorEmail: match[3] ?? '',
      }
    })
    .filter(Boolean)
})

ipcMain.handle('git:auto-save', async (_event, filePath, authorName, authorEmail) => {
  let cwd = currentRootPath
  // Si le fichier n'est pas dans l'espace courant (race condition lors d'un switch),
  // trouver l'espace qui contient ce fichier parmi les espaces enregistrés.
  if (filePath && cwd) {
    const normalizedFile = path.normalize(filePath)
    const normalizedCwd = path.normalize(cwd)
    if (!normalizedFile.startsWith(normalizedCwd + path.sep) && normalizedFile !== normalizedCwd) {
      const spaces = await getRecentFolders().catch(() => [])
      const owningSpace = spaces
        .map(s => path.normalize(s))
        .sort((a, b) => b.length - a.length) // espace le plus spécifique en premier
        .find(s => normalizedFile.startsWith(s + path.sep))
      if (owningSpace) cwd = owningSpace
    }
  }
  if (!cwd) return { ok: true, committed: false, reason: 'no-root-path' }

  const isRepo = await isGitRepository(cwd)
  if (!isRepo) return { ok: true, committed: false, reason: 'not-a-repo' }

  // Sécurité : ne JAMAIS committer pendant un rebase/merge en cours ou tant que des
  // conflits ne sont pas résolus — sinon on committerait les marqueurs de conflit
  // (<<<<<<< / ======= / >>>>>>>) et on casserait le dépôt.
  const autoSaveOperation = await getInProgressOperation(cwd)
  if (autoSaveOperation !== 'none') {
    return { ok: true, committed: false, reason: 'operation-in-progress' }
  }
  const autoSaveStatus = await runGit(['status', '--porcelain'], cwd)
  if (autoSaveStatus.ok && getConflictedFilesFromStatusOutput(autoSaveStatus.stdout, cwd).length > 0) {
    return { ok: true, committed: false, reason: 'conflicts-present' }
  }

  // Si filePath est null/vide → stage tout (utilisé après suppression/déplacement)
  if (!filePath) {
    const addResult = await runGit(['add', '-A'], cwd)
    if (!addResult.ok) return { ok: false, committed: false, reason: 'add-failed', error: addResult.stderr }
  } else {
    // Stage seulement ce fichier
    const relPath = path.relative(cwd, filePath)
    const addResult = await runGit(['add', '--', relPath], cwd)
    if (!addResult.ok) return { ok: false, committed: false, reason: 'add-failed', error: addResult.stderr }
  }

  // Vérifie s'il y a des changements à committer
  const diffResult = await runGit(['diff', '--cached', '--quiet'], cwd)
  if (diffResult.ok) {
    // Rien à committer — mais il peut y avoir des commits locaux en attente à pousser
    const { outgoing } = await getAheadBehind(cwd).catch(() => ({ outgoing: 0 }))
    if (outgoing === 0) return { ok: true, committed: false, pushed: false, reason: 'nothing-to-commit' }
    // Pousser les commits en attente
    const pushResult = await runGit(['push'], cwd)
    if (!pushResult.ok) {
      // Essayer de configurer l'upstream si nécessaire
      const branchName = await getCurrentBranch(cwd)
      if (branchName && /set-upstream|no upstream/i.test(pushResult.stderr + pushResult.stdout)) {
        const upstreamResult = await runGit(['push', '--set-upstream', 'origin', branchName], cwd)
        if (upstreamResult.ok) return { ok: true, committed: false, pushed: true }
      }
      return { ok: true, committed: false, pushed: false, pushError: pushResult.stderr || 'Push échoué' }
    }
    return { ok: true, committed: false, pushed: true }
  }

  const args = ['commit', '--no-gpg-sign', '-m', 'Enregistrement automatique']
  const name = (authorName ?? '').trim()
  const email = (authorEmail ?? '').trim()
  if (name) args.push(`--author=${name} <${email}>`)

  const commitResult = await runGit(args, cwd)
  if (!commitResult.ok) {
    if (/nothing to commit/i.test(commitResult.stdout + commitResult.stderr)) {
      return { ok: true, committed: false, pushed: false, reason: 'nothing-to-commit' }
    }
    return { ok: false, committed: false, pushed: false, reason: 'commit-failed', error: commitResult.stderr }
  }

  // Tenter le push après commit
  const hasOrigin = await hasRemoteNamed(cwd, 'origin')
  if (!hasOrigin) {
    return { ok: true, committed: true, pushed: false, reason: 'no-remote' }
  }

  const pushResult = await runGit(['push'], cwd)
  if (!pushResult.ok) {
    // Essayer de configurer l'upstream si nécessaire
    const branchName = await getCurrentBranch(cwd)
    if (branchName && /set-upstream|no upstream/i.test(pushResult.stderr + pushResult.stdout)) {
      const upstreamResult = await runGit(['push', '--set-upstream', 'origin', branchName], cwd)
      if (upstreamResult.ok) return { ok: true, committed: true, pushed: true }
    }
    return { ok: true, committed: true, pushed: false, pushError: pushResult.stderr || 'Push échoué' }
  }

  return { ok: true, committed: true, pushed: true }
})

ipcMain.handle('holo:read-repo-config', async () => {
  if (!currentRootPath) {
    return null
  }

  const configPath = path.join(currentRootPath, '.holo.json')
  const configStats = await fs.stat(configPath).catch(() => null)

  if (!configStats || !configStats.isFile()) {
    return null
  }

  try {
    const content = await fs.readFile(configPath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
})

ipcMain.handle('holo:read-space-config', async (_event, spacePath) => {
  const normalizedSpacePath = path.normalize(String(spacePath ?? ''))
  if (!isPathInsideAnyKnownRoot(normalizedSpacePath) && normalizedSpacePath !== path.normalize(normalizedSpacePath)) {
    throw new Error('Chemin non autorisé.')
  }
  if (!normalizedSpacePath) return null
  const configPath = path.join(normalizedSpacePath, '.holo.json')
  try {
    const content = await fs.readFile(configPath, 'utf8')
    return JSON.parse(content)
  } catch {
    return null
  }
})

ipcMain.handle('holo:write-space-config', async (_event, spacePath, config) => {
  const normalizedSpacePath = path.normalize(String(spacePath ?? ''))
  if (!isPathInsideAnyKnownRoot(normalizedSpacePath)) {
    throw new Error('Chemin non autorisé.')
  }
  const configPath = path.join(normalizedSpacePath, '.holo.json')
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  return { ok: true }
})

ipcMain.handle('holo:write-repo-config', async (_event, config) => {
  if (!currentRootPath) {
    throw new Error('Aucun dépôt ouvert.')
  }

  const configPath = path.join(currentRootPath, '.holo.json')
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')
  return { ok: true }
})

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

// Récupération récurrente en arrière-plan : fetch puis pull en avance rapide
// (fast-forward) UNIQUEMENT si c'est totalement sans risque, c.-à-d. :
//   - l'arbre de travail est propre (aucune édition locale non commitée), et
//   - aucun commit local en attente (pas de divergence).
// Dans tous les autres cas on ne touche à rien et on renvoie la raison, afin
// que le renderer affiche une bannière douce plutôt que de risquer un conflit.
ipcMain.handle('git:pull-if-safe', async () => {
  const cwd = currentRootPath
  if (!cwd) return { ok: true, pulled: false, reason: 'no-root', incoming: 0, outgoing: 0, changedFiles: [] }

  const isRepo = await isGitRepository(cwd)
  if (!isRepo) return { ok: true, pulled: false, reason: 'not-a-repo', incoming: 0, outgoing: 0, changedFiles: [] }

  const hasOrigin = await hasRemoteNamed(cwd, 'origin')
  if (!hasOrigin) return { ok: true, pulled: false, reason: 'no-remote', incoming: 0, outgoing: 0, changedFiles: [] }

  const fetchResult = await runGit(['fetch', '--all', '--prune'], cwd)
  if (!fetchResult.ok) {
    return { ok: false, pulled: false, reason: 'fetch-failed', error: fetchResult.stderr, incoming: 0, outgoing: 0, changedFiles: [] }
  }

  const { incoming, outgoing } = await getAheadBehind(cwd)

  // Liste des fichiers qui diffèrent entre l'état local et le distant.
  const diffResult = await runGit(['diff', '--name-only', 'HEAD', '@{upstream}'], cwd)
  const changedFiles = diffResult.ok
    ? diffResult.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((rel) => path.join(cwd, rel))
    : []

  if (incoming === 0) {
    return { ok: true, pulled: false, reason: 'up-to-date', incoming, outgoing, changedFiles: [] }
  }

  // Y a-t-il des modifications locales non commitées ? → pas sûr, on diffère.
  const statusResult = await runGit(['status', '--porcelain'], cwd)
  const hasLocalChanges = statusResult.ok
    && statusResult.stdout.split('\n').map((line) => line.trim()).filter(Boolean).length > 0
  if (hasLocalChanges) {
    return { ok: true, pulled: false, reason: 'dirty', incoming, outgoing, changedFiles }
  }

  // Commits locaux non poussés → divergence → un rebase pourrait créer un conflit.
  if (outgoing > 0) {
    return { ok: true, pulled: false, reason: 'diverged', incoming, outgoing, changedFiles }
  }

  // Cas sûr : avance rapide garantie sans conflit ni commit de merge.
  const ffResult = await runGit(['merge', '--ff-only', '@{upstream}'], cwd)
  if (!ffResult.ok) {
    return { ok: true, pulled: false, reason: 'ff-failed', incoming, outgoing, changedFiles }
  }

  return { ok: true, pulled: true, reason: 'pulled', incoming: 0, outgoing, changedFiles }
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

ipcMain.handle('git:resolve-conflict', async (_event, filePath, strategy) => {
  const cwd = ensureRootPath()
  await ensureGitRepository(cwd)

  const absoluteFilePath = String(filePath ?? '')
  assertPathInsideRoot(absoluteFilePath)

  const relativePath = path.relative(cwd, absoluteFilePath)

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Fichier de conflit invalide.')
  }

  // Sémantique côté utilisateur : 'ours' = « ma version », 'theirs' = « la version distante »,
  // 'both' = « garder les deux » (on retire les marqueurs en conservant les deux côtés).
  // Sémantique côté utilisateur : 'ours' = « ma version », 'theirs' = « la version distante »,
  // 'both' = « garder les deux » (on retire les marqueurs en conservant les deux côtés),
  // 'manual' = l'utilisateur a déjà édité le fichier à la main (on prend l'arbre tel quel).
  const normalizedStrategy = strategy === 'theirs' ? 'theirs'
    : strategy === 'both' ? 'both'
    : strategy === 'manual' ? 'manual'
    : 'ours'
  const wantMine = normalizedStrategy === 'ours'

  const operation = await getInProgressOperation(cwd)

  if (normalizedStrategy === 'both') {
    // Conserver les deux versions : on supprime uniquement les lignes de marqueurs
    // (<<<<<<< / ======= / >>>>>>>) à l'intérieur des blocs de conflit.
    let raw
    try {
      raw = await fs.readFile(absoluteFilePath, 'utf8')
    } catch {
      throw new Error('Impossible de lire le fichier en conflit.')
    }
    const merged = resolveKeepBothSides(raw)
    await fs.writeFile(absoluteFilePath, merged, 'utf8')
  } else if (normalizedStrategy === 'manual') {
    // Résolution manuelle : le renderer a déjà écrit le contenu final sur disque.
    // On refuse simplement de finaliser s'il reste des marqueurs de conflit non levés
    // (`<<<<<<<` / `>>>>>>>` ne sont jamais du markdown valide), pour ne pas committer
    // un fichier cassé.
    let raw
    try {
      raw = await fs.readFile(absoluteFilePath, 'utf8')
    } catch {
      throw new Error('Impossible de lire le fichier en conflit.')
    }
    if (/^<{7}/m.test(raw) || /^>{7}/m.test(raw)) {
      throw new Error('Des marqueurs de conflit (<<<<<<< / >>>>>>>) subsistent. Retirez-les avant de terminer la résolution.')
    }
  } else {
    // Pendant un `git pull --rebase`, git inverse --ours/--theirs :
    //   --ours  désigne la branche amont (le distant), --theirs notre commit rejoué.
    // Pendant un merge classique, c'est l'inverse habituel.
    const checkoutFlag = operation === 'rebase'
      ? (wantMine ? '--theirs' : '--ours')
      : (wantMine ? '--ours' : '--theirs')

    const checkoutResult = await runGit(['checkout', checkoutFlag, '--', relativePath], cwd)

    if (!checkoutResult.ok) {
      throw new Error(getGitErrorMessage(checkoutResult, 'Impossible de choisir cette version du fichier.'))
    }
  }

  const addResult = await runGit(['add', '--', relativePath], cwd)

  if (!addResult.ok) {
    throw new Error(getGitErrorMessage(addResult, 'Impossible de marquer le conflit comme résolu.'))
  }

  // Termine l'opération git en cours afin que HEAD avance et que le conflit disparaisse.
  let completed = false
  let stillConflicted = false
  let remainingConflicts = []

  if (operation === 'rebase') {
    const continueResult = await runGit(['-c', 'core.editor=true', 'rebase', '--continue'], cwd)

    if (continueResult.ok) {
      completed = true
    } else {
      // Soit d'autres fichiers restent en conflit, soit le commit suivant du rebase conflicte.
      const statusResult = await runGit(['status', '--porcelain'], cwd)
      remainingConflicts = statusResult.ok
        ? getConflictedFilesFromStatusOutput(statusResult.stdout, cwd)
        : []
      const operationAfter = await getInProgressOperation(cwd)

      if (operationAfter === 'rebase' && remainingConflicts.length > 0) {
        stillConflicted = true
      } else if (operationAfter === 'rebase') {
        // Rebase encore en cours mais sans conflit résiduel : nouvel essai.
        const retryResult = await runGit(['-c', 'core.editor=true', 'rebase', '--continue'], cwd)
        if (!retryResult.ok) {
          throw new Error(getGitErrorMessage(retryResult, 'Impossible de terminer le rebase après résolution.'))
        }
        completed = true
      } else {
        throw new Error(getGitErrorMessage(continueResult, 'Impossible de terminer le rebase après résolution.'))
      }
    }
  } else if (operation === 'merge') {
    const commitResult = await runGit(['-c', 'core.editor=true', 'commit', '--no-edit'], cwd)
    if (!commitResult.ok) {
      throw new Error(getGitErrorMessage(commitResult, 'Impossible de finaliser la fusion après résolution.'))
    }
    completed = true
  } else {
    // Aucune opération en cours : le fichier était simplement marqué en conflit, désormais stagé.
    completed = true
  }

  // Relit le contenu résolu pour que le renderer recharge l'éditeur.
  let content = null
  try {
    content = await fs.readFile(absoluteFilePath, 'utf8')
  } catch {
    content = null
  }

  // Pousse le résultat si tout est résolu et qu'il reste des commits locaux.
  let pushed = false
  let pushError = null

  if (completed && !stillConflicted) {
    const { outgoing } = await getAheadBehind(cwd)
    if (outgoing > 0) {
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
        pushError = getGitErrorMessage(pushResult, 'Le push a échoué après résolution.')
      }
    }
  }

  return {
    ok: true,
    filePath: absoluteFilePath,
    strategy: normalizedStrategy,
    operation,
    completed,
    stillConflicted,
    conflictedFiles: remainingConflicts,
    content,
    pushed,
    pushError,
  }
})

ipcMain.handle('fs:save-image', async (_event, name, dataBase64, storageOptions) => {
  if (!currentRootPath) throw new Error('Aucun dossier ouvert.')

  const ext = path.extname(name) || '.png'
  const base = path.basename(name, ext).replace(/[^a-z0-9_-]/gi, '_')

  // Generate hash from file content to avoid duplicates
  const hash = crypto.createHash('sha256').update(dataBase64).digest('hex').substring(0, 8)
  const uniqueName = `${base}-${hash}${ext}`

  const buffer = Buffer.from(dataBase64, 'base64')
  const storageMode = storageOptions?.mode === 'azure'
    ? 'azure'
    : storageOptions?.mode === 's3'
      ? 's3'
      : storageOptions?.mode === 'dropbox'
        ? 'dropbox'
        : storageOptions?.mode === 'gdrive'
          ? 'gdrive'
          : 'local'

  if (storageMode === 'azure') {
    const uploadedUrl = await uploadImageToAzureBlob({
      containerUrl: storageOptions?.azure?.containerUrl,
      sasToken: storageOptions?.azure?.sasToken,
      blobName: uniqueName,
      buffer,
      mimeType: getImageMimeTypeFromExtension(ext),
    })

    return {
      ok: true,
      relativePath: uploadedUrl,
      absolutePath: uploadedUrl,
    }
  }

  if (storageMode === 's3') {
    const uploadedUrl = await uploadImageToS3({
      region: storageOptions?.s3?.region,
      bucket: storageOptions?.s3?.bucket,
      accessKeyId: storageOptions?.s3?.accessKeyId,
      secretAccessKey: storageOptions?.s3?.secretAccessKey,
      endpoint: storageOptions?.s3?.endpoint,
      key: uniqueName,
      buffer,
      mimeType: getImageMimeTypeFromExtension(ext),
      publicBaseUrl: storageOptions?.s3?.publicBaseUrl,
    })

    return {
      ok: true,
      relativePath: uploadedUrl,
      absolutePath: uploadedUrl,
    }
  }

  if (storageMode === 'dropbox') {
    const uploadedUrl = await uploadImageToDropbox({
      accessToken: storageOptions?.dropbox?.accessToken,
      folderPath: storageOptions?.dropbox?.folderPath,
      fileName: uniqueName,
      buffer,
    })

    return {
      ok: true,
      relativePath: uploadedUrl,
      absolutePath: uploadedUrl,
    }
  }

  if (storageMode === 'gdrive') {
    const uploadedUrl = await uploadImageToGoogleDrive({
      accessToken: storageOptions?.gdrive?.accessToken,
      folderId: storageOptions?.gdrive?.folderId,
      fileName: uniqueName,
      buffer,
      mimeType: getImageMimeTypeFromExtension(ext),
    })

    return {
      ok: true,
      relativePath: uploadedUrl,
      absolutePath: uploadedUrl,
    }
  }

  const imagesDir = path.join(currentRootPath, 'images')
  await fs.mkdir(imagesDir, { recursive: true })
  const destPath = path.join(imagesDir, uniqueName)
  await fs.writeFile(destPath, buffer)

  // Stage l'image dans git pour qu'elle soit incluse dans le prochain commit
  // auto-save du document (le commit auto-save commite tout l'index).
  try {
    if (await isGitRepository(currentRootPath)) {
      await runGit(['add', '--', path.relative(currentRootPath, destPath)], currentRootPath)
    }
  } catch (err) {
    console.error('[main] fs:save-image git add', err)
  }

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

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)

  // Pré-charger tous les espaces récents dans knownRootPaths (pour la lecture cross-espace)
  getRecentFolders().then(folders => { for (const f of folders) knownRootPaths.add(f) }).catch(() => { })

  try {
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient('holo')
    } else {
      const entryArg = process.argv[1] ? path.resolve(process.argv[1]) : path.join(__dirname, 'main.js')
      app.setAsDefaultProtocolClient('holo', process.execPath, [entryArg])
    }
  } catch {
    // Ignore protocol registration errors in restricted environments
  }

  createWindow(await getLaunchPayloadFromArgv(process.argv))

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
