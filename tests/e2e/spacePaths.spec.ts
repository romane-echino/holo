/**
 * spacePaths.spec.ts — Reconnaître un même dossier d'espace malgré les
 * variantes d'écriture de son chemin, et qui est présent dans un espace.
 */
import { test, expect } from '@playwright/test'
import { peersForSpace, relativeSpacePath, sameSpacePath } from '../../src/hooks/useSpacePresences'
import { isInSpace } from '../../src/lib/realtime/peers'
import { absenceReason, absentEditors } from '../../src/lib/realtime/absentEditors'
import type { SpacePeer } from '../../src/lib/realtime/spacePresence'

test.describe('Chemins d espace', () => {
  test('même dossier : séparateurs, « / » final, casse sous Windows, accents', () => {
    expect(sameSpacePath('/Users/r/Doc/common', '/Users/r/Doc/common/')).toBe(true)
    expect(sameSpacePath('C:\\Users\\R\\Doc\\common', 'c:/users/r/doc/common')).toBe(true)
    // Accent composé (Windows, git) ou décomposé (certains chemins macOS).
    expect(sameSpacePath('/Users/r/Fiches employés', '/Users/r/Fiches employe\u0301s')).toBe(true)
    // Sous macOS et Linux, la casse compte.
    expect(sameSpacePath('/Users/r/Doc/common', '/Users/r/doc/common')).toBe(false)
    expect(sameSpacePath('/Users/r/Doc/common', '/Users/r/Doc/common2')).toBe(false)
  })

  test('chemin relatif d un document, accents compris', () => {
    expect(relativeSpacePath('/Users/r/Doc/common', '/Users/r/Doc/common/Fiches employe\u0301s/a.md')).toBe('Fiches employés/a.md')
    expect(relativeSpacePath('C:\\Docs\\Common', 'c:\\docs\\common\\notes\\b.md')).toBe('notes/b.md')
    expect(relativeSpacePath('/Users/r/Doc/common', '/Users/r/Doc/other/a.md')).toBeNull()
  })

  test('présences d un espace retrouvées même si sa clé est écrite autrement', () => {
    const peers = { '/Users/r/Doc/common': ['alice'] }
    expect(peersForSpace(peers, '/Users/r/Doc/common/')).toEqual(['alice'])
    expect(peersForSpace(peers, '/Users/r/Doc/autre')).toBeUndefined()
  })

  test('présent dans l espace : il l affiche, ou il a l un de ses documents ouvert', () => {
    expect(isInSpace({ active: true, editing: null })).toBe(true)
    expect(isInSpace({ active: false, editing: 'notes/a.md' })).toBe(true)
    expect(isInSpace({ active: false, editing: null })).toBe(false)
  })

  test('collègue qui a le document ouvert sans être en direct : signalé, avec la raison', () => {
    const peer = (clientId: number, name: string, editing: string | null, version: string | null, protocol: number | null): SpacePeer => ({
      clientId, name, email: `${name.toLowerCase()}@example.com`, color: '#888', active: true, editing, version, protocol,
    })
    const spacePeers = [
      peer(1, 'Bob', 'notes/a.md', '0.9.4', 2), // en direct avec nous
      peer(2, 'Chloe', 'notes/a.md', null, null), // ancienne version
      peer(3, 'Dan', 'notes/b.md', '0.9.4', 2), // autre document
      peer(4, 'Moi', 'notes/a.md', '0.9.4', 2), // nous-même (autre fenêtre)
    ]
    const livePeers = [{ clientId: 9, name: 'Bob', email: 'BOB@example.com', color: '#888', cursor: null }]
    const absent = absentEditors({ livePeers, spacePeers, rootPath: '/r', documentPath: '/r/notes/a.md', self: 'moi@example.com' })
    expect(absent.map((entry) => entry.name)).toEqual(['Chloe'])
    expect(absenceReason(absent[0])).toContain('0.9.4')
    expect(absenceReason(peer(5, 'Eve', 'notes/a.md', '0.8.0', 1))).toContain('0.8.0')
    expect(absenceReason(peer(6, 'Fred', 'notes/a.md', '0.9.4', 2))).toContain('temps réel est désactivé')
  })
})
