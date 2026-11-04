import { useCallback, useEffect, useRef, useState } from 'react'
import { colorForUser, type RealtimePeer, type RealtimeStatus } from '../lib/realtime/types'
import { BlockSession } from '../lib/realtime/blockSession'
import type { SharedSnapshot } from '../lib/realtime/sharedModel'
import type { CaretAnchor } from '../lib/realtime/caretAnchor'
import { alignSnapshotIds, markdownToSnapshot } from '../parts/MarkdownEditor/lib/sharedSnapshot'
import { registerCloseTask, setHistoryOverride } from '../lib/editorFlush'
import { readLocalCursor } from '../lib/realtime/cursorDom'
import { registerDiagnosticSection, reportDiagnostic } from '../lib/diagnostics'

export type RealtimeDocumentState = {
  /** null : pas de session (temps réel désactivé ou document non partageable) */
  status: RealtimeStatus | null
  detail?: string
  peers: RealtimePeer[]
}

type Options = {
  filePath: string | null
  user: { name: string; email: string }
  /** Incrémenté quand la configuration du temps réel change */
  configRevision: number
  /** Photo de ce que l'éditeur affiche (blocs avec leurs identifiants) */
  getEditorSnapshot: () => SharedSnapshot
  /** Affiche et enregistre le document fusionné avec les modifications des autres (caret : nouvelle place du curseur) */
  applyRemoteSnapshot: (snapshot: SharedSnapshot, caret?: CaretAnchor | null) => void
  /** Curseur local dans le texte partagé */
  getLocalCaret?: () => CaretAnchor | null
  flushLocalEdits: () => Promise<void>
}

/**
 * Ouvre une session temps réel sur le document affiché (s'il appartient à un
 * dépôt git avec un distant et que le relais est configuré) et la ferme au
 * changement de document.
 */
export function useRealtimeDocument(options: Options) {
  const { filePath, user, configRevision } = options
  const [state, setState] = useState<RealtimeDocumentState>({ status: null, peers: [] })
  const sessionRef = useRef<BlockSession | null>(null)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    const api = window.holo?.realtime
    if (!filePath || !api) return
    let disposed = false
    let session: BlockSession | null = null

    void (async () => {
      const resolved = await api.resolveDocument(filePath).catch((error) => {
        reportDiagnostic('warn', 'realtime', 'Résolution du document impossible :', error)
        return null
      })
      if (disposed || !resolved?.available) {
        if (!disposed && resolved && !resolved.available) reportDiagnostic('info', 'realtime', `Document non partagé en direct (${resolved.reason}) : ${filePath}`)
        setState({ status: null, peers: [] })
        return
      }
      session = new BlockSession(
        api,
        { documentId: resolved.documentId, key: resolved.key },
        { name: user.name || user.email || 'Anonyme', email: user.email, color: colorForUser(user.email || user.name) },
        {
          getEditorSnapshot: () => optionsRef.current.getEditorSnapshot(),
          applyRemoteSnapshot: (snapshot, caret) => optionsRef.current.applyRemoteSnapshot(snapshot, caret),
          getLocalCaret: () => optionsRef.current.getLocalCaret?.() ?? null,
          alignIds: alignSnapshotIds,
          flushLocalEdits: () => optionsRef.current.flushLocalEdits(),
          getLocalModifiedAt: async () => {
            const stats = await window.holo?.getPathStats(filePath).catch(() => null)
            const time = stats ? Date.parse(stats.modifiedAt) : Number.NaN
            return Number.isFinite(time) ? time : null
          },
          getUpstreamSnapshot: async () => {
            const content = await api.getUpstreamContent(filePath)
            return content === null ? null : markdownToSnapshot(content)
          },
          onPeers: (peers) => { if (!disposed) setState((previous) => ({ ...previous, peers })) },
          onStatus: (status, detail) => { if (!disposed) setState((previous) => ({ ...previous, status, detail })) },
        },
      )
      sessionRef.current = session
      await session.start()
    })()
    // Départ annoncé à la fermeture de la fenêtre.
    const unregisterCloseTask = registerCloseTask(async () => {
      await session?.stop()
    })

    return () => {
      unregisterCloseTask()
      disposed = true
      if (session && sessionRef.current === session) sessionRef.current = null
      void session?.stop()
      setState({ status: null, peers: [] })
    }
    // configRevision : la session repart quand l'adresse ou le jeton du relais change.
  }, [filePath, user.name, user.email, configRevision])

  // En session, Ctrl/Cmd+Z annule nos propres modifications via Yjs. Aussi
  // pendant une reconnexion : la session reste valable (les modifications
  // partiront au retour du réseau), l'historique local de l'éditeur, lui,
  // ignore la session et réenverrait une version périmée.
  const sessionActive = state.status === 'live' || state.status === 'reconnecting'
  useEffect(() => {
    const session = sessionRef.current
    if (!sessionActive || !session) return
    setHistoryOverride({ undo: () => session.undo(), redo: () => session.redo() })
    return () => setHistoryOverride(null)
  }, [sessionActive])

  // Position de notre curseur, publiée dans la présence (les autres l'affichent).
  useEffect(() => {
    const session = sessionRef.current
    if (state.status !== 'live' || !session) return
    let frame: number | null = null
    const publish = () => {
      frame = null
      session.setLocalCursor(readLocalCursor())
    }
    const onSelectionChange = () => {
      if (frame === null) frame = requestAnimationFrame(publish)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    publish()
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [state.status])

  // Journal : changements d'état de la session ; rapport : état actuel.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })
  useEffect(() => {
    if (!state.status) return
    reportDiagnostic(state.status === 'error' || state.status === 'unauthorized' ? 'warn' : 'info', 'realtime', `Document ${filePath ?? ''} : ${state.status}${state.detail ? ` — ${state.detail}` : ''}`)
  }, [state.status, state.detail, filePath])
  useEffect(() => registerDiagnosticSection('Temps réel — document ouvert', () => {
    const current = stateRef.current
    return [
      `Document : ${filePath ?? '(aucun)'}`,
      `État : ${current.status ?? 'pas de session (document non partagé, ou temps réel désactivé)'}${current.detail ? ` — ${current.detail}` : ''}`,
      `Collègues vus : ${current.peers.length > 0 ? current.peers.map((peer) => `${peer.name} <${peer.email ?? ''}>${peer.cursor ? ` (bloc ${peer.cursor.block})` : ' (hors du texte)'}`).join(', ') : 'aucun'}`,
      `Participants de la session : ${sessionRef.current?.participants().join(', ') || '—'}`,
    ]
  }), [filePath])

  const onLocalSnapshot = useCallback((snapshot: SharedSnapshot) => {
    sessionRef.current?.onLocalSnapshot(snapshot)
  }, [])

  const onExternalChange = useCallback((base: SharedSnapshot, next: SharedSnapshot) => {
    sessionRef.current?.onExternalChange(base, next)
  }, [])

  /** Photo du document partagé (celle que l'éditeur affiche), ou null hors session. */
  const currentSnapshot = useCallback(() => sessionRef.current?.currentSnapshot() ?? null, [])

  const shouldApplyExternalChanges = useCallback(() => sessionRef.current?.shouldApplyExternalChanges() ?? true, [])
  const participants = useCallback(() => sessionRef.current?.participants() ?? [], [])

  return { ...state, onLocalSnapshot, onExternalChange, currentSnapshot, shouldApplyExternalChanges, participants }
}
