// Transport de l'édition en temps réel : le processus principal parle au
// relais Codenotch (projet holo-realtime) pour le compte des fenêtres.
// Le renderer garde le document Yjs ; ici on ne manipule que des updates
// encodés en base64, sans les interpréter.
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { logDiagnostic } from './diagnostics.js'

const CONFIG_URL_KEY = 'realtime-server-url'
const CONFIG_TOKEN_KEY = 'realtime-token'
const CONFIG_ENABLED_KEY = 'realtime-enabled'
// Espace de noms des identifiants de document (UUID v5)
const DOCUMENT_NAMESPACE = '6f1c8a52-3d7e-4b9a-9e2f-5c4d8b7a1e03'
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 20000]

function uuidV5(name, namespace) {
  const namespaceBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = crypto.createHash('sha1').update(namespaceBytes).update(String(name), 'utf8').digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** URL de base du projet : on accepte aussi l'adresse de l'API (…/api). */
export function normalizeRealtimeBaseUrl(rawUrl) {
  const value = String(rawUrl ?? '').trim().replace(/\/+$/, '').replace(/\/api$/i, '')
  if (!value) return ''
  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('L\'adresse du relais doit commencer par http:// ou https://.')
  return value
}

/** Lit un flux SSE et appelle `onEvent(type, data)` pour chaque évènement. */
async function readEventStream(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let separator = buffer.indexOf('\n\n')
    while (separator !== -1) {
      const rawEvent = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      let type = 'message'
      const dataLines = []
      for (const line of rawEvent.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
      }
      if (dataLines.length > 0) {
        let data = dataLines.join('\n')
        try { data = JSON.parse(data) } catch { /* texte brut */ }
        onEvent(type, data)
      }
      separator = buffer.indexOf('\n\n')
    }
  }
}

export function registerRealtimeIpc({
  ipcMain,
  net,
  getConfigValue,
  setConfigValue,
  encryptSecret,
  decryptSecret,
  findOwningRoot,
  getPrimaryRemoteWebUrl,
  getUpstreamFileContent,
  getRootCommits,
  getDataDir,
  writeFileAtomic,
}) {
  // État Yjs de chaque document sur ce poste (époque + état encodé), pour
  // rejoindre une session sans rien dupliquer ni perdre après une fermeture
  // ou un plantage. Les identifiants de documents sont des UUID (noms sûrs).
  const cacheFile = (documentId) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(documentId))) throw new Error('Identifiant de document invalide.')
    return path.join(getDataDir(), 'realtime-cache', `${String(documentId).toLowerCase()}.json`)
  }
  ipcMain.handle('realtime:save-local-state', async (_event, documentId, payload) => {
    const file = cacheFile(documentId)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await writeFileAtomic(file, JSON.stringify({ epoch: payload?.epoch ?? null, state: String(payload?.state ?? ''), savedAt: Date.now() }))
    return { ok: true }
  })
  ipcMain.handle('realtime:load-local-state', async (_event, documentId) => {
    try {
      const parsed = JSON.parse(await fs.readFile(cacheFile(documentId), 'utf8'))
      return typeof parsed?.state === 'string' ? { epoch: parsed.epoch ?? null, state: parsed.state, savedAt: Number(parsed.savedAt ?? 0) } : null
    } catch {
      return null
    }
  })

  // documentId → { subscribers: Set<WebContents>, abort: AbortController | null, attempt, timer, stopped }
  const streams = new Map()

  async function readConfig() {
    const [url, token, enabled] = await Promise.all([
      getConfigValue(CONFIG_URL_KEY),
      getConfigValue(CONFIG_TOKEN_KEY),
      getConfigValue(CONFIG_ENABLED_KEY),
    ])
    return {
      url: typeof url === 'string' ? url : '',
      token: typeof token === 'string' ? await decryptSecret(token) : '',
      enabled: enabled === true,
    }
  }

  async function request(method, apiPath, body, configOverride) {
    const config = configOverride ?? await readConfig()
    if (!config.enabled || !config.url) throw Object.assign(new Error('Temps réel désactivé.'), { code: 'DISABLED' })
    const response = await net.fetch(`${config.url}/api${apiPath}`, {
      method,
      headers: {
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = { error: text } }
    if (!response.ok) {
      const error = new Error(payload?.error ?? `Le relais a répondu ${response.status}.`)
      error.status = response.status
      error.code = payload?.code
      logDiagnostic('warn', 'realtime', `${method} ${apiPath.replace(/[0-9a-f-]{36}/, (id) => id.slice(0, 8))} → ${response.status}`, error.message)
      throw error
    }
    return payload
  }

  function broadcast(documentId, type, data) {
    const entry = streams.get(documentId)
    if (!entry) return
    for (const webContents of entry.subscribers) {
      if (webContents.isDestroyed()) {
        entry.subscribers.delete(webContents)
        continue
      }
      webContents.send('realtime:event', { documentId, type, data })
    }
  }

  async function runStream(documentId) {
    const entry = streams.get(documentId)
    if (!entry || entry.stopped) return
    const config = await readConfig().catch(() => null)
    if (!config?.enabled || !config.url) {
      broadcast(documentId, 'status', { state: 'disabled' })
      return
    }
    const abort = new AbortController()
    entry.abort = abort
    let fatal = false
    try {
      const response = await net.fetch(`${config.url}/api/docs/${documentId}/stream`, {
        headers: {
          Accept: 'text/event-stream',
          ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
        },
        signal: abort.signal,
      })
      if (response.status === 401 || response.status === 403) {
        fatal = true
        logDiagnostic('error', 'realtime', `Canal ${documentId.slice(0, 8)} refusé par le relais (${response.status})`)
        broadcast(documentId, 'status', { state: 'unauthorized', status: response.status })
        return
      }
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
      await readEventStream(response.body, (type, data) => {
        if (type === 'ready') {
          if (entry.attempt > 0) logDiagnostic('info', 'realtime', `Canal ${documentId.slice(0, 8)} reconnecté après ${entry.attempt} tentative(s)`)
          entry.attempt = 0
          broadcast(documentId, 'status', { state: 'connected' })
          broadcast(documentId, 'ready', data)
        } else if (type === 'signal' && data && typeof data === 'object') {
          const kind = String(data.ref ?? '').endsWith('.awareness') ? 'awareness' : 'update'
          broadcast(documentId, kind, data.payload)
        }
      })
    } catch (error) {
      if (abort.signal.aborted) return
      logDiagnostic('warn', 'realtime', `Canal ${documentId.slice(0, 8)} interrompu (tentative ${entry.attempt + 1}) :`, error instanceof Error ? error.message : String(error))
      broadcast(documentId, 'status', { state: 'reconnecting', error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (entry.abort === abort) entry.abort = null
    }
    if (fatal || entry.stopped || entry.subscribers.size === 0) return
    // Fin de flux (fermeture horaire, coupure réseau) : reconnexion avec délai croissant.
    broadcast(documentId, 'status', { state: 'reconnecting' })
    const delay = RECONNECT_DELAYS_MS[Math.min(entry.attempt, RECONNECT_DELAYS_MS.length - 1)]
    entry.attempt += 1
    entry.timer = setTimeout(() => { entry.timer = null; void runStream(documentId) }, delay)
  }

  function unsubscribe(documentId, webContents) {
    const entry = streams.get(documentId)
    if (!entry) return
    entry.subscribers.delete(webContents)
    if (entry.subscribers.size > 0) return
    entry.stopped = true
    entry.abort?.abort()
    if (entry.timer) clearTimeout(entry.timer)
    streams.delete(documentId)
  }

  const cleanupRegistered = new Set()

  ipcMain.handle('realtime:get-config', async () => {
    const config = await readConfig()
    return { url: config.url, enabled: config.enabled, hasToken: Boolean(config.token) }
  })

  ipcMain.handle('realtime:set-config', async (_event, next) => {
    const url = normalizeRealtimeBaseUrl(next?.url)
    await setConfigValue(CONFIG_URL_KEY, url || null)
    await setConfigValue(CONFIG_ENABLED_KEY, Boolean(next?.enabled && url))
    // Jeton : absent = inchangé, chaîne vide = supprimé.
    if (typeof next?.token === 'string') {
      await setConfigValue(CONFIG_TOKEN_KEY, next.token ? await encryptSecret(next.token) : null)
    }
    // Les flux ouverts repartent avec la nouvelle configuration.
    for (const [documentId, entry] of streams) {
      entry.abort?.abort()
      if (entry.timer) clearTimeout(entry.timer)
      entry.attempt = 0
      void runStream(documentId)
    }
    return { ok: true }
  })

  // Teste une configuration avant de l'enregistrer (jeton vide = jeton enregistré).
  ipcMain.handle('realtime:test-connection', async (_event, candidate) => {
    try {
      const stored = await readConfig()
      const config = candidate
        ? { url: normalizeRealtimeBaseUrl(candidate.url), token: candidate.token || stored.token, enabled: true }
        : stored
      await request('GET', `/docs/${uuidV5('connection-test', DOCUMENT_NAMESPACE)}/state`, undefined, config)
      return { ok: true }
    } catch (error) {
      return { ok: false, status: error.status ?? null, error: error.message }
    }
  })

  // Clé du dépôt : dérivée de son URL et de son premier commit, que seuls ceux
  // qui ont un clone connaissent. Elle chiffre le contenu (le relais ne voit
  // que du chiffré) et rend les identifiants de documents indevinables : avoir
  // accès au dépôt suffit, aucun jeton n'est nécessaire.
  async function deriveRepositoryKey(root) {
    const config = await readConfig()
    if (!config.enabled || !config.url) return { reason: 'disabled' }
    const workspace = await getPrimaryRemoteWebUrl(root).catch(() => null)
    if (!workspace) return { reason: 'no-remote' }
    const rootCommits = await getRootCommits(root).catch(() => [])
    if (rootCommits.length === 0) return { reason: 'no-history' }
    const normalizedWorkspace = workspace.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '')
    const key = crypto.createHmac('sha256', 'holo-realtime/v1/key')
      .update(`${normalizedWorkspace}\n${[...rootCommits].sort().join(',')}`)
      .digest()
    return { key, workspace }
  }

  function channelId(key, label) {
    const idBytes = crypto.createHmac('sha256', key).update(label).digest().subarray(0, 16)
    idBytes[6] = (idBytes[6] & 0x0f) | 0x50
    idBytes[8] = (idBytes[8] & 0x3f) | 0x80
    const hex = Buffer.from(idBytes).toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  ipcMain.handle('realtime:resolve-document', async (_event, filePath) => {
    const root = findOwningRoot(filePath)
    if (!root) return { available: false, reason: 'no-space' }
    const derived = await deriveRepositoryKey(root)
    if (!derived.key) return { available: false, reason: derived.reason }
    const relativePath = path.relative(root, filePath).split(path.sep).join('/')
    return {
      available: true,
      // « document-v2 » : modèle partagé par blocs (0.9). Les postes en 0.8
      // (un seul texte) ont d'autres identifiants : leurs sessions ne se mélangent pas.
      documentId: channelId(derived.key, `document-v2\n${relativePath}`),
      key: derived.key.toString('base64'),
      workspace: derived.workspace,
      path: relativePath,
    }
  })

  // Canal de présence d'un espace : qui a quel document ouvert, et signal
  // « je viens d'envoyer des modifications » pour que les autres récupèrent
  // sans attendre la synchronisation périodique.
  ipcMain.handle('realtime:resolve-space', async (_event, rootPath) => {
    const root = findOwningRoot(rootPath)
    if (!root) return { available: false, reason: 'no-space' }
    const derived = await deriveRepositoryKey(root)
    if (!derived.key) return { available: false, reason: derived.reason }
    return { available: true, documentId: channelId(derived.key, 'space'), key: derived.key.toString('base64'), workspace: derived.workspace, path: '' }
  })

  ipcMain.handle('realtime:subscribe', async (event, documentId) => {
    const webContents = event.sender
    let entry = streams.get(documentId)
    if (!entry) {
      entry = { subscribers: new Set(), abort: null, attempt: 0, timer: null, stopped: false }
      streams.set(documentId, entry)
    }
    const isNew = entry.subscribers.size === 0
    entry.subscribers.add(webContents)
    if (!cleanupRegistered.has(webContents.id)) {
      cleanupRegistered.add(webContents.id)
      webContents.once('destroyed', () => {
        cleanupRegistered.delete(webContents.id)
        for (const id of Array.from(streams.keys())) unsubscribe(id, webContents)
      })
    }
    if (isNew) void runStream(documentId)
    return { ok: true }
  })

  ipcMain.handle('realtime:unsubscribe', async (event, documentId) => {
    unsubscribe(documentId, event.sender)
    return { ok: true }
  })

  ipcMain.handle('realtime:get-state', async (_event, documentId) => request('GET', `/docs/${documentId}/state`))

  ipcMain.handle('realtime:get-upstream-content', async (_event, filePath) => getUpstreamFileContent(filePath))

  ipcMain.handle('realtime:push-update', async (_event, documentId, payload) =>
    request('POST', `/docs/${documentId}/updates`, payload))

  ipcMain.handle('realtime:push-awareness', async (_event, documentId, payload) =>
    request('POST', `/docs/${documentId}/awareness`, payload))

  ipcMain.handle('realtime:compact', async (_event, documentId, payload) => {
    try {
      return { ok: true, ...(await request('PUT', `/docs/${documentId}/state`, payload)) }
    } catch (error) {
      if (error.status === 409) return { ok: false, conflict: true }
      throw error
    }
  })
}
