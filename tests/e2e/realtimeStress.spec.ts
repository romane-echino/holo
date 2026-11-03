/**
 * realtimeStress.spec.ts — Test de charge du relais temps réel réel
 *
 * N participants (10 par défaut) utilisent la vraie logique de session
 * (Yjs, chiffrement, présence) contre un relais holo-realtime déployé, tapent
 * en continu, subissent des coupures réseau ; on mesure la latence de
 * propagation, les erreurs HTTP, la convergence et l'absence de perte.
 *
 * Ignoré par défaut. Lancement :
 *   HOLO_STRESS_URL=https://cn.echino.com/holo-realtime npx playwright test tests/e2e/realtimeStress.spec.ts
 * Options : HOLO_STRESS_CLIENTS (10), HOLO_STRESS_SECONDS (60).
 */
import { test, expect } from '@playwright/test'
import crypto from 'node:crypto'
import { RealtimeSession } from '../../src/lib/realtime/session'

const BASE_URL = (process.env.HOLO_STRESS_URL ?? '').replace(/\/+$/, '')
const CLIENTS = Number(process.env.HOLO_STRESS_CLIENTS ?? 10)
const SECONDS = Number(process.env.HOLO_STRESS_SECONDS ?? 60)

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// ─── Statistiques ─────────────────────────────────────────────────────────────
const stats = {
  requests: 0,
  errors: new Map<string, number>(),
  requestMs: [] as number[],
  streamOpens: 0,
}

function recordError(label: string) {
  stats.errors.set(label, (stats.errors.get(label) ?? 0) + 1)
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))])
}

// ─── Transport HTTP réel (équivalent de electron/realtime.js) ─────────────────
async function readEventStream(body: ReadableStream<Uint8Array>, onEvent: (type: string, data: unknown) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let separator = buffer.indexOf('\n\n')
    while (separator !== -1) {
      const raw = buffer.slice(0, separator)
      buffer = buffer.slice(separator + 2)
      let type = 'message'
      const data: string[] = []
      for (const line of raw.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
      }
      if (data.length > 0) {
        let parsed: unknown = data.join('\n')
        try { parsed = JSON.parse(parsed as string) } catch { /* texte */ }
        onEvent(type, parsed)
      }
      separator = buffer.indexOf('\n\n')
    }
  }
}

class HttpRelay implements HoloRealtimeApi {
  private listeners = new Set<(event: HoloRealtimeEvent) => void>()
  private streams = new Map<string, AbortController>()
  private offlineUntil = 0
  private stopped = false

  private emit(event: HoloRealtimeEvent) {
    for (const listener of this.listeners) listener(event)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (Date.now() < this.offlineUntil) throw new Error('hors ligne (simulé)')
    const started = Date.now()
    stats.requests += 1
    const response = await fetch(`${BASE_URL}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch((error) => {
      recordError(`réseau ${method} ${path.split('/')[3] ?? ''}`)
      throw error
    })
    stats.requestMs.push(Date.now() - started)
    const text = await response.text()
    if (!response.ok) {
      recordError(`HTTP ${response.status} ${method} ${path.split('/')[3] ?? ''}`)
      throw Object.assign(new Error(`HTTP ${response.status} ${text.slice(0, 120)}`), { status: response.status })
    }
    return (text ? JSON.parse(text) : null) as T
  }

  /** Coupure réseau : flux fermé et requêtes refusées pendant `ms`. */
  cut(ms: number) {
    this.offlineUntil = Date.now() + ms
    for (const controller of this.streams.values()) controller.abort()
  }

  async close() {
    this.stopped = true
    for (const controller of this.streams.values()) controller.abort()
  }

  private async runStream(documentId: string) {
    while (!this.stopped && this.streams.has(documentId)) {
      if (Date.now() < this.offlineUntil) {
        await sleep(this.offlineUntil - Date.now())
        continue
      }
      const controller = new AbortController()
      this.streams.set(documentId, controller)
      try {
        const response = await fetch(`${BASE_URL}/api/docs/${documentId}/stream`, { headers: { Accept: 'text/event-stream' }, signal: controller.signal })
        if (!response.ok || !response.body) {
          recordError(`flux HTTP ${response.status}`)
          await sleep(1000)
          continue
        }
        stats.streamOpens += 1
        await readEventStream(response.body, (type, data) => {
          if (type === 'ready') this.emit({ documentId, type: 'ready', data })
          else if (type === 'signal' && data && typeof data === 'object') {
            const signal = data as { ref: string; payload: never }
            this.emit(signal.ref.endsWith('.awareness')
              ? { documentId, type: 'awareness', data: signal.payload }
              : { documentId, type: 'update', data: signal.payload })
          }
        })
      } catch {
        // coupure : reconnexion
      }
      if (!this.stopped) await sleep(500)
    }
  }

  getConfig = async () => ({ url: BASE_URL, enabled: true, hasToken: false })
  setConfig = async () => ({ ok: true as const })
  testConnection = async () => ({ ok: true })
  resolveDocument = async () => ({ available: false as const, reason: 'disabled' as const })
  getUpstreamContent = async () => null
  mergeText = async (_base: string, ours: string) => ours

  subscribe = async (documentId: string) => {
    if (!this.streams.has(documentId)) {
      this.streams.set(documentId, new AbortController())
      void this.runStream(documentId)
    }
    return { ok: true as const }
  }

  unsubscribe = async (documentId: string) => {
    this.streams.get(documentId)?.abort()
    this.streams.delete(documentId)
    return { ok: true as const }
  }

  getState = (documentId: string) => this.request<HoloRealtimeState>('GET', `/docs/${documentId}/state`)
  pushUpdate = (documentId: string, payload: { update: string; clientId: string }) => this.request<{ id: string }>('POST', `/docs/${documentId}/updates`, payload)
  pushAwareness = (documentId: string, payload: { awareness: string; clientId: string }) => this.request<{ ok: true }>('POST', `/docs/${documentId}/awareness`, payload)
  compact = async (documentId: string, payload: { state: string; expectedVersion: number; mergedUpdateIds?: string[]; reset?: boolean }) => {
    try {
      return { ok: true as const, ...(await this.request<{ version: number; epoch: string }>('PUT', `/docs/${documentId}/state`, payload)) }
    } catch (error) {
      if ((error as { status?: number }).status === 409) return { ok: false as const, conflict: true as const }
      throw error
    }
  }

  onEvent = (callback: (event: HoloRealtimeEvent) => void) => {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
}

// ─── Participant simulé ───────────────────────────────────────────────────────
class Participant {
  text: string
  status: string | null = null
  peers = 0
  readonly relay = new HttpRelay()
  readonly session: RealtimeSession
  /** Instant où chaque jeton est apparu dans ce texte */
  readonly seenAt = new Map<string, number>()

  constructor(readonly name: string, documentId: string, key: string, initial: string) {
    this.text = initial
    this.session = new RealtimeSession(this.relay, { documentId, key }, { name, email: `${name}@example.com`, color: '#888' }, {
      getEditorMarkdown: () => this.text,
      applyRemoteMarkdown: (markdown) => {
        this.text = markdown
        this.markSeen()
      },
      flushLocalEdits: async () => {},
      getUpstreamMarkdown: async () => null,
      mergeText: async (_base, ours) => ours,
      onPeers: (peers) => { this.peers = peers.length },
      onStatus: (status) => { this.status = status },
    })
  }

  private markSeen() {
    const now = Date.now()
    for (const match of this.text.matchAll(/\[[a-z0-9]+-\d+\]/g)) {
      if (!this.seenAt.has(match[0])) this.seenAt.set(match[0], now)
    }
  }

  insert(token: string, random: () => number) {
    // Insertion hors des jetons existants (un jeton coupé ne se reconnaîtrait plus).
    const boundaries = [0, this.text.length]
    for (const match of this.text.matchAll(/\[[a-z0-9]+-\d+\]|\n/g)) boundaries.push(match.index! + match[0].length)
    const at = boundaries[Math.floor(random() * boundaries.length)]
    this.text = this.text.slice(0, at) + token + this.text.slice(at)
    this.seenAt.set(token, Date.now())
    this.session.onLocalMarkdown(this.text)
  }
}

test.describe('Charge du relais temps réel', () => {
  test.skip(!BASE_URL, 'Définir HOLO_STRESS_URL pour lancer le test de charge')
  test.setTimeout((SECONDS + 180) * 1000)

  test(`${CLIENTS} personnes éditent le même document pendant ${SECONDS} s`, async () => {
    const documentId = crypto.randomUUID()
    const key = crypto.randomBytes(32).toString('base64')
    const initial = '# Réunion d équipe\n\nOrdre du jour.\n\nNotes.\n'
    const participants = Array.from({ length: CLIENTS }, (_value, index) => new Participant(`p${index}`, documentId, key, initial))

    // Arrivées échelonnées, comme en vrai.
    for (const participant of participants) {
      await participant.session.start()
      await sleep(300)
    }
    const joinDeadline = Date.now() + 60_000
    while (participants.some((participant) => participant.status !== 'live')) {
      if (Date.now() > joinDeadline) throw new Error(`Jonction trop longue : ${participants.map((p) => p.status).join(',')}`)
      await sleep(100)
    }
    await sleep(2000)
    const peersSeen = participants.map((participant) => participant.peers)

    // Saisie continue : chaque personne tape un « mot » toutes les 0,4 à 1,6 s.
    const tokens: { token: string; at: number; author: Participant }[] = []
    let seq = 0
    const end = Date.now() + SECONDS * 1000
    let cutDone = false
    await Promise.all(participants.map(async (participant, index) => {
      const random = () => Math.random()
      while (Date.now() < end) {
        await sleep(400 + Math.random() * 1200)
        // Deux participants subissent une coupure réseau de 5 s à mi-parcours.
        if (!cutDone && index < 2 && Date.now() > end - (SECONDS * 1000) / 2) {
          if (index === 1) cutDone = true
          participant.relay.cut(5000)
        }
        seq += 1
        const token = `[${participant.name}-${seq}]`
        tokens.push({ token, at: Date.now(), author: participant })
        participant.insert(token, random)
      }
    }))

    // Convergence : même texte partout, stable.
    const convergeStart = Date.now()
    let stableSince = 0
    let previous = ''
    for (;;) {
      const texts = participants.map((participant) => participant.text)
      if (texts.every((text) => text === texts[0])) {
        if (texts[0] !== previous) { previous = texts[0]; stableSince = Date.now() }
        else if (Date.now() - stableSince > 2000) break
      } else {
        stableSince = 0
        previous = ''
      }
      if (Date.now() - convergeStart > 90_000) break
      await sleep(200)
    }
    const convergenceMs = Date.now() - convergeStart - 2000
    const final = participants[0].text
    const diverged = participants.filter((participant) => participant.text !== final).map((participant) => participant.name)

    // Latence de propagation : frappe → affichage chez chaque autre participant.
    const latencies: number[] = []
    const latenciesWithoutCuts: number[] = []
    const cut = new Set(participants.slice(0, 2))
    for (const { token, at, author } of tokens) {
      for (const participant of participants) {
        if (participant === author) continue
        const seen = participant.seenAt.get(token)
        if (seen === undefined) continue
        latencies.push(seen - at)
        if (!cut.has(participant) && !cut.has(author)) latenciesWithoutCuts.push(seen - at)
      }
    }
    const missing = tokens.filter(({ token }) => !final.includes(token)).map(({ token }) => token)
    const duplicated = tokens.filter(({ token }) => final.split(token).length - 1 > 1).map(({ token }) => token)

    const report = {
      participants: CLIENTS,
      secondes: SECONDS,
      saisies: tokens.length,
      pairsVusAprèsJonction: peersSeen,
      requêtes: stats.requests,
      erreurs: Object.fromEntries(stats.errors),
      ouverturesDeFlux: stats.streamOpens,
      requêteMs: { p50: percentile(stats.requestMs, 50), p95: percentile(stats.requestMs, 95), max: percentile(stats.requestMs, 100) },
      propagationMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), p99: percentile(latencies, 99), max: percentile(latencies, 100) },
      propagationHorsCoupuresMs: { p50: percentile(latenciesWithoutCuts, 50), p95: percentile(latenciesWithoutCuts, 95), p99: percentile(latenciesWithoutCuts, 99), max: percentile(latenciesWithoutCuts, 100) },
      convergenceMs,
      divergents: diverged,
      perdus: missing.length,
      dupliqués: duplicated.length,
      tailleDocument: final.length,
    }
    console.log('RAPPORT DE CHARGE', JSON.stringify(report, null, 2))

    await Promise.all(participants.map((participant) => participant.session.stop().catch(() => undefined)))
    await Promise.all(participants.map((participant) => participant.relay.close()))

    expect(diverged, 'participants non convergés').toEqual([])
    expect(missing, 'saisies perdues').toEqual([])
    expect(duplicated, 'saisies dupliquées').toEqual([])
  })
})
