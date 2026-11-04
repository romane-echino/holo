import { useEffect, useMemo, useRef, useState } from 'react'
import { SpacePresence, type SpacePeer } from '../lib/realtime/spacePresence'
import { colorForUser } from '../lib/realtime/types'
import { registerCloseTask } from '../lib/editorFlush'

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

/** Chemin relatif (séparateurs « / ») de `filePath` dans `rootPath`, ou null s'il n'en fait pas partie. */
export function relativeSpacePath(rootPath: string, filePath: string): string | null {
  const root = normalizeSpacePath(rootPath)
  const file = normalizeSpacePath(filePath)
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
  const [presenceRevision, setPresenceRevision] = useState(0)
  const onRemotePushRef = useRef(options.onRemotePush)
  useEffect(() => {
    onRemotePushRef.current = options.onRemotePush
  })

  const spacesKey = options.spaces.join('\n')
  const channels = useMemo(() => {
    const spaces = spacesKey ? spacesKey.split('\n') : []
    const ordered = activeRoot && spaces.includes(activeRoot)
      ? [activeRoot, ...spaces.filter((space) => space !== activeRoot)]
      : spaces
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
    for (const rootPath of channels) {
      if (presences.has(rootPath)) continue
      void api.resolveSpace(rootPath).catch(() => null).then(async (resolved) => {
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
        await presence.start().catch(() => undefined)
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
      presence.setLocation(rootPath === activeRoot, editing)
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

  return peersBySpace
}
