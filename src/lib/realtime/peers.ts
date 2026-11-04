type PeerIdentity = { name: string; email?: string }

export function peerInitials(name: string): string {
  return name.trim().split(/\s+/).map((part) => part[0] ?? '').slice(0, 2).join('').toUpperCase() || '?'
}

/**
 * Présent dans l'espace : il l'affiche, ou il a l'un de ses documents ouvert.
 * Le second critère rattrape un « espace affiché » mal reconnu chez lui.
 */
export function isInSpace(peer: { active: boolean; editing: string | null }): boolean {
  return peer.active || peer.editing !== null
}

/** Une personne n'apparaît qu'une fois, même avec plusieurs fenêtres ouvertes. */
export function uniquePeers<T extends PeerIdentity>(peers: T[]): T[] {
  const seen = new Set<string>()
  return peers.filter((peer) => {
    const key = (peer.email || peer.name).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
