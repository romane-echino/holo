import { relativeSpacePath } from '../../hooks/useSpacePresences'
import type { SpacePeer } from './spacePresence'
import { uniquePeers } from './peers'
import { REALTIME_PROTOCOL, type RealtimePeer } from './types'

/**
 * Collègues qui ont le document ouvert (vus par la présence de l'espace) sans
 * être dans notre session en direct : version de Holo incompatible, temps
 * réel désactivé chez eux, ou connexion en cours.
 */
export function absentEditors(input: {
  livePeers: RealtimePeer[]
  spacePeers: SpacePeer[]
  rootPath: string
  documentPath: string
  /** Notre adresse (ou nom), jamais signalée */
  self: string
}): SpacePeer[] {
  const relative = relativeSpacePath(input.rootPath, input.documentPath)
  if (!relative) return []
  const identity = (peer: { name: string; email?: string }) => (peer.email || peer.name).toLowerCase()
  const live = new Set(input.livePeers.map(identity))
  const self = input.self.toLowerCase()
  return uniquePeers(input.spacePeers.filter((peer) => peer.editing === relative && identity(peer) !== self && !live.has(identity(peer))))
}

/** Pourquoi ce collègue n'est pas en direct, d'après ce que publie sa présence. */
export function absenceReason(peer: SpacePeer): string {
  if (peer.protocol === null) return 'sa version de Holo est antérieure à la 0.9.4 : en 0.8 ou avant, il doit mettre Holo à jour ; sinon, son temps réel est peut-être désactivé'
  if (peer.protocol !== REALTIME_PROTOCOL) return `sa version de Holo (${peer.version || 'inconnue'}) n'utilise pas le même format ; il faut que tout le monde soit à jour`
  return 'le temps réel est désactivé chez lui, ou sa connexion est en cours'
}
