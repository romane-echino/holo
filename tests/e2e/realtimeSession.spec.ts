/**
 * realtimeSession.spec.ts — Tests de résistance de la session temps réel
 *
 * La logique de RealtimeSession (Yjs, jonction, resynchronisation, époques,
 * compaction) est exercée contre un faux relais en mémoire qui reproduit le
 * contrat du projet holo-realtime : versions, époques, journal, diffusion
 * à tous les abonnés (émetteur compris), messages retardés et désordonnés
 * (le relais ne garantit pas l'ordre), coupures et reconnexions.
 *
 * Les éditeurs sont simulés : un texte que l'on modifie au hasard. Chaque
 * scénario est déterministe (graine fixe) pour pouvoir rejouer un échec.
 */
import { test, expect } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import * as Y from 'yjs'
import { RealtimeSession } from '../../src/lib/realtime/session'
import { PayloadCipher, singleSpliceDiff } from '../../src/lib/realtime/encoding'

const execFileAsync = promisify(execFile)

// ─── Aléatoire reproductible ──────────────────────────────────────────────────
function createRandom(seed: number) {
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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Fusion 3 voies réelle (git merge-file --union), comme le processus principal à la jonction. */
async function mergeText(base: string, ours: string, theirs: string): Promise<string> {
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
type StoredDoc = { state: string | null; version: number; epoch: string; updates: { id: string; update: string }[] }

class FakeRelay {
  docs = new Map<string, StoredDoc>()
  clients = new Set<FakeConnection>()
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

class FakeConnection implements HoloRealtimeApi {
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

  onEvent = (callback: (event: HoloRealtimeEvent) => void) => {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

// ─── Éditeur simulé ───────────────────────────────────────────────────────────
const DOCUMENT_ID = '00000000-0000-5000-8000-000000000001'
// Clé du dépôt partagée par les participants (chiffrement de bout en bout)
const REPOSITORY_KEY = Buffer.alloc(32, 7).toString('base64')

class SimulatedEditor {
  text: string
  upstream: string | null
  status: string | null = null
  peers = 0
  readonly connection: FakeConnection
  readonly session: RealtimeSession
  readonly name: string

  constructor(relay: FakeRelay, name: string, initialText: string, upstream: string | null = initialText, key: string = REPOSITORY_KEY) {
    this.name = name
    this.text = initialText
    this.upstream = upstream
    this.connection = relay.connect(name)
    this.session = new RealtimeSession(
      this.connection,
      { documentId: DOCUMENT_ID, key },
      { name, email: `${name}@example.com`, color: '#888' },
      {
        getEditorMarkdown: () => this.text,
        applyRemoteMarkdown: (markdown) => { this.text = markdown },
        flushLocalEdits: async () => {},
        getUpstreamMarkdown: async () => this.upstream,
        mergeText: (base, ours, theirs) => this.connection.mergeText(base, ours, theirs),
        onPeers: (peers) => { this.peers = peers.length },
        onStatus: (status) => { this.status = status },
      },
    )
  }

  start() {
    return this.session.start()
  }

  /** Une saisie : le texte change puis l'éditeur émet le markdown complet. */
  type(nextText: string) {
    this.text = nextText
    this.session.onLocalMarkdown(nextText)
  }

  insertAt(index: number, token: string) {
    this.type(this.text.slice(0, index) + token + this.text.slice(index))
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 15_000, label = 'condition') {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Délai dépassé : ${label}`)
    await sleep(20)
  }
}

async function waitLive(editors: SimulatedEditor[]) {
  await waitFor(() => editors.every((editor) => editor.status === 'live'), 15_000, 'sessions en direct')
}

/** Tous les éditeurs ont le même texte, et il ne bouge plus. */
async function waitConverged(editors: SimulatedEditor[], timeoutMs = 20_000) {
  let stableSince = 0
  let previous = ''
  await waitFor(() => {
    const texts = editors.map((editor) => editor.text)
    const same = texts.every((text) => text === texts[0])
    if (!same) { stableSince = 0; return false }
    if (texts[0] !== previous) { previous = texts[0]; stableSince = Date.now(); return false }
    return Date.now() - stableSince > 400
  }, timeoutMs, `convergence (${editors.map((editor) => JSON.stringify(editor.text.slice(0, 60))).join(' / ')})`)
  return editors[0].text
}

function countOccurrences(text: string, token: string) {
  return text.split(token).length - 1
}

/** Position d'insertion aléatoire hors des jetons déjà insérés (un jeton coupé ne serait plus reconnaissable). */
function randomBoundary(text: string, random: ReturnType<typeof createRandom>) {
  const inside = new Set<number>()
  for (const match of text.matchAll(/[[<][a-z]+\d+[\]>]/g)) {
    for (let index = match.index! + 1; index < match.index! + match[0].length; index += 1) inside.add(index)
  }
  const allowed: number[] = []
  for (let index = 0; index <= text.length; index += 1) if (!inside.has(index)) allowed.push(index)
  return random.pick(allowed)
}

test.describe.configure({ mode: 'serial' })

// ─── Diff ─────────────────────────────────────────────────────────────────────
test.describe('singleSpliceDiff', () => {
  test('appliquer la modification redonne exactement le texte cible (aléatoire)', () => {
    const random = createRandom(7)
    const alphabet = ['a', 'b', ' ', '\n', 'é', '😀', '|', '#']
    const randomText = () => Array.from({ length: random.int(30) }, () => random.pick(alphabet)).join('')
    for (let index = 0; index < 2000; index += 1) {
      const before = randomText()
      const after = randomText()
      const splice = singleSpliceDiff(before, after)
      if (before === after) {
        expect(splice).toBeNull()
        continue
      }
      const applied = before.slice(0, splice!.index) + splice!.insert + before.slice(splice!.index + splice!.remove)
      expect(applied).toBe(after)
      // Une paire de substitution (emoji) n'est jamais coupée.
      const cut = before.charCodeAt(splice!.index - 1)
      expect(cut >= 0xd800 && cut <= 0xdbff).toBe(false)
    }
  })
})

// ─── Session ──────────────────────────────────────────────────────────────────
test.describe('RealtimeSession contre un relais simulé', () => {
  test.setTimeout(90_000)

  test('trois participants tapent en rafale : convergence, rien de perdu ni dupliqué', async () => {
    const relay = new FakeRelay(11)
    const initial = 'Titre\n\nParagraphe commun.\n'
    const editors = ['alice', 'bob', 'carla'].map((name) => new SimulatedEditor(relay, name, initial))
    await editors[0].start()
    await waitLive([editors[0]])
    await Promise.all(editors.slice(1).map((editor) => editor.start()))
    await waitLive(editors)

    const random = createRandom(42)
    const tokens: string[] = []
    for (let step = 0; step < 150; step += 1) {
      const editor = random.pick(editors)
      const token = `[${editor.name}${step}]`
      tokens.push(token)
      editor.insertAt(randomBoundary(editor.text, random), token)
      if (random.next() < 0.3) await sleep(random.int(15))
    }

    const final = await waitConverged(editors)
    for (const token of tokens) expect(countOccurrences(final, token), token).toBe(1)
    await Promise.all(editors.map((editor) => editor.session.stop()))
  })

  test('saisies et suppressions concurrentes : tout le monde converge', async () => {
    const relay = new FakeRelay(23)
    const initial = 'Une ligne.\nDeux lignes.\nTrois lignes.\n'
    const editors = ['alice', 'bob', 'carla'].map((name) => new SimulatedEditor(relay, name, initial))
    await editors[0].start()
    await waitLive([editors[0]])
    await Promise.all(editors.slice(1).map((editor) => editor.start()))
    await waitLive(editors)

    const random = createRandom(5)
    for (let step = 0; step < 200; step += 1) {
      const editor = random.pick(editors)
      const text = editor.text
      // Un éditeur ne coupe jamais un caractère : on travaille par point de code (emoji = 1).
      const chars = Array.from(text)
      if (random.next() < 0.35 && chars.length > 5) {
        const start = random.int(chars.length - 1)
        editor.type([...chars.slice(0, start), ...chars.slice(start + 1 + random.int(4))].join(''))
      } else {
        const at = random.int(chars.length + 1)
        editor.type([...chars.slice(0, at), random.pick(['x', 'yz', ' ', '\n', 'é', '😀']), ...chars.slice(at)].join(''))
      }
      if (random.next() < 0.3) await sleep(random.int(15))
    }

    await waitConverged(editors)
    await Promise.all(editors.map((editor) => editor.session.stop()))
  })

  test('coupures réseau pendant la saisie : resynchronisation sans perte ni doublon', async () => {
    const relay = new FakeRelay(31)
    const initial = 'Document partagé.\n'
    const editors = ['alice', 'bob', 'carla'].map((name) => new SimulatedEditor(relay, name, initial))
    await editors[0].start()
    await waitLive([editors[0]])
    await Promise.all(editors.slice(1).map((editor) => editor.start()))
    await waitLive(editors)

    const random = createRandom(77)
    const tokens: string[] = []
    for (let step = 0; step < 160; step += 1) {
      const editor = random.pick(editors)
      // Un participant décroche puis revient, en continuant de taper hors ligne.
      if (random.next() < 0.06) {
        if (editor.connection.connected) editor.connection.disconnect()
        else editor.connection.reconnect()
      }
      const token = `<${editor.name}${step}>`
      tokens.push(token)
      editor.insertAt(randomBoundary(editor.text, random), token)
      if (random.next() < 0.3) await sleep(random.int(20))
    }
    for (const editor of editors) if (!editor.connection.connected) editor.connection.reconnect()

    const final = await waitConverged(editors, 30_000)
    for (const token of tokens) expect(countOccurrences(final, token), token).toBe(1)
    await Promise.all(editors.map((editor) => editor.session.stop()))
  })

  test('deux personnes ouvrent le document au même instant : pas de texte en double', async () => {
    const relay = new FakeRelay(53)
    const initial = 'Contenu du fichier git.\n\nSecond paragraphe.\n'
    const editors = ['alice', 'bob'].map((name) => new SimulatedEditor(relay, name, initial))
    await Promise.all(editors.map((editor) => editor.start()))
    await waitLive(editors)

    editors[0].insertAt(0, '[A]')
    editors[1].insertAt(editors[1].text.length, '[B]')
    const final = await waitConverged(editors)
    expect(countOccurrences(final, 'Contenu du fichier git.')).toBe(1)
    expect(final).toBe(`[A]${initial}[B]`)
    await Promise.all(editors.map((editor) => editor.session.stop()))
  })

  test('arrivée en cours de session : modifications faites hors session fusionnées, pas écrasées', async () => {
    const relay = new FakeRelay(61)
    const pushed = 'Ligne 1.\nLigne 2.\nLigne 3.\nLigne 4.\n'
    const alice = new SimulatedEditor(relay, 'alice', pushed)
    await alice.start()
    await waitLive([alice])
    alice.type(pushed.replace('Ligne 1.', 'Ligne 1 (Alice en session).'))

    // Bob a modifié la ligne 4 hors session (version poussée : `pushed`).
    const bob = new SimulatedEditor(relay, 'bob', pushed.replace('Ligne 4.', 'Ligne 4 (Bob hors ligne).'), pushed)
    await bob.start()
    await waitLive([alice, bob])

    const final = await waitConverged([alice, bob])
    expect(final).toContain('Ligne 1 (Alice en session).')
    expect(final).toContain('Ligne 4 (Bob hors ligne).')
    expect(countOccurrences(final, 'Ligne 2.')).toBe(1)
    await Promise.all([alice, bob].map((editor) => editor.session.stop()))
  })

  test('session redémarrée pendant qu un participant est hors ligne : il la rejoint sans doublon', async () => {
    const relay = new FakeRelay(71)
    const initial = 'Base commune.\n'
    const alice = new SimulatedEditor(relay, 'alice', initial)
    await alice.start()
    await waitLive([alice])
    alice.type('Base commune.\nAjout d Alice.\n')
    await sleep(300)

    // Alice décroche et continue de taper hors ligne.
    alice.connection.disconnect()
    alice.type('Base commune.\nAjout d Alice.\nHors ligne.\n')

    // Bob arrive seul : il redémarre la session depuis son fichier (git).
    const bobFile = 'Base commune.\nAjout d Alice.\n'
    const bob = new SimulatedEditor(relay, 'bob', bobFile, initial)
    await bob.start()
    await waitLive([bob])
    bob.type(bobFile + 'Ajout de Bob.\n')
    await sleep(200)

    // Retour d'Alice : nouvelle époque, elle rejoint la session de Bob.
    alice.upstream = initial
    alice.connection.reconnect()
    const final = await waitConverged([alice, bob], 30_000)
    expect(countOccurrences(final, 'Base commune.')).toBe(1)
    expect(countOccurrences(final, 'Ajout d Alice.')).toBe(1)
    expect(countOccurrences(final, 'Ajout de Bob.')).toBe(1)
    expect(countOccurrences(final, 'Hors ligne.')).toBe(1)
    await Promise.all([alice, bob].map((editor) => editor.session.stop()))
  })

  test('journal volumineux : compaction à l arrivée, état correct pour les suivants', async () => {
    const relay = new FakeRelay(83, 5)
    const alice = new SimulatedEditor(relay, 'alice', '')
    await alice.start()
    await waitLive([alice])
    // Longue session : 260 modifications distinctes journalisées par le relais.
    const writer = relay.connect('writer')
    const cipher = new PayloadCipher(REPOSITORY_KEY)
    const server = await writer.getState(DOCUMENT_ID)
    const ghost = new Y.Doc()
    for (const payload of [server.state, ...server.updates.map((entry) => entry.update)]) {
      if (payload) Y.applyUpdate(ghost, (await cipher.open(payload))!)
    }
    const expected: string[] = []
    for (let index = 0; index < 260; index += 1) {
      const before = Y.encodeStateVector(ghost)
      ghost.getText('markdown').insert(ghost.getText('markdown').length, `${index};`)
      expected.push(`${index};`)
      await writer.pushUpdate(DOCUMENT_ID, { update: await cipher.seal(Y.encodeStateAsUpdate(ghost, before)), clientId: 'writer' })
    }
    await waitFor(() => alice.text === expected.join(''), 10_000, 'Alice reçoit la longue session')
    expect(relay.pendingUpdateCount(DOCUMENT_ID)).toBeGreaterThan(200)

    const bob = new SimulatedEditor(relay, 'bob', '')
    await bob.start()
    await waitLive([bob])
    await waitFor(() => relay.pendingUpdateCount(DOCUMENT_ID) < 50, 10_000, 'compaction')

    const carla = new SimulatedEditor(relay, 'carla', '')
    await carla.start()
    await waitLive([carla])
    const final = await waitConverged([alice, bob, carla])
    expect(final).toBe(expected.join(''))
    await Promise.all([alice, bob, carla].map((editor) => editor.session.stop()))
  })

  test('chiffrement : le relais ne voit jamais le texte, une mauvaise clé ne lit ni ne corrompt rien', async () => {
    const relay = new FakeRelay(101)
    const alice = new SimulatedEditor(relay, 'alice', 'Secret de fabrication.\n')
    const bob = new SimulatedEditor(relay, 'bob', 'Secret de fabrication.\n')
    await alice.start()
    await waitLive([alice])
    await bob.start()
    await waitLive([alice, bob])
    alice.insertAt(0, 'Confidentiel : ')

    // Quelqu'un qui connaît l'identifiant mais pas la clé du dépôt.
    const intruder = new SimulatedEditor(relay, 'intrus', 'Texte injecté.\n', null, Buffer.alloc(32, 9).toString('base64'))
    await intruder.start()
    await sleep(2500)
    intruder.insertAt(0, 'Pirate ')

    const final = await waitConverged([alice, bob])
    expect(final).toBe('Confidentiel : Secret de fabrication.\n')
    expect(intruder.text).not.toContain('Secret')
    const stored = JSON.stringify([...relay.docs.values()])
    expect(stored).not.toContain('Secret')
    expect(stored).not.toContain('Confidentiel')
    await Promise.all([alice, bob, intruder].map((editor) => editor.session.stop()))
  })

  test('annuler n annule que ses propres modifications, pas celles des autres', async () => {
    const relay = new FakeRelay(113)
    const initial = 'Début.\n\nMilieu.\n\nFin.\n'
    const alice = new SimulatedEditor(relay, 'alice', initial)
    const bob = new SimulatedEditor(relay, 'bob', initial)
    await alice.start()
    await waitLive([alice])
    await bob.start()
    await waitLive([alice, bob])

    alice.type(alice.text.replace('Début.', 'Début. [Alice]'))
    await waitConverged([alice, bob])
    bob.type(bob.text.replace('Fin.', 'Fin. [Bob]'))
    await waitConverged([alice, bob])
    // Alice continue après la modification de Bob, puis annule deux fois.
    await sleep(700)
    alice.type(alice.text.replace('Milieu.', 'Milieu. [Alice 2]'))
    await waitConverged([alice, bob])

    alice.session.undo()
    await waitFor(() => !alice.text.includes('[Alice 2]'), 5_000, 'premier annuler')
    alice.session.undo()
    let final = await waitConverged([alice, bob])
    expect(final).toBe('Début.\n\nMilieu.\n\nFin. [Bob]\n')

    alice.session.redo()
    final = await waitConverged([alice, bob])
    expect(final).toBe('Début. [Alice]\n\nMilieu.\n\nFin. [Bob]\n')
    await Promise.all([alice, bob].map((editor) => editor.session.stop()))
  })

  test('départ d un participant : les autres ne le voient plus', async () => {
    const relay = new FakeRelay(97)
    const alice = new SimulatedEditor(relay, 'alice', 'x')
    const bob = new SimulatedEditor(relay, 'bob', 'x')
    await alice.start()
    await waitLive([alice])
    await bob.start()
    await waitLive([alice, bob])
    await waitFor(() => alice.peers === 1 && bob.peers === 1, 5_000, 'présence mutuelle')
    await bob.session.stop()
    await waitFor(() => alice.peers === 0, 5_000, 'départ visible')
    await alice.session.stop()
  })
})
