/**
 * Relais simulé en mémoire pour les tests de session temps réel : reproduit le
 * contrat du projet holo-realtime (versions, époques, journal, diffusion à
 * tous les abonnés émetteur compris), avec messages retardés et désordonnés,
 * coupures et reconnexions. L'état local gardé par chaque poste (pour
 * rejoindre après un plantage) survit à la connexion : il est rangé par poste.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// ─── Aléatoire reproductible ──────────────────────────────────────────────────
export function createRandom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(items: T[]) => items[Math.floor(next() * items.length)],
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Fusion 3 voies réelle (git merge-file --union), comme le processus principal à la jonction. */
export async function mergeText(base: string, ours: string, theirs: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-merge-test-'))
  try {
    await Promise.all([
      fs.writeFile(path.join(dir, 'ours'), ours),
      fs.writeFile(path.join(dir, 'base'), base),
      fs.writeFile(path.join(dir, 'theirs'), theirs),
    ])
    try {
      const { stdout } = await execFileAsync('git', ['merge-file', '-p', '--union', 'ours', 'base', 'theirs'], { cwd: dir })
      return stdout
    } catch (error) {
      return (error as { stdout?: string }).stdout ?? ours
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

// ─── Faux relais ──────────────────────────────────────────────────────────────
export type StoredDoc = { state: string | null; version: number; epoch: string; updates: { id: string; update: string }[] }

export class FakeRelay {
  docs = new Map<string, StoredDoc>()
  clients = new Set<FakeConnection>()
  /** État local gardé par chaque poste (par nom de poste), comme le fichier de cache sur disque */
  localStates = new Map<string, Map<string, { epoch: string | null; state: string; savedAt: number }>>()
  private counter = 0
  readonly random: ReturnType<typeof createRandom>
  maxLatencyMs: number

  constructor(seed: number, maxLatencyMs = 25) {
    this.random = createRandom(seed)
    this.maxLatencyMs = maxLatencyMs
  }

  id(prefix: string) {
    this.counter += 1
    return `${prefix}-${this.counter}`
  }

  connect(name: string) {
    const connection = new FakeConnection(this, name)
    this.clients.add(connection)
    return connection
  }

  /** Diffusion à tous les abonnés connectés, avec un délai aléatoire (ordre non garanti). */
  broadcast(documentId: string, event: HoloRealtimeEvent) {
    for (const client of this.clients) {
      if (!client.connected || !client.subscriptions.has(documentId)) continue
      const delay = this.random.int(this.maxLatencyMs + 1)
      setTimeout(() => client.deliver(event), delay)
    }
  }

  pendingUpdateCount(documentId: string) {
    return this.docs.get(documentId)?.updates.length ?? 0
  }
}

export class FakeConnection implements HoloRealtimeApi {
  connected = true
  subscriptions = new Set<string>()
  private listeners = new Set<(event: HoloRealtimeEvent) => void>()
  private readonly relay: FakeRelay
  readonly name: string

  constructor(relay: FakeRelay, name: string) {
    this.relay = relay
    this.name = name
  }

  deliver(event: HoloRealtimeEvent) {
    if (!this.connected) return
    for (const listener of this.listeners) listener(event)
  }

  private async network<T>(task: () => T): Promise<T> {
    await sleep(this.relay.random.int(this.relay.maxLatencyMs + 1))
    if (!this.connected) throw new Error('réseau coupé')
    return task()
  }

  /** Coupure : plus aucun message ni appel ne passe. */
  disconnect() {
    this.connected = false
  }

  /** Plantage du poste : plus rien ne passe et plus rien n'est enregistré localement. */
  crash() {
    this.connected = false
    this.crashed = true
    this.relay.clients.delete(this)
  }

  crashed = false

  /** Reconnexion : chaque flux suivi renvoie `ready`, comme le vrai relais. */
  reconnect() {
    this.connected = true
    for (const documentId of this.subscriptions) {
      setTimeout(() => this.deliver({ documentId, type: 'ready', data: {} }), this.relay.random.int(this.relay.maxLatencyMs + 1))
    }
  }

  getConfig = async () => ({ url: 'fake', enabled: true, hasToken: true })
  setConfig = async () => ({ ok: true as const })
  testConnection = async () => ({ ok: true })
  resolveDocument = async () => ({ available: false as const, reason: 'disabled' as const })
  getUpstreamContent = async () => null
  mergeText = mergeText

  subscribe = async (documentId: string) => {
    this.subscriptions.add(documentId)
    if (this.connected) setTimeout(() => this.deliver({ documentId, type: 'ready', data: {} }), this.relay.random.int(this.relay.maxLatencyMs + 1))
    return { ok: true as const }
  }

  unsubscribe = async (documentId: string) => {
    this.subscriptions.delete(documentId)
    return { ok: true as const }
  }

  getState = (documentId: string) => this.network(() => {
    const doc = this.relay.docs.get(documentId)
    if (!doc) return { state: null, version: 0, epoch: null, updates: [] }
    return { state: doc.state, version: doc.version, epoch: doc.epoch, updates: doc.updates.map((entry) => ({ ...entry })) }
  })

  pushUpdate = (documentId: string, payload: { update: string; clientId: string }) => this.network(() => {
    let doc = this.relay.docs.get(documentId)
    if (!doc) {
      doc = { state: null, version: 1, epoch: this.relay.id('epoch'), updates: [] }
      this.relay.docs.set(documentId, doc)
    }
    const id = this.relay.id('update')
    doc.updates.push({ id, update: payload.update })
    this.relay.broadcast(documentId, { documentId, type: 'update', data: { u: payload.update, c: payload.clientId, i: id } })
    return { id }
  })

  pushAwareness = (documentId: string, payload: { awareness: string; clientId: string }) => this.network(() => {
    this.relay.broadcast(documentId, { documentId, type: 'awareness', data: { a: payload.awareness, c: payload.clientId } })
    return { ok: true as const }
  })

  compact = (documentId: string, payload: { state: string; expectedVersion: number; mergedUpdateIds?: string[]; reset?: boolean }) => this.network(() => {
    const doc = this.relay.docs.get(documentId)
    if (!doc) {
      if (!payload.reset) throw Object.assign(new Error('inconnu'), { status: 404 })
      const created = { state: payload.state, version: 1, epoch: this.relay.id('epoch'), updates: [] }
      this.relay.docs.set(documentId, created)
      return { ok: true as const, version: created.version, epoch: created.epoch }
    }
    if (doc.version !== payload.expectedVersion) return { ok: false as const, conflict: true as const }
    doc.version += 1
    doc.state = payload.state
    if (payload.reset) {
      doc.epoch = this.relay.id('epoch')
      doc.updates = []
    } else {
      const merged = new Set(payload.mergedUpdateIds ?? [])
      doc.updates = doc.updates.filter((entry) => !merged.has(entry.id))
    }
    return { ok: true as const, version: doc.version, epoch: doc.epoch }
  })

  saveLocalState = async (documentId: string, payload: { epoch: string | null; state: string }) => {
    if (this.crashed) return { ok: true as const }
    const machine = this.relay.localStates.get(this.name) ?? new Map()
    machine.set(documentId, { ...payload, savedAt: Date.now() })
    this.relay.localStates.set(this.name, machine)
    return { ok: true as const }
  }

  loadLocalState = async (documentId: string) => this.relay.localStates.get(this.name)?.get(documentId) ?? null

  onEvent = (callback: (event: HoloRealtimeEvent) => void) => {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

export async function waitFor(predicate: () => boolean, timeoutMs = 15_000, label = 'condition') {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`)
    await sleep(20)
  }
}
