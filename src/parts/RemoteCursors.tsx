import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { RealtimePeer } from '../lib/realtime/types'
import { locateCursorRect } from '../lib/realtime/cursorDom'

type PlacedCursor = { peer: RealtimePeer; left: number; top: number; height: number }

const LABEL_VISIBLE_MS = 2500

/**
 * Curseurs des autres participants, dessinés par-dessus le document : une
 * barre à leur couleur et, quand ils viennent de bouger, leur prénom.
 */
export function RemoteCursors({ peers, containerRef }: { peers: RealtimePeer[]; containerRef: RefObject<HTMLElement | null> }) {
  const [placed, setPlaced] = useState<PlacedCursor[]>([])
  const [recentlyMoved, setRecentlyMoved] = useState<Set<number>>(new Set())
  const lastCursorsRef = useRef(new Map<number, string>())

  // Prénom affiché quelques secondes après chaque déplacement.
  useEffect(() => {
    const moved: number[] = []
    for (const peer of peers) {
      const key = peer.cursor ? `${peer.cursor.block}:${peer.cursor.field}:${peer.cursor.offset}` : ''
      if (key && lastCursorsRef.current.get(peer.clientId) !== key) moved.push(peer.clientId)
      lastCursorsRef.current.set(peer.clientId, key)
    }
    if (moved.length === 0) return
    setRecentlyMoved((previous) => new Set([...previous, ...moved]))
    const timer = setTimeout(() => {
      setRecentlyMoved((previous) => {
        const next = new Set(previous)
        for (const id of moved) next.delete(id)
        return next
      })
    }, LABEL_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [peers])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const withCursor = peers.filter((peer) => peer.cursor)
    const place = () => {
      const origin = container.getBoundingClientRect()
      setPlaced(withCursor.flatMap((peer) => {
        const rect = locateCursorRect(peer.cursor!)
        if (!rect) return []
        return [{ peer, left: rect.left - origin.left, top: rect.top - origin.top, height: rect.height || 20 }]
      }))
    }
    place()
    if (withCursor.length === 0) return
    // Le texte bouge (saisie, mise à jour reçue, images) : on replace les curseurs.
    let frame: number | null = null
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; place() })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(container, { subtree: true, childList: true, characterData: true })
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(container)
    return () => {
      observer.disconnect()
      resizeObserver.disconnect()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [peers, containerRef])

  if (placed.length === 0) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden data-testid="remote-cursors">
      {placed.map(({ peer, left, top, height }) => (
        <div
          key={peer.clientId}
          className="absolute transition-[left,top] duration-75"
          style={{ left, top, height }}
          data-remote-cursor={peer.name}
        >
          <div className="h-full w-0.5 rounded-full" style={{ backgroundColor: peer.color }} />
          <div
            className={`absolute -top-5 left-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none text-black/80 shadow-sm transition-opacity duration-300 ${recentlyMoved.has(peer.clientId) ? 'opacity-100' : 'opacity-0'}`}
            style={{ backgroundColor: peer.color }}
          >
            {peer.name.split(/\s+/)[0]}
          </div>
        </div>
      ))}
    </div>
  )
}
