import { useEffect, useMemo, useState } from 'react'
import { absentEditors } from '../lib/realtime/absentEditors'
import type { SpacePeer } from '../lib/realtime/spacePresence'
import type { RealtimePeer } from '../lib/realtime/types'

/** Délai avant de signaler un collègue hors direct (le temps qu'il rejoigne la session). */
const GRACE_MS = 10_000

/**
 * Collègues qui ont le document ouvert sans être en direct avec nous, signalés
 * seulement si la situation dure (pas pendant qu'ils rejoignent la session).
 */
export function useAbsentEditors(input: {
  live: boolean
  livePeers: RealtimePeer[]
  spacePeers: SpacePeer[]
  rootPath: string | null
  documentPath: string | null
  self: string
}): SpacePeer[] {
  const { live, livePeers, spacePeers, rootPath, documentPath, self } = input
  const candidates = useMemo(
    () => (live && rootPath && documentPath ? absentEditors({ livePeers, spacePeers, rootPath, documentPath, self }) : []),
    [live, livePeers, spacePeers, rootPath, documentPath, self],
  )
  const key = candidates.map((peer) => (peer.email || peer.name).toLowerCase()).sort().join('|')
  const [settledKey, setSettledKey] = useState('')
  useEffect(() => {
    if (!key) return
    const timer = setTimeout(() => setSettledKey(key), GRACE_MS)
    return () => clearTimeout(timer)
  }, [key])
  return key && settledKey === key ? candidates : []
}
