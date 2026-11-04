/**
 * sharedModel.spec.ts — Modèle partagé par blocs (édition en temps réel)
 *
 * Conversion markdown ↔ photo du document, et application de modifications
 * simultanées sur deux copies du document partagé (Yjs), sans relais.
 */
import { test, expect } from '@playwright/test'
import * as Y from 'yjs'
import { applySnapshot, foldCommonAdditions, readSnapshot, writeSnapshot, type SharedSnapshot, type SharedTableBlock, type SharedListBlock, type SharedTextBlock } from '../../src/lib/realtime/sharedModel'
import { alignSnapshotIds, markdownToSnapshot, snapshotToMarkdown } from '../../src/parts/MarkdownEditor/lib/sharedSnapshot'

const DOCUMENT = [
  '---',
  'title: Réunion',
  'tags: [équipe]',
  '---',
  '# Réunion équipe',
  '',
  'Introduction avec **gras**, _italique_ et un [lien](https://echino.com).',
  '',
  '<!-- holo:table {"columnTypes":["text","currency"]} -->',
  '| Poste | Montant |',
  '| :-- | --: |',
  '| Serveurs | 1200 |',
  '| Licences | 300 |',
  '',
  '- Point A',
  '  - Sous-point A.1',
  '- Point B',
  '',
  '<!-- list-style:alpha -->',
  '',
  '1. Lettre a',
  '2. Lettre b',
  '',
  '- [ ] Tâche à faire',
  '- [x] Tâche faite',
  '',
  '```js',
  'const total = 42',
  '```',
  '',
  '> [!NOTE]',
  '> Une note.',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '***',
  '',
  'Conclusion avec une note[^1].',
  '',
  '[^1]: Le contenu de la note.',
  '',
].join('\n')

/** Deux copies du document partagé reliées à la main (comme deux postes). */
function pair(snapshot: SharedSnapshot) {
  const a = new Y.Doc()
  writeSnapshot(a, snapshot)
  const b = new Y.Doc()
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
  const sync = () => {
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
  }
  return { a, b, sync }
}

/** Modifie une photo (copie profonde) avec `edit`. */
function edited(snapshot: SharedSnapshot, edit: (draft: SharedSnapshot) => void): SharedSnapshot {
  const draft = structuredClone(snapshot)
  edit(draft)
  return draft
}

const tableOf = (snapshot: SharedSnapshot) => snapshot.blocks.find((block) => block.kind === 'table') as SharedTableBlock
const listOf = (snapshot: SharedSnapshot, index = 0) => snapshot.blocks.filter((block) => block.kind === 'list')[index] as SharedListBlock
const textBlock = (snapshot: SharedSnapshot, contains: string) => snapshot.blocks.find((block) => block.kind === 'text' && block.md.includes(contains)) as SharedTextBlock

test.describe('Modèle partagé : conversion', () => {
  test('markdown → photo → markdown redonne le document (forme de l éditeur)', () => {
    const snapshot = markdownToSnapshot(DOCUMENT)
    const markdown = snapshotToMarkdown(snapshot)
    // La forme produite est stable : la relire et la réécrire ne change rien.
    expect(snapshotToMarkdown(markdownToSnapshot(markdown))).toBe(markdown)
    for (const fragment of ['title: Réunion', '# Réunion équipe', '**gras**', '[lien](https://echino.com)', '"columnTypes":["text","currency"]', '| Serveurs | 1200 |', '- Point A', '  - Sous-point A.1', '<!-- list-style:alpha -->', '- [ ] Tâche à faire', '- [x] Tâche faite', '```js\nconst total = 42\n```', '> [!NOTE]', 'E = mc^2', '***', 'note[^1]', '[^1]: Le contenu de la note.']) {
      expect(markdown, fragment).toContain(fragment)
    }
  })

  test('tableaux et listes ont leur structure dans la photo', () => {
    const snapshot = markdownToSnapshot(DOCUMENT)
    const table = tableOf(snapshot)
    expect(table.columns.map((column) => column.title)).toEqual(['Poste', 'Montant'])
    expect(table.columns.map((column) => column.props.align)).toEqual(['left', 'right'])
    expect(table.columns[1].props.type).toBe('currency')
    expect(table.rows.map((row) => row.cells[table.columns[0].id])).toEqual(['Serveurs', 'Licences'])
    const list = listOf(snapshot)
    expect(list.items.map((item) => [item.text, item.depth])).toEqual([['Point A', 0], ['Sous-point A.1', 1], ['Point B', 0]])
    expect(listOf(snapshot, 1).props.style).toBe('alpha')
    expect(listOf(snapshot, 2).items.map((item) => item.checked)).toEqual([false, true])
  })

  test('écrire puis relire le document partagé donne la même photo', () => {
    const snapshot = markdownToSnapshot(DOCUMENT)
    const doc = new Y.Doc()
    writeSnapshot(doc, snapshot)
    expect(readSnapshot(doc)).toEqual(snapshot)
  })

  test('deux lectures séparées d un même document se réalignent par le contenu', () => {
    const reference = markdownToSnapshot(DOCUMENT)
    const other = markdownToSnapshot(DOCUMENT.replace('Point B', 'Point B modifié'))
    const aligned = alignSnapshotIds(other, reference)
    expect(aligned.blocks.map((block) => block.id)).toEqual(reference.blocks.map((block) => block.id))
    expect(tableOf(aligned).rows.map((row) => row.id)).toEqual(tableOf(reference).rows.map((row) => row.id))
    expect(listOf(aligned).items.map((item) => item.id)).toEqual(listOf(reference).items.map((item) => item.id))
  })
})

test.describe('Modèle partagé : modifications simultanées', () => {
  test('deux paragraphes différents', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    applySnapshot(a, base, edited(base, (draft) => { textBlock(draft, 'Introduction').md += ' Ajout A.' }))
    applySnapshot(b, base, edited(base, (draft) => { textBlock(draft, 'Conclusion').md += ' Ajout B.' }))
    sync()
    expect(readSnapshot(a)).toEqual(readSnapshot(b))
    const markdown = snapshotToMarkdown(readSnapshot(a))
    expect(markdown).toContain('Ajout A.')
    expect(markdown).toContain('Ajout B.')
  })

  test('deux cellules du même tableau, et une ligne ajoutée pendant ce temps', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    const table = tableOf(base)
    applySnapshot(a, base, edited(base, (draft) => { tableOf(draft).rows[0].cells[table.columns[0].id] += ' (A)' }))
    applySnapshot(b, base, edited(base, (draft) => {
      const target = tableOf(draft)
      target.rows[1].cells[table.columns[1].id] = '350'
      target.rows.splice(0, 0, { id: 'r-nouvelle', cells: { [table.columns[0].id]: 'Formation', [table.columns[1].id]: '80' } })
    }))
    sync()
    const merged = tableOf(readSnapshot(a))
    expect(readSnapshot(a)).toEqual(readSnapshot(b))
    expect(merged.rows.map((row) => row.cells[table.columns[0].id])).toEqual(['Formation', 'Serveurs (A)', 'Licences'])
    expect(merged.rows[2].cells[table.columns[1].id]).toBe('350')
  })

  test('colonne ajoutée pendant qu un collègue tape dans une cellule', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    const table = tableOf(base)
    applySnapshot(a, base, edited(base, (draft) => {
      const target = tableOf(draft)
      target.columns.splice(1, 0, { id: 'c-nouvelle', title: 'Responsable', props: {} })
      for (const row of target.rows) row.cells['c-nouvelle'] = ''
    }))
    applySnapshot(b, base, edited(base, (draft) => { tableOf(draft).rows[1].cells[table.columns[1].id] = '300 CHF' }))
    sync()
    const merged = tableOf(readSnapshot(b))
    expect(merged.columns.map((column) => column.title)).toEqual(['Poste', 'Responsable', 'Montant'])
    expect(merged.rows[1].cells[table.columns[1].id]).toBe('300 CHF')
    expect(snapshotToMarkdown(readSnapshot(b))).toContain('| Licences | | 300 CHF |')
  })

  test('un bloc déplacé pendant qu un collègue y tape : rien n est perdu', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    applySnapshot(a, base, edited(base, (draft) => {
      const index = draft.blocks.findIndex((block) => block.kind === 'text' && block.md.startsWith('Conclusion'))
      const [moved] = draft.blocks.splice(index, 1)
      draft.blocks.splice(1, 0, moved)
    }))
    applySnapshot(b, base, edited(base, (draft) => { textBlock(draft, 'Conclusion').md = textBlock(draft, 'Conclusion').md.replace('Conclusion', 'Conclusion révisée') }))
    sync()
    const merged = readSnapshot(a)
    expect(merged).toEqual(readSnapshot(b))
    expect(merged.blocks[1].kind === 'text' && merged.blocks[1].md).toContain('Conclusion révisée')
    expect(merged.blocks.filter((block) => block.kind === 'text' && block.md.includes('Conclusion'))).toHaveLength(1)
  })

  test('liste : élément ajouté, élément modifié et case cochée en même temps', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    applySnapshot(a, base, edited(base, (draft) => {
      const list = listOf(draft)
      list.items.splice(2, 0, { id: 'i-nouveau', text: 'Point A bis', depth: 0, checked: null })
      listOf(draft, 2).items[0].checked = true
    }))
    applySnapshot(b, base, edited(base, (draft) => { listOf(draft).items[2].text = 'Point B complété' }))
    sync()
    const merged = readSnapshot(a)
    expect(merged).toEqual(readSnapshot(b))
    expect(listOf(merged).items.map((item) => item.text)).toEqual(['Point A', 'Sous-point A.1', 'Point A bis', 'Point B complété'])
    expect(snapshotToMarkdown(merged)).toContain('- [x] Tâche à faire')
  })

  test('modification locale calculée sur une version périmée : rejouée sur la version actuelle', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const { a, b, sync } = pair(base)
    applySnapshot(b, base, edited(base, (draft) => { textBlock(draft, 'Introduction').md = textBlock(draft, 'Introduction').md.replace('Introduction', 'Introduction (B)') }))
    sync()
    // A n'a pas encore affiché la modification de B et tape à la fin du même paragraphe.
    applySnapshot(a, base, edited(base, (draft) => { textBlock(draft, 'Introduction').md += ' Fin (A).' }))
    sync()
    const intro = textBlock(readSnapshot(b), 'Introduction').md
    expect(intro).toContain('Introduction (B)')
    expect(intro.endsWith(' Fin (A).')).toBe(true)
  })

  test('à l arrivée, ce que la session a déjà (bloc, ligne, élément) n est pas doublé', () => {
    const base = markdownToSnapshot(DOCUMENT)
    const table = tableOf(base)
    // Ajouts faits avant le redémarrage de la session : la session les a gardés
    // (avec ses identifiants), le fichier local aussi (avec les siens).
    const addAll = (draft: SharedSnapshot, prefix: string) => {
      draft.blocks.splice(1, 0, { id: `${prefix}-bloc`, kind: 'text', md: 'Paragraphe commun.' })
      tableOf(draft).rows.push({ id: `${prefix}-ligne`, cells: { [table.columns[0].id]: 'Formation', [table.columns[1].id]: '80' } })
      listOf(draft).items.push({ id: `${prefix}-element`, text: 'Point C', depth: 0, checked: null })
    }
    const session = edited(base, (draft) => { addAll(draft, 'session'); textBlock(draft, 'Conclusion').md += ' (session)' })
    const ours = edited(base, (draft) => { addAll(draft, 'local'); textBlock(draft, 'Introduction').md += ' (local)' })
    const doc = new Y.Doc()
    writeSnapshot(doc, session)
    const merge = foldCommonAdditions(base, ours, session)
    applySnapshot(doc, merge.base, merge.ours)
    const markdown = snapshotToMarkdown(readSnapshot(doc))
    for (const fragment of ['Paragraphe commun.', '| Formation | 80 |', '- Point C']) expect(markdown.split(fragment).length - 1, fragment).toBe(1)
    expect(markdown).toContain('(session)')
    expect(markdown).toContain('(local)')
  })
})
