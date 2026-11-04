/**
 * Session d'édition en temps réel d'un document, sur le modèle partagé par
 * blocs (voir sharedModel.ts).
 *
 * L'éditeur décrit son état par une photo du document (SharedSnapshot) ; une
 * saisie locale est la différence avec la photo précédente, appliquée au
 * document partagé ; les modifications des autres reviennent à l'éditeur sous
 * forme d'une nouvelle photo. Le fichier sur disque et git restent la
 * persistance : chaque participant enregistre et committe comme d'habitude.
 *
 * Jonction :
 *   - personne n'est établi sur le document → la session (re)démarre à partir
 *     du fichier local (nouvelle époque) : c'est git qui fait foi ;
 *   - des participants sont établis → on adopte leur état ; l'état Yjs gardé
 *     par ce poste (même époque) y est fusionné par Yjs, et les modifications
 *     du fichier local plus récentes y sont rejouées bloc par bloc.
 */
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { PayloadCipher } from './encoding'
import { applySnapshot, foldCommonAdditions, readSnapshot, sameSnapshot, sharedRoots, writeSnapshot, type SharedSnapshot } from './sharedModel'
import type { RealtimeCursor, RealtimePeer, RealtimeStatus, RealtimeUser } from './types'
import type { CaretAnchor } from './caretAnchor'

export type BlockSessionCallbacks = {
  /** Photo de ce que l'éditeur affiche actuellement */
  getEditorSnapshot: () => SharedSnapshot
  /**
   * Affiche (et enregistre) le document fusionné avec les modifications des
   * autres. `caret` : nouvelle place du curseur local dans le texte partagé,
   * s'il a été suivi pendant l'application des modifications reçues.
   */
  applyRemoteSnapshot: (snapshot: SharedSnapshot, caret?: CaretAnchor | null) => void
  /** Curseur local dans le texte partagé (bloc, cellule ou élément), ou null */
  getLocalCaret?: () => CaretAnchor | null
  /** Remonte immédiatement les frappes en attente de l'éditeur (elles arrivent via onLocalSnapshot) */
  flushLocalEdits: () => Promise<void>
  /** Dernière version poussée du fichier, en photo (base de fusion des modifications hors session) */
  getUpstreamSnapshot: () => Promise<SharedSnapshot | null>
  /** Redonne à `target` les identifiants de ses blocs équivalents dans `reference` (par le contenu) */
  alignIds: (target: SharedSnapshot, reference: SharedSnapshot) => SharedSnapshot
  /** Date de dernière modification du fichier sur ce poste (ms), ou null */
  getLocalModifiedAt?: () => Promise<number | null>
  onPeers: (peers: RealtimePeer[]) => void
  onStatus: (status: RealtimeStatus, detail?: string) => void
}

type DocumentRef = { documentId: string; key?: string | null }
type AwarenessState = { user: RealtimeUser; established: boolean; epoch: string | null; cursor?: RealtimeCursor | null }

const LOCAL_ORIGIN = 'holo-local'
const REMOTE_ORIGIN = 'holo-remote'
/** Inscription dans la liste des participants (hors historique d'annulation). */
const PARTICIPANT_ORIGIN = 'holo-participant'
const PUSH_INTERVAL_MS = 120
const AWARENESS_THROTTLE_MS = 250
const PEER_DISCOVERY_MS = 1500
/** Journal non vide : des participants sont peut-être là, on les attend plus longtemps. */
const PEER_DISCOVERY_ACTIVE_MS = 5000
const LOCAL_STATE_SAVE_MS = 300
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

const isEmptyDoc = (doc: Y.Doc) => doc.getArray('order').length === 0

/** Poste (client Yjs) qui a tapé le caractère `index` d'un texte partagé. */
type CapturedCaret = { anchor: CaretAnchor; position: Y.RelativePosition; end?: Y.RelativePosition }

function authorAt(text: Y.Text, index: number): number | null {
  type Item = { right: Item | null; deleted: boolean; countable: boolean; length: number; id: { client: number } }
  let item = (text as unknown as { _start: Item | null })._start
  let position = 0
  while (item) {
    if (!item.deleted && item.countable) {
      if (index < position + item.length) return item.id.client
      position += item.length
    }
    item = item.right
  }
  return null
}

export class BlockSession {
  private readonly api: HoloRealtimeApi
  private readonly ref: DocumentRef
  private readonly user: RealtimeUser
  private readonly callbacks: BlockSessionCallbacks
  private readonly cipher: PayloadCipher

  private doc: Y.Doc | null = null
  /** N'annule que nos propres modifications (origine locale), jamais celles des autres. */
  private undoManager: Y.UndoManager | null = null
  // La présence vit sur son propre document, stable toute la session.
  private readonly presenceDoc = new Y.Doc()
  private awareness: Awareness | null = null
  private epoch: string | null = null
  /** Photo que l'éditeur affiche ; invariant : égale au document partagé hors traitement distant */
  private lastSnapshot: SharedSnapshot | null = null
  private joined = false
  private joining = false
  private stopped = false
  private pendingLocal: Uint8Array[] = []
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private pushing = false
  private remoteQueue: Uint8Array[] = []
  private processingRemote = false
  private awarenessTimer: ReturnType<typeof setTimeout> | null = null
  private unsubscribeEvents: (() => void) | null = null

  constructor(api: HoloRealtimeApi, ref: DocumentRef, user: RealtimeUser, callbacks: BlockSessionCallbacks) {
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

  /** Photo du document partagé que l'éditeur affiche (null hors session). */
  currentSnapshot(): SharedSnapshot | null {
    return this.joined ? this.lastSnapshot : null
  }

  /** Saisie locale : nouvelle photo de l'éditeur. */
  onLocalSnapshot(snapshot: SharedSnapshot): void {
    if (!this.joined || !this.doc || !this.lastSnapshot || sameSnapshot(snapshot, this.lastSnapshot)) return
    applySnapshot(this.doc, this.lastSnapshot, snapshot, LOCAL_ORIGIN)
    // Si le document partagé avait changé sous l'éditeur, la saisie a été
    // rejouée sur sa version actuelle : l'éditeur reçoit le résultat.
    const actual = readSnapshot(this.doc)
    this.lastSnapshot = actual
    if (!sameSnapshot(actual, snapshot)) this.callbacks.applyRemoteSnapshot(actual)
  }

  /**
   * Modification venue du disque (pull, OneDrive…) : seule la différence entre
   * la version du disque qu'on connaissait (`base`) et la nouvelle (`next`) est
   * appliquée, par-dessus ce que la session a reçu depuis (saisies des
   * collègues pas encore enregistrées). L'éditeur reçoit le résultat.
   */
  onExternalChange(base: SharedSnapshot, next: SharedSnapshot): void {
    if (!this.joined || !this.doc || sameSnapshot(base, next)) return
    applySnapshot(this.doc, base, next, LOCAL_ORIGIN)
    const actual = readSnapshot(this.doc)
    this.lastSnapshot = actual
    this.callbacks.applyRemoteSnapshot(actual)
  }

  /** Publie la position de notre curseur (null : hors du document). */
  setLocalCursor(cursor: RealtimeCursor | null): void {
    if (!this.awareness) return
    const state = this.awareness.getLocalState() as AwarenessState | null
    if (!state) return
    const previous = state.cursor ?? null
    if (previous === cursor || (previous && cursor && previous.block === cursor.block && previous.blockId === cursor.blockId && previous.field === cursor.field && previous.offset === cursor.offset)) return
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
    this.publishDocument()
  }

  /**
   * Adresses de tous ceux qui ont rejoint la session (cette époque), y compris
   * ceux qui sont momentanément hors ligne : leurs commits sont des
   * instantanés de l'état partagé, que git ne doit pas réinjecter.
   */
  participants(): string[] {
    if (!this.doc) return []
    return [...this.doc.getMap<number>('participants').keys()]
  }

  private registerParticipant() {
    const email = this.user.email.trim().toLowerCase()
    if (!this.doc || !email) return
    const participants = this.doc.getMap<number>('participants')
    if (!participants.has(email)) this.doc.transact(() => participants.set(email, Date.now()), PARTICIPANT_ORIGIN)
  }

  /**
   * Une modification venue du disque (pull git, OneDrive) peut-elle être
   * poussée dans la session ? Seul le meneur la réinjecte (sinon elle serait
   * insérée en double), les autres la reçoivent par la session.
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
    if (this.saveTimer) clearTimeout(this.saveTimer)
    await this.saveLocalState().catch(() => undefined)
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
      const serverEmpty = isEmptyDoc(serverDoc)

      // Annonce de notre arrivée, puis écoute des participants déjà présents
      // (on arrête d'attendre dès qu'un participant établi répond).
      this.epoch = server.epoch
      this.setLocalAwareness(false)
      const discoveryEnd = Date.now() + (server.updates.length > 0 ? PEER_DISCOVERY_ACTIVE_MS : PEER_DISCOVERY_MS)
      const findEstablished = () => this.getPeerStates().filter((state) => state.established && state.epoch === server.epoch)
      while (Date.now() < discoveryEnd && findEstablished().length === 0 && server.epoch && !serverEmpty) {
        await sleep(100)
        if (this.stopped) return
      }
      if (this.stopped) return

      if (!server.epoch || serverEmpty || findEstablished().length === 0) {
        // Seul sur le document : la session repart du fichier local.
        console.info('[holo-realtime] seul sur le document : nouvelle session', { attempt, journal: server.updates.length })
        await this.callbacks.flushLocalEdits()
        const localSnapshot = this.callbacks.getEditorSnapshot()
        const freshDoc = new Y.Doc()
        writeSnapshot(freshDoc, localSnapshot)
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
        // Ce qui a été tapé pendant l'envoi est rattrapé comme une saisie normale.
        this.attachDoc(freshDoc, result.epoch)
        this.lastSnapshot = localSnapshot
        this.remoteQueue = []
        this.joined = true
        this.registerParticipant()
        this.onLocalSnapshot(this.callbacks.getEditorSnapshot())
      } else {
        // Participants présents : leur état fait foi. Tout ce qui demande une
        // attente (état gardé, version git, date du fichier) est lu d'abord ;
        // la photo de l'éditeur est prise ensuite et fusionnée sans attente,
        // si bien qu'aucune frappe ne peut se glisser entre les deux.
        const serverVector = Y.encodeStateVector(serverDoc)
        const cached = await this.mergeLocalState(serverDoc, server.epoch)
        const modifiedAt = cached ? await this.callbacks.getLocalModifiedAt?.().catch(() => null) ?? null : null
        const upstream = cached ? null : await this.callbacks.getUpstreamSnapshot().catch(() => null)
        await this.callbacks.flushLocalEdits()
        if (this.stopped) return
        const localSnapshot = this.callbacks.getEditorSnapshot()
        const sessionSnapshot = readSnapshot(serverDoc)
        // Base : ce que le fichier local reflétait avant ses modifications
        // propres. État gardé s'il y en a un (le fichier n'est fusionné que
        // s'il est plus récent : plus ancien, il est simplement en retard),
        // sinon la dernière version poussée sur git.
        let base: SharedSnapshot | null = null
        if (cached) {
          const fileIsNewer = modifiedAt !== null && modifiedAt > cached.savedAt + 1000
          if (fileIsNewer) base = cached.snapshot
        } else if (upstream) {
          base = this.callbacks.alignIds(upstream, sessionSnapshot)
        }
        if (base) {
          // Ce que la session a déjà (tapé avant son redémarrage) n'est pas doublé.
          const merge = foldCommonAdditions(base, this.callbacks.alignIds(localSnapshot, base), sessionSnapshot)
          if (!sameSnapshot(merge.ours, merge.base)) applySnapshot(serverDoc, merge.base, merge.ours, LOCAL_ORIGIN)
        }
        this.attachDoc(serverDoc, server.epoch)
        this.joined = true
        this.registerParticipant()
        // Nos modifications que le relais n'a pas : état gardé et fichier local.
        const missing = Y.encodeStateAsUpdate(serverDoc, serverVector)
        if (missing.length > 2) {
          this.pendingLocal.push(missing)
          this.schedulePush()
        }
        this.lastSnapshot = null
        this.publishDocument()
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
        console.info('[holo-realtime] session redémarrée par un autre poste : nouvelle jonction')
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

  /** Envoie à l'éditeur la photo du document partagé si elle a changé. */
  private publishDocument(caret: CaretAnchor | null = null) {
    if (!this.doc) return
    const next = readSnapshot(this.doc)
    if (this.lastSnapshot && sameSnapshot(next, this.lastSnapshot)) return
    this.lastSnapshot = next
    this.callbacks.applyRemoteSnapshot(next, caret)
  }

  /** Texte partagé où se trouve un curseur (bloc texte, cellule ou élément de liste). */
  private caretText(anchor: CaretAnchor): Y.Text | null {
    const block = this.doc?.getMap<Y.Map<unknown>>('blocks').get(anchor.blockId)
    if (!block) return null
    let text: unknown
    if (anchor.field === null) text = block.get('md')
    else if ('cell' in anchor.field) text = (block.get('rowData') as Y.Map<Y.Map<unknown>> | undefined)?.get(anchor.field.cell.rowId)?.get(anchor.field.cell.columnId)
    else text = (block.get('itemData') as Y.Map<Y.Map<unknown>> | undefined)?.get(anchor.field.item)?.get('text')
    return text instanceof Y.Text ? text : null
  }

  private captureCaret(): CapturedCaret | null {
    const anchor = this.callbacks.getLocalCaret?.() ?? null
    const text = anchor ? this.caretText(anchor) : null
    if (!anchor || !text) return null
    const clamp = (value: number) => Math.max(0, Math.min(text.length, value))
    const index = clamp(anchor.index)
    if (anchor.end !== undefined && anchor.end > index) {
      // Sélection : ses bords restent sur le premier et le dernier caractère
      // sélectionnés (ce qu'un collègue tape juste à côté reste en dehors).
      return {
        anchor,
        position: Y.createRelativePositionFromTypeIndex(text, index, 0),
        end: Y.createRelativePositionFromTypeIndex(text, clamp(anchor.end), -1),
      }
    }
    // Caractère de gauche tapé par nous : le curseur y reste attaché (notre
    // saisie reste d'un seul tenant). Tapé par un collègue (fin d'un mot qu'il
    // est en train d'écrire) : le curseur passe après ce qu'il y ajoute.
    const ownLeft = index > 0 && authorAt(text, index - 1) === this.doc!.clientID
    return { anchor, position: Y.createRelativePositionFromTypeIndex(text, index, ownLeft ? -1 : 0) }
  }

  private resolveCaret(captured: CapturedCaret | null): CaretAnchor | null {
    if (!captured || !this.doc) return null
    const text = this.caretText(captured.anchor)
    const resolve = (position: Y.RelativePosition) => {
      const absolute = Y.createAbsolutePositionFromRelativePosition(position, this.doc!)
      return absolute && absolute.type === text ? absolute.index : null
    }
    const index = text ? resolve(captured.position) : null
    if (index === null) return null
    const { end: _previousEnd, ...anchor } = captured.anchor
    const end = captured.end ? resolve(captured.end) : null
    return end !== null && end > index ? { ...anchor, index, end } : { ...anchor, index }
  }

  private attachDoc(doc: Y.Doc, epoch: string | null) {
    if (this.doc && this.doc !== doc) this.detachDoc()
    this.doc = doc
    this.epoch = epoch
    this.undoManager?.destroy()
    this.undoManager = new Y.UndoManager(sharedRoots(doc), { trackedOrigins: new Set([LOCAL_ORIGIN]), captureTimeout: 600 })
    // Saisies locales et annulations / rétablissements partent vers le relais.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      this.scheduleLocalStateSave()
      if (origin === REMOTE_ORIGIN) return
      this.pendingLocal.push(update)
      this.schedulePush()
    })
    this.scheduleLocalStateSave()
  }

  /** Enregistre (chiffré, sur ce poste) l'état Yjs du document, au plus toutes les 300 ms. */
  private scheduleLocalStateSave() {
    if (this.saveTimer || this.stopped || !this.api.saveLocalState) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.saveLocalState().catch(() => undefined)
    }, LOCAL_STATE_SAVE_MS)
  }

  private async saveLocalState() {
    if (!this.doc || !this.api.saveLocalState) return
    const state = await this.cipher.seal(Y.encodeStateAsUpdate(this.doc))
    await this.api.saveLocalState(this.ref.documentId, { epoch: this.epoch, state })
  }

  /**
   * Fusionne dans `doc` l'état Yjs gardé par ce poste pour cette époque.
   * Renvoie la photo de cet état gardé et sa date, ou null s'il n'y en a pas.
   */
  private async mergeLocalState(doc: Y.Doc, epoch: string | null): Promise<{ snapshot: SharedSnapshot; savedAt: number } | null> {
    if (!epoch || !this.api.loadLocalState) return null
    const cached = await this.api.loadLocalState(this.ref.documentId).catch(() => null)
    if (!cached || cached.epoch !== epoch) return null
    const bytes = await this.cipher.open(cached.state)
    if (!bytes) return null
    const cachedDoc = new Y.Doc()
    try {
      Y.applyUpdate(cachedDoc, bytes)
      Y.applyUpdate(doc, bytes, REMOTE_ORIGIN)
      return { snapshot: readSnapshot(cachedDoc), savedAt: cached.savedAt ?? 0 }
    } catch {
      return null
    } finally {
      cachedDoc.destroy()
    }
  }

  private detachDoc() {
    this.joined = false
    this.undoManager?.destroy()
    this.undoManager = null
    this.doc?.destroy()
    this.doc = null
    this.lastSnapshot = null
    this.pendingLocal = []
    this.remoteQueue = []
  }

  private async processRemote(): Promise<void> {
    if (this.processingRemote || !this.doc) return
    this.processingRemote = true
    try {
      while (this.remoteQueue.length > 0 && this.doc) {
        // Nos frappes en attente passent d'abord dans le document partagé.
        await this.callbacks.flushLocalEdits()
        const updates = this.remoteQueue.splice(0)
        // Le curseur local est attaché au caractère qui le précède : si un
        // collègue tape au même endroit, notre saisie reste d'un seul tenant.
        const caret = this.captureCaret()
        this.doc.transact(() => {
          for (const update of updates) Y.applyUpdate(this.doc!, update, REMOTE_ORIGIN)
        }, REMOTE_ORIGIN)
        this.publishDocument(this.resolveCaret(caret))
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

  /** Le participant de plus petit identifiant réinjecte les modifications venues du disque. */
  private isLeader(): boolean {
    const ownId = this.presenceDoc.clientID
    return this.getPeerEntries().every(([clientId]) => clientId > ownId)
  }
}
