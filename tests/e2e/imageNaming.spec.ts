/**
 * imageNaming.spec.ts — Nom des images collées ou déposées
 */
import { test, expect } from '@playwright/test'
import { imageNaming } from '../../src/lib/imageNaming'

const DAY = new Date(2026, 10, 4, 14, 32)

test.describe('Nom des images collées', () => {
  test('une image du presse-papiers prend le nom du document et la date, sans légende', () => {
    expect(imageNaming('image.png', 'image/png', '/r/Fiches employés/Fiche employé.md', DAY)).toEqual({ name: 'fiche-employe-2026-11-04.png', alt: '' })
    expect(imageNaming('', 'image/jpeg', 'C:\\Docs\\Compte rendu réunion.md', DAY)).toEqual({ name: 'compte-rendu-reunion-2026-11-04.jpg', alt: '' })
  })

  test('une capture d écran (macOS, Windows) est traitée comme une image du presse-papiers', () => {
    expect(imageNaming('Capture d’écran 2026-11-04 à 14.32.10.png', 'image/png', '/r/Notes.md', DAY).name).toBe('notes-2026-11-04.png')
    expect(imageNaming('Screenshot 2026-11-04 143210.png', 'image/png', '/r/Notes.md', DAY).name).toBe('notes-2026-11-04.png')
  })

  test('un nom parlant est gardé, et sert de légende', () => {
    expect(imageNaming('schema-reseau.png', 'image/png', '/r/Notes.md', DAY)).toEqual({ name: 'schema-reseau.png', alt: 'schema-reseau' })
    expect(imageNaming('imagerie.png', 'image/png', '/r/Notes.md', DAY).name).toBe('imagerie.png')
    expect(imageNaming('capture-du-schema.png', 'image/png', '/r/Notes.md', DAY).name).toBe('capture-du-schema.png')
  })
})
