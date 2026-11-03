/**
 * Session d'édition en temps réel d'un document (Yjs).
 *
 * Le document partagé est un Y.Text contenant le Markdown tel que l'éditeur
 * l'émet. Les saisies locales y sont appliquées sous forme de diff, les
 * modifications distantes sont fusionnées par Yjs puis renvoyées à l'éditeur.
 * Le fichier sur disque et git restent la persistance : chaque participant
 * continue d'enregistrer et de committer comme d'habitude.
 *
 * Jonction :
 *   - personne n'est établi sur le document → on (re)démarre la session à partir
 *     de son propre fichier (nouvelle époque) : c'est git qui fait foi ;
 *   - des participants sont établis → on adopte leur état, et on y fusionne
 *     nos éventuelles modifications locales (fusion 3 voies sur la dernière
 *     version poussée du fichier).
 */
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { PayloadCipher, multiSpliceDiff } from './encoding'

export type RealtimeUser = { name: string; email: string; color: string }
/** Position du curseur : bloc (rang dans le document), champ éditable du bloc (ex. cellule), position dans son texte */
export type RealtimeCursor = { block: number; field: number; offset: number }
export type RealtimePeer = RealtimeUser & { clientId: number; cursor: RealtimeCursor | null }
export type RealtimeStatus = 'connecting' | 'joining' | 'live' | 'reconnecting' | 'unauthorized' | 'error' | 'stopped'

export type RealtimeSessionCallbacks = {
  /** Markdown que l'éditeur représente actuellement */
  getEditorMarkdown: () => string
  /** Affiche (et enregistre) un contenu fusionné avec les modifications des autres */
  applyRemoteMarkdown: (markdown: string) => void
  /** Remonte immédiatement les frappes en attente de l'éditeur (elles arrivent via onLocalMarkdown) */
  flushLocalEdits: () => Promise<void>
  /** Dernière version poussée du fichier (base de fusion pour des modifications hors session) */
  getUpstreamMarkdown: () => Promise<string | null>
  /** Fusion 3 voies texte ; en cas de conflit, les deux côtés sont conservés */
  mergeText: (base: string, ours: string, theirs: string) => Promise<string>
  onPeers: (peers: RealtimePeer[]) => void
  onStatus: (status: RealtimeStatus, detail?: string) => void
}

/** `key` : clé du dépôt (base64) ; tout ce qui passe par le relais est chiffré avec. */
type DocumentRef = { documentId: string; key?: string | null }
type AwarenessState = { user: RealtimeUser; established: boolean; epoch: string | null; cursor?: RealtimeCursor | null }

const LOCAL_ORIGIN = 'holo-local'
const REMOTE_ORIGIN = 'holo-remote'
const PUSH_INTERVAL_MS = 120
const AWARENESS_THROTTLE_MS = 250
const PEER_DISCOVERY_MS = 1500
const COMPACTION_THRESHOLD = 200
const MAX_JOIN_ATTEMPTS = 3

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function openAll(cipher: PayloadCipher, serverState: HoloRealtimeState | null): Promise<Uint8Array[]> {
  const payloads = [serverState?.state, ...(serverState?.updates ?? []).map((entry) => entry.update)].filter((value): value is string => Boolean(value))
  const opened = await Promise.all(payloads.map((payload) => cipher.open(payload)))
  return opened.filter((bytes): bytes is Uint8Array => bytes !== null)
}

async function buildDoc(cipher: PayloadCipher, serverState: HoloRealtimeState | null): Promise<Y.Doc> {
  const doc = new Y.Doc()
  for (const update of await openAll(cipher, serverState)) Y.applyUpdate(doc, update, REMOTE_ORIGIN)
  return doc
}

export class RealtimeSession {
  private readonly api: HoloRealtimeApi
  private readonly ref: DocumentRef
  private readonly user: RealtimeUser
  private readonly callbacks: RealtimeSessionCallbacks
  private readonly cipher: PayloadCipher

  private doc: Y.Doc | null = null
  /** N'annule que nos propres modifications (origine locale), jamais celles des autres. */
  private undoManager: Y.UndoManager | null = null
  // La présence vit sur son propre document, stable toute la session : le
  // document de contenu peut être remplacé (jonction, redémarrage de session)
  // sans que les autres perdent notre trace.
  private readonly presenceDoc = new Y.Doc()
  private awareness: Awareness | null = null
  private epoch: string | null = null
  /** Texte que l'éditeur reflète ; invariant : égal au Y.Text hors traitement distant */
  private lastText = ''
  private joined = false
  private joining = false
  private stopped = false
  private pendingLocal: Uint8Array[] = []
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private pushing = false
  private remoteQueue: Uint8Array[] = []
  private processingRemote = false
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeEvents: (() => void) | null = null

  constructor(api: HoloRealtimeApi, ref: DocumentRef, user: RealtimeUser, callbacks: RealtimeSessionCallbacks) {
    this.api = api
    this.ref = ref
    this.user = user
    this.callbacks = callbacks
    this.cipher = new PayloadCipher(ref.key)
  }

  get documentId() {
    return this.ref.documentId
  }

  async start(): Promise<void> {
    this.callbacks.onStatus('connecting')
    this.setupAwareness()
    this.unsubscribeEvents = this.api.onEvent((event) => {
      if (event.documentId !== this.ref.documentId || this.stopped) return
      this.handleEvent(event)
    })
    await this.api.subscribe(this.ref.documentId)
  }

  /** Saisie locale (markdown complet émis par l'éditeur). */
  onLocalMarkdown(markdown: string): void {
    if (!this.joined || !this.doc || markdown === this.lastText) return
    const text = this.doc.getText('markdown')
    // Zones modifiées séparément, de la dernière à la première (les indices
    // des précédentes restent valables).
    const splices = multiSpliceDiff(this.lastText, markdown)
    if (splices.length === 0) return
    this.doc.transact(() => {
      for (const splice of [...splices].reverse()) {
        if (splice.remove > 0) text.delete(splice.index, splice.remove)
        if (splice.insert) text.insert(splice.index, splice.insert)
      }
    }, LOCAL_ORIGIN)
    this.lastText = markdown
  }

  /** Publie la position de notre curseur (null : hors du document). */
  setLocalCursor(cursor: RealtimeCursor | null): void {
    if (!this.awareness) return
    const state = this.awareness.getLocalState() as AwarenessState | null
    if (!state) return
    const previous = state.cursor ?? null
    if (previous === cursor || (previous && cursor && previous.block === cursor.block && previous.field === cursor.field && previous.offset === cursor.offset)) return
    this.awareness.setLocalStateField('cursor', cursor)
  }

  /** Annule notre dernière modification (celles des autres sont conservées). */
  undo(): void {
    void this.moveInHistory('undo')
  }

  redo(): void {
    void this.moveInHistory('redo')
  }

  private async moveInHistory(direction: 'undo' | 'redo') {
    if (!this.joined || !this.doc || !this.undoManager) return
    // La saisie en attente fait partie de ce qu'on annule.
    await this.callbacks.flushLocalEdits()
    if (!this.doc || !this.undoManager) return
    this.undoManager.stopCapturing()
    const changed = direction === 'undo' ? this.undoManager.undo() : this.undoManager.redo()
    if (!changed) return
    const nextText = this.doc.getText('markdown').toString()
    if (nextText !== this.lastText) {
      this.lastText = nextText
      this.callbacks.applyRemoteMarkdown(nextText)
    }
  }

  /**
   * Une modification venue du disque (pull git, OneDrive) peut-elle être
   * appliquée à l'éditeur et poussée dans la session ? Chaque participant la
   * reçoit : seul le meneur la réinjecte (sinon elle serait insérée en
   * double), les autres attendent de la recevoir par la session.
   */
  shouldApplyExternalChanges(): boolean {
    if (!this.joined) return true
    return this.getPeerEntries().length === 0 || this.isLeader()
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    this.callbacks.onStatus('stopped')
    if (this.pushTimer) clearTimeout(this.pushTimer)
    if (this.awarenessTimer) clearTimeout(this.awarenessTimer)
    // Derniers envois puis départ annoncé (les autres retirent notre avatar).
    await this.flushPendingPush().catch(() => undefined)
    if (this.awareness) {
      const presenceId = this.presenceDoc.clientID
      removeAwarenessStates(this.awareness, [presenceId], 'leave')
      const update = encodeAwarenessUpdate(this.awareness, [presenceId])
      await this.api.pushAwareness(this.ref.documentId, { awareness: await this.cipher.seal(update), clientId: String(presenceId) }).catch(() => undefined)
    }
    this.unsubscribeEvents?.()
    await this.api.unsubscribe(this.ref.documentId).catch(() => undefined)
    this.awareness?.destroy()
    this.presenceDoc.destroy()
    this.doc?.destroy()
  }

  // ─── Évènements du relais ────────────────────────────────────────────────

  private handleEvent(event: HoloRealtimeEvent) {
    switch (event.type) {
      case 'ready':
        // Chaque (re)connexion : jonction initiale, ou resynchronisation.
        void (this.joined ? this.resync() : this.join())
        break
      case 'update':
        if (this.doc && event.data.c === String(this.doc.clientID)) return
        // Gardé même pendant la jonction : rejoué ensuite (Yjs est idempotent).
        void this.cipher.open(event.data.u).then((update) => {
          if (!update || this.stopped) return
          this.remoteQueue.push(update)
          if (this.joined) void this.processRemote()
        })
        break
      case 'awareness':
        if (!this.awareness || event.data.c === String(this.presenceDoc.clientID)) return
        void this.cipher.open(event.data.a).then((update) => {
          if (update && !this.stopped) this.applyRemoteAwareness(update)
        })
        break
      case 'status':
        if (event.data.state === 'unauthorized') this.callbacks.onStatus('unauthorized', 'Jeton refusé par le relais.')
        else if (event.data.state === 'reconnecting') this.callbacks.onStatus('reconnecting', event.data.error)
        break
    }
  }

  private async join(attempt = 1): Promise<void> {
    if (this.joining || this.stopped) return
    this.joining = true
    this.callbacks.onStatus('joining')
    try {
      const server = await this.api.getState(this.ref.documentId)
      const serverDoc = await buildDoc(this.cipher, server)
      const serverText = serverDoc.getText('markdown').toString()

      // Annonce de notre arrivée, puis écoute des participants déjà présents.
      this.epoch = server.epoch
      this.setLocalAwareness(false)
      await sleep(PEER_DISCOVERY_MS)
      if (this.stopped) return
      const establishedPeers = this.getPeerStates().filter((state) => state.established && state.epoch === server.epoch)

      // Les frappes en attente doivent faire partie de l'état de départ.
      await this.callbacks.flushLocalEdits()
      const localText = this.callbacks.getEditorMarkdown()

      if (!server.epoch || serverText === '' || establishedPeers.length === 0) {
        // Seul sur le document : la session repart du fichier local.
        const freshDoc = new Y.Doc()
        freshDoc.getText('markdown').insert(0, localText)
        const result = await this.api.compact(this.ref.documentId, {
          state: await this.cipher.seal(Y.encodeStateAsUpdate(freshDoc)),
          expectedVersion: server.version,
          reset: true,
        })
        if (!result.ok) {
          // Quelqu'un a démarré la session au même instant : on rejoint la sienne.
          freshDoc.destroy()
          this.joining = false
          if (attempt < MAX_JOIN_ATTEMPTS) return this.join(attempt + 1)
          throw new Error('Impossible de rejoindre la session')
        }
        serverDoc.destroy()
        this.attachDoc(freshDoc, result.epoch)
        this.lastText = localText
        this.remoteQueue = []
        this.joined = true
      } else {
        // Participants présents : leur état fait foi, nos modifications hors
        // session y sont fusionnées (base : dernière version poussée du fichier).
        let target = serverText
        if (localText !== serverText) {
          const upstream = await this.callbacks.getUpstreamMarkdown().catch(() => null)
          if (upstream !== null && upstream !== localText) {
            target = await this.callbacks.mergeText(upstream, serverText, localText).catch(() => serverText)
          }
        }
        this.attachDoc(serverDoc, server.epoch)
        this.lastText = serverText
        this.joined = true
        if (target !== serverText) this.onLocalMarkdown(target)
        if (this.lastText !== localText) this.callbacks.applyRemoteMarkdown(this.lastText)
        // N'importe quel arrivant compacte un gros journal : la version du
        // document refuse une compaction concurrente (aucun risque de perte).
        if (server.updates.length > COMPACTION_THRESHOLD) void this.compact(server)
      }

      this.setLocalAwareness(true)
      this.callbacks.onStatus('live')
      if (this.remoteQueue.length > 0) void this.processRemote()
    } catch (error) {
      this.callbacks.onStatus('error', error instanceof Error ? error.message : String(error))
    } finally {
      this.joining = false
    }
  }

  /** Après une reconnexion : rattrape les updates manqués et renvoie les nôtres. */
  private async resync(): Promise<void> {
    if (!this.doc || this.stopped) return
    try {
      const server = await this.api.getState(this.ref.documentId)
      if (server.epoch !== this.epoch) {
        // La session a été redémarrée entre-temps : on la rejoint à neuf.
        await this.callbacks.flushLocalEdits()
        this.detachDoc()
        await this.join()
        return
      }
      const serverUpdates = await openAll(this.cipher, server)
      const serverDoc = new Y.Doc()
      for (const update of serverUpdates) Y.applyUpdate(serverDoc, update, REMOTE_ORIGIN)
      if (!this.doc) return
      const missingForServer = Y.encodeStateAsUpdate(this.doc, Y.encodeStateVector(serverDoc))
      serverDoc.destroy()
      this.remoteQueue.push(...serverUpdates)
      await this.processRemote()
      if (server.updates.length > COMPACTION_THRESHOLD) void this.compact(server)
      if (missingForServer.length > 2) {
        this.pendingLocal.push(missingForServer)
        await this.flushPendingPush()
      }
      this.setLocalAwareness(true)
      this.callbacks.onStatus('live')
    } catch (error) {
      this.callbacks.onStatus('reconnecting', error instanceof Error ? error.message : String(error))
    }
  }

  // ─── Document ────────────────────────────────────────────────────────────

  private attachDoc(doc: Y.Doc, epoch: string | null) {
    if (this.doc && this.doc !== doc) this.detachDoc()
    this.doc = doc
    this.epoch = epoch
    this.undoManager?.destroy()
    this.undoManager = new Y.UndoManager(doc.getText('markdown'), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 600 })
    // Saisies locales et annulations / rétablissements partent vers le relais.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return
      this.pendingLocal.push(update)
      this.schedulePush()
    })
  }

  private detachDoc() {
    this.joined = false
    this.undoManager?.destroy()
    this.undoManager = null
    this.doc?.destroy()
    this.doc = null
    this.pendingLocal = []
    this.remoteQueue = []
  }

  private async processRemote(): Promise<void> {
    if (this.processingRemote || !this.doc) return
    this.processingRemote = true
    try {
      while (this.remoteQueue.length > 0 && this.doc) {
        // Nos frappes en attente passent d'abord dans le Y.Text (sinon le diff
        // local serait calculé sur un texte que les autres ont déjà modifié).
        await this.callbacks.flushLocalEdits()
        const updates = this.remoteQueue.splice(0)
        this.doc.transact(() => {
          for (const update of updates) Y.applyUpdate(this.doc!, update, REMOTE_ORIGIN)
        }, REMOTE_ORIGIN)
        const nextText = this.doc.getText('markdown').toString()
        if (nextText !== this.lastText) {
          this.lastText = nextText
          this.callbacks.applyRemoteMarkdown(nextText)
        }
      }
    } finally {
      this.processingRemote = false
    }
  }

  private schedulePush() {
    if (this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      void this.flushPendingPush()
    }, PUSH_INTERVAL_MS)
  }

  private async flushPendingPush(): Promise<void> {
    if (this.pushing || !this.doc || this.pendingLocal.length === 0) return
    this.pushing = true
    const batch = this.pendingLocal.splice(0)
    try {
      await this.api.pushUpdate(this.ref.documentId, {
        update: await this.cipher.seal(Y.mergeUpdates(batch)),
        clientId: String(this.doc.clientID),
      })
    } catch (error) {
      // Réessayé à la prochaine saisie ou resynchronisation.
      this.pendingLocal.unshift(...batch)
      this.callbacks.onStatus('reconnecting', error instanceof Error ? error.message : String(error))
    } finally {
      this.pushing = false
    }
    if (this.pendingLocal.length > 0 && !this.stopped) this.schedulePush()
  }

  private async compact(server: HoloRealtimeState) {
    if (!this.doc) return
    await this.api.compact(this.ref.documentId, {
      state: await this.cipher.seal(Y.encodeStateAsUpdate(this.doc)),
      expectedVersion: server.version,
      mergedUpdateIds: server.updates.map((entry) => entry.id),
    }).catch(() => undefined)
  }

  // ─── Présence ────────────────────────────────────────────────────────────

  private setupAwareness() {
    const awareness = new Awareness(this.presenceDoc)
    this.awareness = awareness
    awareness.setLocalState({ user: this.user, established: false, epoch: null } satisfies AwarenessState)
    awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote') {
        // Un nouveau venu : on lui renvoie notre présence pour qu'il nous voie tout de suite.
        if (added.length > 0) this.scheduleAwarenessPush()
      } else if ([...added, ...updated, ...removed].includes(this.presenceDoc.clientID)) {
        // Changement local ou renouvellement périodique (toutes les 15 s).
        this.scheduleAwarenessPush()
      }
      this.callbacks.onPeers(this.getPeers())
    })
  }

  private setLocalAwareness(established: boolean) {
    const cursor = (this.awareness?.getLocalState() as AwarenessState | null)?.cursor ?? null
    this.awareness?.setLocalState({ user: this.user, established, epoch: this.epoch, cursor } satisfies AwarenessState)
  }

  private applyRemoteAwareness(update: Uint8Array) {
    if (!this.awareness) return
    applyAwarenessUpdate(this.awareness, update, 'remote')
    // Un participant établi sur une autre époque : la session a été redémarrée.
    if (this.joined && this.getPeerStates().some((state) => state.established && state.epoch && state.epoch !== this.epoch)) {
      void this.resync()
    }
  }

  private scheduleAwarenessPush() {
    if (this.awarenessTimer || this.stopped) return
    this.awarenessTimer = setTimeout(() => {
      this.awarenessTimer = null
      if (!this.awareness || this.stopped) return
      const presenceId = this.presenceDoc.clientID
      const update = encodeAwarenessUpdate(this.awareness, [presenceId])
      void this.cipher.seal(update)
        .then((awareness) => this.api.pushAwareness(this.ref.documentId, { awareness, clientId: String(presenceId) }))
        .catch(() => undefined)
    }, AWARENESS_THROTTLE_MS)
  }

  private getPeerEntries(): [number, AwarenessState][] {
    if (!this.awareness) return []
    const ownId = this.presenceDoc.clientID
    return Array.from(this.awareness.getStates().entries())
      .filter(([clientId, state]) => clientId !== ownId && Boolean((state as AwarenessState | null)?.user))
      .map(([clientId, state]) => [clientId, state as AwarenessState])
  }

  private getPeerStates(): AwarenessState[] {
    return this.getPeerEntries().map(([, state]) => state)
  }

  private getPeers(): RealtimePeer[] {
    return this.getPeerEntries().map(([clientId, state]) => ({ clientId, ...state.user, cursor: state.established ? state.cursor ?? null : null }))
  }

  /** Le participant de plus petit identifiant compacte le journal. */
  private isLeader(): boolean {
    const ownId = this.presenceDoc.clientID
    return this.getPeerEntries().every(([clientId]) => clientId > ownId)
  }
}

/** Couleur stable d'un participant, dérivée de son e-mail. */
export function colorForUser(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 70% 62%)`
}
