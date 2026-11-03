// Accès disque robuste face aux dossiers synchronisés (OneDrive, Dropbox…) et
// aux instances multiples : écritures atomiques, réessais sur verrous
// transitoires et sérialisation des opérations par clé.
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

// Codes renvoyés quand un autre processus (OneDrive, antivirus, indexeur)
// tient brièvement le fichier ouvert, surtout sous Windows.
const TRANSIENT_FS_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE', 'UNKNOWN'])
const RETRY_DELAYS_MS = [40, 80, 160, 320, 640, 1000]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function withFsRetry(task) {
  let lastError
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!TRANSIENT_FS_CODES.has(error?.code) || attempt === RETRY_DELAYS_MS.length) throw error
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
  throw lastError
}

export async function readFileWithRetry(filePath) {
  return withFsRetry(() => fs.readFile(filePath, 'utf8'))
}

export async function readFileIfExists(filePath) {
  try {
    return await readFileWithRetry(filePath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

/**
 * Écrit `content` dans un fichier temporaire voisin puis le renomme sur la
 * cible : un lecteur (autre instance, OneDrive, git) ne voit jamais un
 * fichier tronqué ou à moitié écrit.
 */
export async function writeFileAtomic(filePath, content) {
  const directory = path.dirname(filePath)
  await fs.mkdir(directory, { recursive: true })
  // Le renommage passerait outre un fichier en lecture seule : on respecte
  // explicitement cette protection.
  try {
    await fs.access(filePath, fsConstants.W_OK)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.holo-tmp`,
  )
  await withFsRetry(() => fs.writeFile(tempPath, content, 'utf8'))
  try {
    await withFsRetry(() => fs.rename(tempPath, filePath))
  } catch (renameError) {
    // Certains montages refusent le rename par-dessus un fichier existant :
    // on retombe sur une écriture directe plutôt que de perdre la sauvegarde.
    try {
      await withFsRetry(() => fs.writeFile(filePath, content, 'utf8'))
    } catch {
      await fs.rm(tempPath, { force: true }).catch(() => {})
      throw renameError
    }
    await fs.rm(tempPath, { force: true }).catch(() => {})
  }
}

/** Supprime les fichiers temporaires laissés par une écriture interrompue. */
export async function cleanupStaleTempFiles(directory, maxAgeMs = 60_000) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
  const now = Date.now()
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.holo-tmp'))
    .map(async (entry) => {
      const fullPath = path.join(directory, entry.name)
      const stats = await fs.stat(fullPath).catch(() => null)
      if (stats && now - stats.mtimeMs > maxAgeMs) await fs.rm(fullPath, { force: true }).catch(() => {})
    }))
}

/**
 * Sérialise les tâches partageant une même clé (ex. un dépôt git) : une tâche
 * ne démarre qu'après la fin — réussie ou non — de la précédente.
 */
export function createKeyedLock() {
  const chains = new Map()
  return function withKeyLock(key, task) {
    const previous = chains.get(key) ?? Promise.resolve()
    const result = previous.then(task, task)
    const settled = result.then(() => undefined, () => undefined)
    chains.set(key, settled)
    settled.then(() => {
      if (chains.get(key) === settled) chains.delete(key)
    })
    return result
  }
}
