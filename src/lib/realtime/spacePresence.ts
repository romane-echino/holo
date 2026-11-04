/**
 * Présence dans un espace (dépôt git) : qui a quel document ouvert, et
 * signal « je viens d'envoyer des modifications » pour que les autres
 * récupèrent sans attendre la synchronisation périodique.
 *
 * Utilise le même relais et le même chiffrement que l'édition en temps réel,
 * sur un canal propre à l'espace ; aucun contenu n'y transite.
 */
import * as Y from 'yjs'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness'
import { PayloadCipher } from './encoding'
import type { RealtimeUser } from './types'

export type SpacePeer = RealtimeUser & {
  clientId: number
  /** Version de Holo et format des documents en direct (null : version ≤ 0.9.3, qui ne les publie pas) */
  version: string | null
  protocol: number | null
  /** L'espace est celui affiché par ce participant */
  active: boolean
  /** Chemin (relatif à l'espace, séparateurs « / ») du document ouvert, ou null */
  editing: string | null
}

type SpaceAwarenessState = {
  user: RealtimeUser
  app?: { version: string; protocol: number }
  active: boolean
  editing: string | null
  /** Dernier envoi au dépôt ; structural : fichiers ajoutés, supprimés ou renommés */
  pushed: { at: number; structural: boolean } | null
}

type SpacePresenceCallbacks = {
  onPeers: (peers: SpacePeer[]) => void
  /** Un participant vient d'envoyer des modifications au dépôt */
  onRemotePush: (structural: boolean) => void
}

const AWARENESS_THROTTLE_MS = 250

export class SpacePresence {
  private readonly doc = new Y.Doc()
  private readonly awareness = new Awareness(this.doc)
  private readonly cipher: PayloadCipher
  private readonly lastPushSeen = new Map<number, number>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private unsubscribe: (() => void) | null = null
  private stopped = false
  private readonly api: HoloRealtimeApi
  private readonly channelId: string
  private readonly callbacks: SpacePresenceCallbacks

  constructor(api: HoloRealtimeApi, channelId: string, key: string, user: RealtimeUser, callbacks: SpacePresenceCallbacks, app?: { version: string; protocol: number }) {
    this.api = api
    this.channelId = channelId
    this.callbacks = callbacks
    this.cipher = new PayloadCipher(key)
    this.awareness.setLocalState({ user, app, active: false, editing: null, pushed: null } satisfies SpaceAwarenessState)
    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
      if (origin === 'remote') {
        if (added.length > 0) this.schedulePush()
        // Un participant signale un envoi : on récupère sans attendre.
        // Le premier état reçu d'un participant ne compte pas : son envoi est
        // antérieur à notre arrivée, la synchronisation au démarrage l'a récupéré.
        let pushed: boolean | null = null
        for (const clientId of [...added, ...updated]) {
          const state = this.awareness.getStates().get(clientId) as SpaceAwarenessState | undefined
          const at = state?.pushed?.at ?? 0
          const previous = this.lastPushSeen.get(clientId)
          this.lastPushSeen.set(clientId, Math.max(previous ?? 0, at))
          if (previous !== undefined && at > previous) pushed = Boolean(pushed) || Boolean(state?.pushed?.structural)
        }
        for (const clientId of removed) this.lastPushSeen.delete(clientId)
        if (pushed !== null) this.callbacks.onRemotePush(pushed)
      } else if ([...added, ...updated, ...removed].includes(this.doc.clientID)) {
        this.schedulePush()
      }
      this.callbacks.onPeers(this.getPeers())
    })
  }

  async start() {
    this.unsubscribe = this.api.onEvent((event) => {
      if (event.documentId !== this.channelId || this.stopped) return
      if (event.type === 'ready') this.schedulePush()
      else if (event.type === 'awareness' && event.data.c !== String(this.doc.clientID)) {
        void this.cipher.open(event.data.a).then((update) => {
          if (update && !this.stopped) applyAwarenessUpdate(this.awareness, update, 'remote')
        })
      }
    })
    await this.api.subscribe(this.channelId)
  }

  setLocation(active: boolean, editing: string | null) {
    const state = this.awareness.getLocalState() as SpaceAwarenessState | null
    if (!state || (state.active === active && state.editing === editing)) return
    this.awareness.setLocalState({ ...state, active, editing })
  }

  /** À appeler après un envoi réussi au dépôt distant. */
  notifyPushed(structural: boolean) {
    this.awareness.setLocalStateField('pushed', { at: Date.now(), structural })
  }

  async stop() {
    if (this.stopped) return
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    removeAwarenessStates(this.awareness, [this.doc.clientID], 'leave')
    const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
    await this.cipher.seal(update)
      .then((awareness) => this.api.pushAwareness(this.channelId, { awareness, clientId: String(this.doc.clientID) }))
      .catch(() => undefined)
    this.unsubscribe?.()
    await this.api.unsubscribe(this.channelId).catch(() => undefined)
    this.awareness.destroy()
    this.doc.destroy()
  }

  private schedulePush() {
    if (this.timer || this.stopped) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.stopped) return
      const update = encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
      void this.cipher.seal(update)
        .then((awareness) => this.api.pushAwareness(this.channelId, { awareness, clientId: String(this.doc.clientID) }))
        .catch(() => undefined)
    }, AWARENESS_THROTTLE_MS)
  }

  private getPeers(): SpacePeer[] {
    const ownId = this.doc.clientID
    return Array.from(this.awareness.getStates().entries())
      .filter(([clientId, state]) => clientId !== ownId && Boolean((state as SpaceAwarenessState | null)?.user))
      .map(([clientId, state]) => {
        const presence = state as SpaceAwarenessState
        return {
          clientId,
          ...presence.user,
          version: presence.app?.version ?? null,
          protocol: presence.app?.protocol ?? null,
          active: Boolean(presence.active),
          editing: presence.editing ?? null,
        }
      })
  }
}
