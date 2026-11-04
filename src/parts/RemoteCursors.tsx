import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { RealtimePeer } from '../lib/realtime/types'
import { REVEAL_PEER_EVENT, cursorFieldFrame, locateCursorField, locateCursorRect } from '../lib/realtime/cursorDom'
import { peerInitials } from '../lib/realtime/peers'
import { cn } from '../utils/global'

type Box = { left: number; top: number; width: number; height: number }
type PlacedCursor = {
  peer: RealtimePeer
  left: number
  top: number
  height: number
  /** Bloc, cellule ou élément de liste où se trouve le participant */
  frame: Box & { cell: boolean } | null
  /** Rang parmi les participants du même bloc (décale cadre et pastille) */
  stack: number
}

const LABEL_VISIBLE_MS = 2500
const REVEAL_MS = 1500

/**
 * Curseurs des autres participants, dessinés par-dessus le document : une
 * barre à leur couleur et, quand ils viennent de bouger, leur prénom ; le
 * bloc (ou la cellule, l'élément de liste) où ils se trouvent est encadré à
 * leur couleur, avec leurs initiales.
 */
export function RemoteCursors({ peers, containerRef }: { peers: RealtimePeer[]; containerRef: RefObject<HTMLElement | null> }) {
  const [placed, setPlaced] = useState<PlacedCursor[]>([])
  const [recentlyMoved, setRecentlyMoved] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const lastCursorsRef = useRef(new Map<number, string>())

  // Prénom affiché quelques secondes après chaque déplacement.
  useEffect(() => {
    const moved: number[] = []
    for (const peer of peers) {
      const key = peer.cursor ? `${peer.cursor.blockId ?? peer.cursor.block}:${peer.cursor.field}:${peer.cursor.offset}` : ''
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

  // Clic sur un avatar : cadre accentué et prénom affichés un instant.
  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const onReveal = (event: Event) => {
      const clientId = (event as CustomEvent<{ clientId: number }>).detail?.clientId
      if (clientId === undefined) return
      const add = (previous: Set<number>) => new Set([...previous, clientId])
      const remove = (previous: Set<number>) => {
        const next = new Set(previous)
        next.delete(clientId)
        return next
      }
      setRevealed(add)
      setRecentlyMoved(add)
      const timer = setTimeout(() => {
        timers.delete(timer)
        setRevealed(remove)
        setRecentlyMoved(remove)
      }, REVEAL_MS)
      timers.add(timer)
    }
    window.addEventListener(REVEAL_PEER_EVENT, onReveal)
    return () => {
      window.removeEventListener(REVEAL_PEER_EVENT, onReveal)
      for (const timer of timers) clearTimeout(timer)
    }
  }, [])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const withCursor = peers.filter((peer) => peer.cursor)
    const place = () => {
      const origin = container.getBoundingClientRect()
      const stacks = new Map<HTMLElement, number>()
      setPlaced(withCursor.flatMap((peer) => {
        const rect = locateCursorRect(peer.cursor!)
        if (!rect) return []
        const field = locateCursorField(peer.cursor!)
        const frameElement = field ? cursorFieldFrame(field) : null
        const stack = frameElement ? stacks.get(frameElement) ?? 0 : 0
        if (frameElement) stacks.set(frameElement, stack + 1)
        const box = frameElement?.getBoundingClientRect()
        const frame = box && box.width > 0 && box.height > 0
          ? { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height, cell: frameElement!.matches('td, th') }
          : null
        return [{ peer, left: rect.left - origin.left, top: rect.top - origin.top, height: rect.height || 20, frame, stack }]
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
      {placed.map(({ peer, frame, stack }) => {
        if (!frame) return null
        // Un peu d'air autour d'un paragraphe ; une cellule est encadrée au ras.
        const padX = frame.cell ? 0 : 8
        const padY = frame.cell ? 0 : 4
        const inset = stack * 3
        return (
          <div
            key={`frame-${peer.clientId}`}
            className={cn(
              'absolute rounded-lg border-2 transition-[left,top,width,height,opacity] duration-150',
              revealed.has(peer.clientId) ? 'opacity-100' : 'opacity-45',
            )}
            style={{
              left: frame.left - padX + inset,
              top: frame.top - padY + inset,
              width: frame.width + padX * 2 - inset * 2,
              height: frame.height + padY * 2 - inset * 2,
              borderColor: peer.color,
            }}
            data-remote-block={peer.name}
          >
            <span
              className="absolute -top-2.5 rounded-full px-1.5 text-[9px] font-semibold leading-4 text-black/80 shadow-sm"
              style={{ right: 8 + stack * 26, backgroundColor: peer.color }}
            >
              {peerInitials(peer.name)}
            </span>
          </div>
        )
      })}
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
