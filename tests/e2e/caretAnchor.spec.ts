/**
 * caretAnchor.spec.ts — Curseur à l'écran ↔ position dans le markdown partagé
 */
import { test, expect } from '@playwright/test'
import { markdownIndexOf, visibleOffsetOf } from '../../src/lib/realtime/caretAnchor'

test.describe('Curseur ↔ markdown', () => {
  const cases: Array<{ name: string; visible: string; markdown: string; offset: number; index: number }> = [
    { name: 'texte simple', visible: 'bo13q ch13q', markdown: 'bo13q ch13q', offset: 6, index: 6 },
    { name: 'titre', visible: 'Titre', markdown: '## Titre', offset: 2, index: 5 },
    { name: 'gras', visible: 'un gras ici', markdown: 'un **gras** ici', offset: 7, index: 9 },
    { name: 'échappement', visible: '1* étoile', markdown: '1\\* étoile', offset: 2, index: 3 },
    { name: 'espaces encodés', visible: 'fin  ', markdown: 'fin&#x20; ', offset: 4, index: 9 },
    { name: 'lien', visible: 'voir le site puis', markdown: 'voir [le site](https://x.com) puis', offset: 13, index: 30 },
    { name: 'espace insécable', visible: 'a b', markdown: 'a b', offset: 2, index: 2 },
  ]
  for (const entry of cases) {
    test(entry.name, () => {
      expect(markdownIndexOf(entry.visible, entry.markdown, entry.offset)).toBe(entry.index)
      expect(visibleOffsetOf(entry.visible, entry.markdown, entry.index)).toBe(entry.offset)
    })
  }

  test('début et fin du texte', () => {
    expect(markdownIndexOf('Titre', '## Titre', 0)).toBe(3)
    expect(markdownIndexOf('Titre', '## Titre', 5)).toBe(8)
    expect(visibleOffsetOf('Titre', '## Titre', 0)).toBe(0)
  })
})
