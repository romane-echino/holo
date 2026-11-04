/** Participants d'une session d'édition en temps réel. */
export type RealtimeUser = { name: string; email: string; color: string }
/** Position du curseur : bloc (rang dans le document), champ éditable du bloc (ex. cellule), position dans son texte */
export type RealtimeCursor = { block: number; field: number; offset: number }
export type RealtimePeer = RealtimeUser & { clientId: number; cursor: RealtimeCursor | null }
export type RealtimeStatus = 'connecting' | 'joining' | 'live' | 'reconnecting' | 'unauthorized' | 'error' | 'stopped'

/** Couleur stable d'un participant, dérivée de son e-mail. */
export function colorForUser(seed: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 70% 62%)`
}
