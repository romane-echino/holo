/**
 * alignSequences.spec.ts — Alignement de deux versions d'un document (blocs,
 * lignes ou colonnes de tableau) après une modification reçue.
 */
import { test, expect } from '@playwright/test'
import { alignSequences } from '../../src/lib/alignSequences'
import { multiSpliceDiff, rebaseText } from '../../src/lib/realtime/encoding'

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

test.describe('rebaseText', () => {
  test('saisie locale et modifications distantes ailleurs : les deux sont gardées', () => {
    const base = 'Para un.\n\nPara deux.\n\nPara trois.\n'
    const ours = base.replace('Para deux.', 'Para deux. bo12q')
    const theirs = base.replace('Para un.', 'Para un. al3q').replace('Para trois.', 'Para trois. ch9q')
    expect(rebaseText(base, ours, theirs)).toBe('Para un. al3q\n\nPara deux. bo12q\n\nPara trois. ch9q\n')
  })

  test('saisie à la suite d un texte modifié à distance dans le même paragraphe', () => {
    const base = 'Item un al1q\n'
    const ours = 'Item un al1q bo2q\n'
    const theirs = 'Item un al1q ch3q\n'
    const result = rebaseText(base, ours, theirs)
    expect(result).toContain('bo2q')
    expect(result).toContain('ch3q')
    expect(result.split('al1q').length - 1).toBe(1)
  })

  test('rien de local : le texte distant est rendu tel quel', () => {
    expect(rebaseText('a\n', 'a\n', 'a b\n')).toBe('a b\n')
  })
})

test.describe('multiSpliceDiff : blocs entiers rattachés au bloc précédent', () => {
  test('un paragraphe supprimé emporte la ligne vide qui le précède', () => {
    const before = 'Para un.\n\nbo2q al1\n\n| A | B |\n| --- | --- |\n'
    const after = 'Para un.\n\n| A | B |\n| --- | --- |\n'
    const splices = multiSpliceDiff(before, after)
    expect(splices).toEqual([{ index: 'Para un.'.length, remove: '\n\nbo2q al1'.length, insert: '' }])
  })

  test('un paragraphe inséré est rattaché à la fin du précédent', () => {
    const before = 'Para un.\n\n| A | B |\n'
    const after = 'Para un.\n\nal1q\n\n| A | B |\n'
    const splices = multiSpliceDiff(before, after)
    expect(splices).toEqual([{ index: 'Para un.'.length, remove: 0, insert: '\n\nal1q' }])
  })
})

test.describe('rebaseText : modification déjà présente', () => {
  test('une saisie déjà reçue par la session n est pas réappliquée (pas de doublon)', () => {
    const base = 'Para un.\n\nPara fin.\n'
    const ours = 'Para un.\n\nal47q\n\nPara fin.\n'
    const theirs = 'Para un.\n\nal47q\n\nch50q\n\nPara fin.\n'
    expect(rebaseText(base, ours, theirs)).toBe(theirs)
  })
})
