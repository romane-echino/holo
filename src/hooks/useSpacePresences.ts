import { useEffect, useMemo, useRef, useState } from 'react'
import { SpacePresence, type SpacePeer } from '../lib/realtime/spacePresence'
import { colorForUser } from '../lib/realtime/types'
import { registerCloseTask } from '../lib/editorFlush'
import { registerDiagnosticSection, reportDiagnostic } from '../lib/diagnostics'

/**
 * Au plus autant de canaux de présence d'espace ouverts en même temps : chacun
 * garde un flux ouvert vers le relais (l'espace affiché passe toujours en premier).
 */
const MAX_SPACE_CHANNELS = 4

type Options = {
  /** Espaces de la barre latérale ayant un dépôt distant */
  spaces: string[]
  /** Espace affiché */
  activeRoot: string | null
  /** Document ouvert (chemin absolu) */
  editingFilePath: string | null
  user: { name: string; email: string }
  /** Incrémenté quand la configuration du temps réel change */
  configRevision: number
  /** Un participant de l'espace vient d'envoyer des modifications au dépôt */
  onRemotePush: (rootPath: string, structural: boolean) => void
}

export function normalizeSpacePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

/**
 * Même dossier d'espace, quelle que soit l'écriture du chemin : séparateurs,
 * « / » final, casse sous Windows, accents composés ou décomposés.
 */
export function sameSpacePath(left: string, right: string): boolean {
  const a = normalizeSpacePath(left).normalize('NFC')
  const b = normalizeSpacePath(right).normalize('NFC')
  return /^[a-z]:\//i.test(a) ? a.toLowerCase() === b.toLowerCase() : a === b
}

/** Présences de l'espace `rootPath`, même si sa clé est écrite autrement. */
export function peersForSpace<T>(peersBySpace: Record<string, T[]>, rootPath: string): T[] | undefined {
  if (peersBySpace[rootPath]) return peersBySpace[rootPath]
  const key = Object.keys(peersBySpace).find((candidate) => sameSpacePath(candidate, rootPath))
  return key ? peersBySpace[key] : undefined
}

/** Chemin relatif (séparateurs « / ») de `filePath` dans `rootPath`, ou null s'il n'en fait pas partie. */
export function relativeSpacePath(rootPath: string, filePath: string): string | null {
  const root = normalizeSpacePath(rootPath).normalize('NFC')
  const file = normalizeSpacePath(filePath).normalize('NFC')
  const caseInsensitive = /^[a-z]:\//i.test(root)
  const [rootKey, fileKey] = caseInsensitive ? [root.toLowerCase(), file.toLowerCase()] : [root, file]
  return fileKey.startsWith(`${rootKey}/`) ? file.slice(root.length + 1) : null
}

/**
 * Présence dans les espaces : qui est dans quel espace et sur quel document.
 * Chaque espace partagé (dépôt git avec un distant) a son canal chiffré sur le
 * relais ; nos envois git y sont signalés pour que les autres récupèrent aussitôt.
 */
export function useSpacePresences(options: Options): Record<string, SpacePeer[]> {
  const { activeRoot, editingFilePath, user, configRevision } = options
  const [peersBySpace, setPeersBySpace] = useState<Record<string, SpacePeer[]>>({})
  const presencesRef = useRef(new Map<string, SpacePresence>())
  /** État de chaque canal, pour le diagnostic */
  const channelStatesRef = useRef(new Map<string, string>())
  const [presenceRevision, setPresenceRevision] = useState(0)
  const onRemotePushRef = useRef(options.onRemotePush)
  useEffect(() => {
    onRemotePushRef.current = options.onRemotePush
  })

  const spacesKey = options.spaces.join('\n')
  const channels = useMemo(() => {
    const spaces = spacesKey ? spacesKey.split('\n') : []
    const active = activeRoot ? spaces.find((space) => sameSpacePath(space, activeRoot)) : undefined
    const ordered = active ? [active, ...spaces.filter((space) => space !== active)] : spaces
    return ordered.slice(0, MAX_SPACE_CHANNELS)
  }, [spacesKey, activeRoot])

  // Ouvre et ferme les canaux selon la liste d'espaces. L'identité ou l'adresse
  // du relais qui change les rouvre tous.
  const identityKey = `${user.name}\n${user.email}\n${configRevision}`
  const identityRef = useRef(identityKey)
  useEffect(() => {
    const api = window.holo?.realtime
    if (!api) return
    const presences = presencesRef.current
    if (identityRef.current !== identityKey) {
      identityRef.current = identityKey
      for (const presence of presences.values()) void presence.stop()
      presences.clear()
      setPeersBySpace({})
    }
    let disposed = false
    const wanted = new Set(channels)
    for (const [rootPath, presence] of Array.from(presences.entries())) {
      if (wanted.has(rootPath)) continue
      presences.delete(rootPath)
      void presence.stop()
      setPeersBySpace((previous) => {
        const next = { ...previous }
        delete next[rootPath]
        return next
      })
    }
    const [name, email] = identityKey.split('\n')
    const channelStates = channelStatesRef.current
    for (const rootPath of Array.from(channelStates.keys())) if (!wanted.has(rootPath)) channelStates.delete(rootPath)
    for (const rootPath of channels) {
      if (presences.has(rootPath)) continue
      channelStates.set(rootPath, 'résolution…')
      void api.resolveSpace(rootPath).catch((error) => {
        channelStates.set(rootPath, `échec de la résolution : ${error instanceof Error ? error.message : String(error)}`)
        reportDiagnostic('warn', 'presence', `Espace ${rootPath} : résolution impossible`, error)
        return null
      }).then(async (resolved) => {
        if (resolved && !resolved.available) {
          channelStates.set(rootPath, `pas de présence (${resolved.reason})`)
          reportDiagnostic('info', 'presence', `Espace ${rootPath} : pas de présence (${resolved.reason})`)
        }
        if (disposed || !resolved?.available || presences.has(rootPath)) return
        const presence = new SpacePresence(
          api,
          resolved.documentId,
          resolved.key,
          { name: name || email || 'Anonyme', email, color: colorForUser(email || name) },
          {
            onPeers: (peers) => {
              if (presencesRef.current.get(rootPath) !== presence) return
              setPeersBySpace((previous) => ({ ...previous, [rootPath]: peers }))
            },
            onRemotePush: (structural) => onRemotePushRef.current(rootPath, structural),
          },
        )
        presences.set(rootPath, presence)
        setPresenceRevision((revision) => revision + 1)
        channelStates.set(rootPath, `canal ${resolved.documentId.slice(0, 8)} ouvert`)
        await presence.start().catch((error) => {
          channelStates.set(rootPath, `canal ${resolved.documentId.slice(0, 8)} : échec du démarrage (${error instanceof Error ? error.message : String(error)})`)
          reportDiagnostic('warn', 'presence', `Espace ${rootPath} : démarrage de la présence impossible`, error)
        })
      })
    }
    return () => {
      disposed = true
    }
  }, [channels, identityKey])

  // Fermeture de tous les canaux au démontage, et départ annoncé à la
  // fermeture de la fenêtre.
  useEffect(() => {
    const presences = presencesRef.current
    const unregister = registerCloseTask(async () => {
      await Promise.allSettled(Array.from(presences.values()).map((presence) => presence.stop()))
    })
    return () => {
      unregister()
      for (const presence of presences.values()) void presence.stop()
      presences.clear()
    }
  }, [])

  // Espace affiché et document ouvert, publiés dans chaque canal.
  useEffect(() => {
    for (const [rootPath, presence] of presencesRef.current) {
      const editing = editingFilePath ? relativeSpacePath(rootPath, editingFilePath) : null
      presence.setLocation(activeRoot !== null && sameSpacePath(rootPath, activeRoot), editing)
    }
  }, [activeRoot, editingFilePath, presenceRevision])

  // Nos envois git, signalés aux autres membres de l'espace.
  useEffect(() => {
    const holo = window.holo
    if (!holo?.onGitPushed) return
    return holo.onGitPushed(({ rootPath, structural }) => {
      const pushedRoot = normalizeSpacePath(rootPath)
      for (const [spaceRoot, presence] of presencesRef.current) {
        if (normalizeSpacePath(spaceRoot) === pushedRoot) presence.notifyPushed(structural)
      }
    })
  }, [])

  // Rapport : canaux ouverts, ce que nous publions, ce que nous voyons.
  const reportRef = useRef({ peersBySpace, activeRoot, editingFilePath, channels })
  useEffect(() => {
    reportRef.current = { peersBySpace, activeRoot, editingFilePath, channels }
  })
  useEffect(() => registerDiagnosticSection('Présence dans les espaces', () => {
    const current = reportRef.current
    const lines = [
      `Espace affiché : ${current.activeRoot ?? '(aucun)'}`,
      `Document ouvert : ${current.editingFilePath ?? '(aucun)'}`,
      `Espaces partagés suivis (${MAX_SPACE_CHANNELS} au plus) : ${current.channels.length}`,
    ]
    for (const rootPath of current.channels) {
      const peers = current.peersBySpace[rootPath] ?? []
      const publishedActive = current.activeRoot !== null && sameSpacePath(rootPath, current.activeRoot)
      const publishedEditing = current.editingFilePath ? relativeSpacePath(rootPath, current.editingFilePath) : null
      lines.push(
        `- ${rootPath} : ${channelStatesRef.current.get(rootPath) ?? 'inconnu'}`,
        `  publié : ${publishedActive ? 'dans l\'espace' : 'hors de l\'espace'}${publishedEditing ? `, sur ${publishedEditing}` : ''}`,
        `  vus : ${peers.length > 0 ? peers.map((peer) => `${peer.name} <${peer.email ?? ''}> (${peer.active ? 'dans l\'espace' : 'ailleurs'}${peer.editing ? `, sur ${peer.editing}` : ''})`).join(', ') : 'personne'}`,
      )
    }
    return lines
  }), [])

  return peersBySpace
}
