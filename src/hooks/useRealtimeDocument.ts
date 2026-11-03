import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeSession, colorForUser, type RealtimePeer, type RealtimeStatus } from '../lib/realtime/session'
import { setHistoryOverride } from '../lib/editorFlush'
import { readLocalCursor } from '../lib/realtime/cursorDom'

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
  getEditorMarkdown: () => string
  applyRemoteMarkdown: (markdown: string) => void
  flushLocalEdits: () => Promise<void>
  normalizeMarkdown: (markdown: string) => string
}

/**
 * Ouvre une session temps réel sur le document affiché (s'il appartient à un
 * dépôt git avec un distant et que le relais est configuré) et la ferme au
 * changement de document.
 */
export function useRealtimeDocument(options: Options) {
  const { filePath, user, configRevision } = options
  const [state, setState] = useState<RealtimeDocumentState>({ status: null, peers: [] })
  const sessionRef = useRef<RealtimeSession | null>(null)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(() => {
    const api = window.holo?.realtime
    if (!filePath || !api) return
    let disposed = false
    let session: RealtimeSession | null = null

    void (async () => {
      const resolved = await api.resolveDocument(filePath).catch(() => null)
      if (disposed || !resolved?.available) {
        setState({ status: null, peers: [] })
        return
      }
      session = new RealtimeSession(
        api,
        { documentId: resolved.documentId, key: resolved.key },
        { name: user.name || user.email || 'Anonyme', email: user.email, color: colorForUser(user.email || user.name) },
        {
          getEditorMarkdown: () => optionsRef.current.getEditorMarkdown(),
          applyRemoteMarkdown: (markdown) => optionsRef.current.applyRemoteMarkdown(markdown),
          flushLocalEdits: () => optionsRef.current.flushLocalEdits(),
          getUpstreamMarkdown: async () => {
            const content = await api.getUpstreamContent(filePath)
            return content === null ? null : optionsRef.current.normalizeMarkdown(content)
          },
          mergeText: (base, ours, theirs) => api.mergeText(base, ours, theirs),
          onPeers: (peers) => { if (!disposed) setState((previous) => ({ ...previous, peers })) },
          onStatus: (status, detail) => { if (!disposed) setState((previous) => ({ ...previous, status, detail })) },
        },
      )
      sessionRef.current = session
      await session.start()
    })()

    return () => {
      disposed = true
      if (session && sessionRef.current === session) sessionRef.current = null
      void session?.stop()
      setState({ status: null, peers: [] })
    }
    // configRevision : la session repart quand l'adresse ou le jeton du relais change.
  }, [filePath, user.name, user.email, configRevision])

  // En session, Ctrl/Cmd+Z annule nos propres modifications via Yjs.
  useEffect(() => {
    const session = sessionRef.current
    if (state.status !== 'live' || !session) return
    setHistoryOverride({ undo: () => session.undo(), redo: () => session.redo() })
    return () => setHistoryOverride(null)
  }, [state.status])

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

  const onLocalMarkdown = useCallback((markdown: string) => {
    sessionRef.current?.onLocalMarkdown(markdown)
  }, [])

  const shouldApplyExternalChanges = useCallback(() => sessionRef.current?.shouldApplyExternalChanges() ?? true, [])

  return { ...state, onLocalMarkdown, shouldApplyExternalChanges }
}
