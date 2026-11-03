/**
 * alignSequences.spec.ts — Alignement de deux versions d'un document (blocs,
 * lignes ou colonnes de tableau) après une modification reçue.
 */
import { test, expect } from '@playwright/test'
import { alignSequences } from '../../src/lib/alignSequences'
import { multiSpliceDiff } from '../../src/lib/realtime/encoding'

test.describe('alignSequences', () => {
  test('séquences identiques : tout est apparié à l identique', () => {
    expect(alignSequences(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual({ matches: [0, 1, 2], exact: [true, true, true] })
  })

  test('un élément inséré au-dessus ne décale pas les suivants', () => {
    const { matches, exact } = alignSequences(['a', 'b', 'c'], ['nouveau', 'a', 'b', 'c'])
    expect(matches).toEqual([-1, 0, 1, 2])
    expect(exact).toEqual([false, true, true, true])
  })

  test('un élément supprimé au milieu', () => {
    expect(alignSequences(['a', 'b', 'c'], ['a', 'c']).matches).toEqual([0, 2])
  })

  test('un élément modifié reste apparié (même élément, contenu changé)', () => {
    const { matches, exact } = alignSequences(['a', 'b', 'c'], ['a', 'b2', 'c'])
    expect(matches).toEqual([0, 1, 2])
    expect(exact).toEqual([true, false, true])
  })

  test('modifié et inséré au même endroit : l ancien est apparié au premier compatible', () => {
    const types = { b: 'p', b2: 'p', t: 'table' } as Record<string, string>
    const previous = ['a', 'b', 'c']
    const next = ['a', 't', 'b2', 'c']
    const { matches, exact } = alignSequences(previous, next, (i, j) => types[previous[i]] === types[next[j]])
    expect(matches).toEqual([0, -1, 1, 2])
    expect(exact).toEqual([true, false, false, true])
  })

  test('éléments de types incompatibles : pas d appariement', () => {
    const previous = ['p:x']
    const next = ['table:y']
    expect(alignSequences(previous, next, (i, j) => previous[i].split(':')[0] === next[j].split(':')[0]).matches).toEqual([-1])
  })

  test('doublons : les appariements respectent l ordre des deux versions', () => {
    const { matches, exact } = alignSequences(['x', 'x', 'y'], ['x', 'y', 'x', 'x'])
    const paired = matches.filter((match) => match !== -1)
    expect(paired).toEqual([...paired].sort((left, right) => left - right))
    expect(new Set(paired).size).toBe(paired.length)
    expect(exact.filter(Boolean).length).toBe(2)
  })

  test('grandes séquences : reste linéaire hors zone modifiée', () => {
    const previous = Array.from({ length: 5000 }, (_, index) => `bloc ${index}`)
    const next = [...previous.slice(0, 2500), 'inséré', ...previous.slice(2500)]
    const started = Date.now()
    const { matches } = alignSequences(previous, next)
    expect(Date.now() - started).toBeLessThan(200)
    expect(matches[2500]).toBe(-1)
    expect(matches[2501]).toBe(2500)
    expect(matches[5000]).toBe(4999)
  })
})


function applySplices(text: string, splices: Array<{ index: number; remove: number; insert: string }>): string {
  let result = text
  for (const splice of [...splices].reverse()) {
    result = result.slice(0, splice.index) + splice.insert + result.slice(splice.index + splice.remove)
  }
  return result
}

test.describe('multiSpliceDiff', () => {
  test('deux modifications éloignées donnent deux zones, le texte entre les deux est intact', () => {
    const before = ['# Titre', '', 'Introduction.', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', '', '- Point 1', ''].join('\n')
    const after = before.replace('Introduction.', 'Introduction. Merci.').replace('- Point 1', '- Point 1 validé')
    const splices = multiSpliceDiff(before, after)
    expect(splices).toHaveLength(2)
    expect(applySplices(before, splices)).toBe(after)
    // Le tableau, entre les deux, n'est couvert par aucune zone.
    const tableStart = before.indexOf('| a |')
    const tableEnd = before.indexOf('- Point 1')
    for (const splice of splices) {
      expect(splice.index + splice.remove <= tableStart || splice.index >= tableEnd).toBe(true)
    }
  })

  test('fuzz : appliquer les zones redonne toujours le texte cible', () => {
    let seed = 42
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const words = ['Budget', 'é', '|', '\n', '\n\n', '- ', '# ', 'Chloé', '😀', ' ', 'x']
    for (let round = 0; round < 500; round += 1) {
      let before = ''
      for (let index = 0; index < 40; index += 1) before += words[Math.floor(random() * words.length)]
      let after = before
      const edits = 1 + Math.floor(random() * 4)
      for (let edit = 0; edit < edits; edit += 1) {
        const position = Math.floor(random() * (after.length + 1))
        const remove = Math.floor(random() * 4)
        after = after.slice(0, position) + words[Math.floor(random() * words.length)] + after.slice(position + remove)
      }
      const splices = multiSpliceDiff(before, after)
      expect(applySplices(before, splices)).toBe(after)
      for (let index = 1; index < splices.length; index += 1) {
        expect(splices[index].index).toBeGreaterThanOrEqual(splices[index - 1].index + splices[index - 1].remove)
      }
    }
  })
})
