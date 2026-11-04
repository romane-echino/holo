/**
 * Modèle partagé d'un document pour l'édition en temps réel (Yjs).
 *
 * Le document n'est plus un seul texte mais un arbre de blocs :
 *
 *   frontmatter : Y.Text          en-tête YAML
 *   footnotes   : Y.Map<Y.Text>   notes de bas de page, par identifiant
 *   order       : Y.Array<id>     ordre des blocs
 *   blocks      : Y.Map<Y.Map>    contenu des blocs, par identifiant
 *
 * Un bloc est de l'un de ces genres :
 * - text  : son propre markdown dans un Y.Text (paragraphe, titre, citation,
 *           code, formule…). Deux personnes dans deux blocs ne se touchent pas ;
 *           dans le même bloc, la fusion se fait au caractère près.
 * - table : colonnes et lignes (ordre + contenu par identifiant), un Y.Text par
 *           cellule, adressée par ligne × colonne.
 * - list  : éléments (ordre + contenu par identifiant), chacun avec son texte,
 *           son niveau et sa case à cocher.
 *
 * Ordre et contenu sont séparés : déplacer un bloc, trier un tableau ou
 * réordonner une liste ne change que l'ordre, jamais le contenu, si bien que
 * ce que quelqu'un est en train de taper n'est jamais perdu.
 *
 * L'éditeur décrit le document par une photo (SharedSnapshot) ; une saisie
 * locale est la différence entre deux photos, appliquée au document partagé.
 */
import * as Y from 'yjs'
import { multiSpliceDiff, rebaseText } from './encoding'
import { alignSequences } from '../alignSequences'

export type SharedProps = Record<string, unknown>

export type SharedTextBlock = { id: string; kind: 'text'; md: string }
export type SharedTableColumn = { id: string; title: string; props: SharedProps }
export type SharedTableRow = { id: string; cells: Record<string, string> }
export type SharedTableBlock = { id: string; kind: 'table'; props: SharedProps; columns: SharedTableColumn[]; rows: SharedTableRow[] }
export type SharedListItem = { id: string; text: string; depth: number; checked: boolean | null }
export type SharedListBlock = { id: string; kind: 'list'; props: SharedProps; items: SharedListItem[] }
export type SharedBlock = SharedTextBlock | SharedTableBlock | SharedListBlock

export type SharedSnapshot = {
  frontmatter: string
  footnotes: Record<string, string>
  blocks: SharedBlock[]
}

export const EMPTY_SNAPSHOT: SharedSnapshot = { frontmatter: '', footnotes: {}, blocks: [] }

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Identifiants d'une liste d'ordre, sans doublon (deux déplacements simultanés) ni orphelin. */
function readOrder(order: Y.Array<string> | undefined, data: Y.Map<unknown> | undefined): string[] {
  if (!order || !data) return []
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of order.toArray()) {
    if (seen.has(id) || !data.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

const textOf = (value: unknown) => (value instanceof Y.Text ? value.toString() : '')
const propsOf = (value: unknown): SharedProps => (value && typeof value === 'object' && !(value instanceof Y.AbstractType) ? { ...(value as SharedProps) } : {})

function readBlock(id: string, block: Y.Map<unknown>): SharedBlock | null {
  const kind = block.get('kind')
  if (kind === 'table') {
    const columnData = block.get('columnData') as Y.Map<Y.Map<unknown>> | undefined
    const rowData = block.get('rowData') as Y.Map<Y.Map<unknown>> | undefined
    const columns = readOrder(block.get('columns') as Y.Array<string>, columnData as Y.Map<unknown>).map((columnId) => {
      const column = columnData!.get(columnId)!
      return { id: columnId, title: textOf(column.get('title')), props: propsOf(column.get('props')) }
    })
    const rows = readOrder(block.get('rows') as Y.Array<string>, rowData as Y.Map<unknown>).map((rowId) => {
      const row = rowData!.get(rowId)!
      const cells: Record<string, string> = {}
      for (const column of columns) cells[column.id] = textOf(row.get(column.id))
      return { id: rowId, cells }
    })
    return { id, kind: 'table', props: propsOf(block.get('props')), columns, rows }
  }
  if (kind === 'list') {
    const itemData = block.get('itemData') as Y.Map<Y.Map<unknown>> | undefined
    const items = readOrder(block.get('items') as Y.Array<string>, itemData as Y.Map<unknown>).map((itemId) => {
      const item = itemData!.get(itemId)!
      const checked = item.get('checked')
      return {
        id: itemId,
        text: textOf(item.get('text')),
        depth: Number(item.get('depth') ?? 0),
        checked: checked === true || checked === false ? checked : null,
      }
    })
    return { id, kind: 'list', props: propsOf(block.get('props')), items }
  }
  if (kind === 'text') return { id, kind: 'text', md: textOf(block.get('md')) }
  return null
}

/** Photo du document partagé. */
export function readSnapshot(doc: Y.Doc): SharedSnapshot {
  const blocksMap = doc.getMap<Y.Map<unknown>>('blocks')
  const footnotes: Record<string, string> = {}
  doc.getMap<Y.Text>('footnotes').forEach((text, key) => { footnotes[key] = text.toString() })
  const blocks: SharedBlock[] = []
  for (const id of readOrder(doc.getArray<string>('order'), blocksMap as Y.Map<unknown>)) {
    const block = readBlock(id, blocksMap.get(id)!)
    if (block) blocks.push(block)
  }
  return { frontmatter: doc.getText('frontmatter').toString(), footnotes, blocks }
}

// ─── Création ────────────────────────────────────────────────────────────────

function createText(value: string): Y.Text {
  const text = new Y.Text()
  if (value) text.insert(0, value)
  return text
}

function createBlock(block: SharedBlock): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  map.set('kind', block.kind)
  if (block.kind === 'text') {
    map.set('md', createText(block.md))
  } else if (block.kind === 'table') {
    map.set('props', { ...block.props })
    const columnData = new Y.Map<Y.Map<unknown>>()
    for (const column of block.columns) columnData.set(column.id, createColumn(column))
    const rowData = new Y.Map<Y.Map<unknown>>()
    for (const row of block.rows) rowData.set(row.id, createRow(row, block.columns))
    map.set('columnData', columnData)
    map.set('rowData', rowData)
    map.set('columns', Y.Array.from(block.columns.map((column) => column.id)))
    map.set('rows', Y.Array.from(block.rows.map((row) => row.id)))
  } else {
    map.set('props', { ...block.props })
    const itemData = new Y.Map<Y.Map<unknown>>()
    for (const item of block.items) itemData.set(item.id, createItem(item))
    map.set('itemData', itemData)
    map.set('items', Y.Array.from(block.items.map((item) => item.id)))
  }
  return map
}

function createColumn(column: SharedTableColumn): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  map.set('title', createText(column.title))
  map.set('props', { ...column.props })
  return map
}

function createRow(row: SharedTableRow, columns: SharedTableColumn[]): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  for (const column of columns) map.set(column.id, createText(row.cells[column.id] ?? ''))
  return map
}

function createItem(item: SharedListItem): Y.Map<unknown> {
  const map = new Y.Map<unknown>()
  map.set('text', createText(item.text))
  map.set('depth', item.depth)
  map.set('checked', item.checked)
  return map
}

/** Remplit un document vide (démarrage d'une session à partir du fichier). */
export function writeSnapshot(doc: Y.Doc, snapshot: SharedSnapshot, origin?: unknown): void {
  applySnapshot(doc, EMPTY_SNAPSHOT, snapshot, origin)
}

// ─── Application d'une modification locale ──────────────────────────────────

/**
 * Applique à un texte partagé la modification `base → next` faite par
 * l'éditeur. Si le texte partagé a changé entre-temps (il n'est plus `base`),
 * la modification est rejouée sur sa version actuelle, au caractère près.
 */
function applyText(text: Y.Text, base: string, next: string): void {
  if (base === next) return
  const current = text.toString()
  const target = current === base ? next : rebaseText(base, next, current)
  for (const splice of [...multiSpliceDiff(current, target)].reverse()) {
    if (splice.remove > 0) text.delete(splice.index, splice.remove)
    if (splice.insert) text.insert(splice.index, splice.insert)
  }
}

function applyProps(map: Y.Map<unknown>, key: string, base: SharedProps | undefined, next: SharedProps): void {
  if (base && JSON.stringify(base) === JSON.stringify(next)) return
  map.set(key, { ...next })
}

/**
 * Applique à une liste d'ordre partagée le passage `base → next` : suppressions,
 * ajouts et déplacements. Les éléments que l'éditeur n'a pas déplacés restent
 * où les autres les ont mis.
 */
function applyOrder(order: Y.Array<string>, base: string[], next: string[]): void {
  if (base.length === next.length && base.every((id, index) => id === next[index])) return
  const nextSet = new Set(next)
  const baseSet = new Set(base)
  // Éléments qui gardent leur ordre relatif (plus longue sous-séquence commune).
  const common = next.filter((id) => baseSet.has(id))
  const commonBase = base.filter((id) => nextSet.has(id))
  const { matches } = alignSequences(commonBase, common, () => false)
  const stay = new Set(common.filter((_, index) => matches[index] !== -1))
  const removeAll = (id: string) => {
    const values = order.toArray()
    for (let index = values.length - 1; index >= 0; index -= 1) if (values[index] === id) order.delete(index, 1)
  }
  // Supprimés, et déplacés (retirés pour être réinsérés à leur nouvelle place).
  for (const id of base) if (!nextSet.has(id) || !stay.has(id)) removeAll(id)
  // Ajoutés et déplacés : insérés après leur prédécesseur dans `next`.
  next.forEach((id, index) => {
    if (stay.has(id)) return
    const values = order.toArray()
    if (values.includes(id)) return
    let position = 0
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const at = values.indexOf(next[previous])
      if (at !== -1) {
        position = at + 1
        break
      }
    }
    order.insert(position, [id])
  })
}

function updateTable(map: Y.Map<unknown>, base: SharedTableBlock | undefined, next: SharedTableBlock): void {
  applyProps(map, 'props', base?.props, next.props)
  const columnData = map.get('columnData') as Y.Map<Y.Map<unknown>>
  const rowData = map.get('rowData') as Y.Map<Y.Map<unknown>>
  const baseColumns = new Map(base?.columns.map((column) => [column.id, column]) ?? [])
  for (const column of next.columns) {
    const existing = columnData.get(column.id)
    if (!existing) {
      columnData.set(column.id, createColumn(column))
      continue
    }
    const before = baseColumns.get(column.id)
    applyText(existing.get('title') as Y.Text, before?.title ?? '', column.title)
    applyProps(existing, 'props', before?.props, column.props)
  }
  const baseRows = new Map(base?.rows.map((row) => [row.id, row]) ?? [])
  for (const row of next.rows) {
    const existing = rowData.get(row.id)
    if (!existing) {
      rowData.set(row.id, createRow(row, next.columns))
      continue
    }
    const before = baseRows.get(row.id)
    for (const column of next.columns) {
      const cell = existing.get(column.id)
      const value = row.cells[column.id] ?? ''
      if (cell instanceof Y.Text) applyText(cell, before?.cells[column.id] ?? '', value)
      else existing.set(column.id, createText(value))
    }
  }
  applyOrder(map.get('columns') as Y.Array<string>, base?.columns.map((column) => column.id) ?? [], next.columns.map((column) => column.id))
  applyOrder(map.get('rows') as Y.Array<string>, base?.rows.map((row) => row.id) ?? [], next.rows.map((row) => row.id))
}

function updateList(map: Y.Map<unknown>, base: SharedListBlock | undefined, next: SharedListBlock): void {
  applyProps(map, 'props', base?.props, next.props)
  const itemData = map.get('itemData') as Y.Map<Y.Map<unknown>>
  const baseItems = new Map(base?.items.map((item) => [item.id, item]) ?? [])
  for (const item of next.items) {
    const existing = itemData.get(item.id)
    if (!existing) {
      itemData.set(item.id, createItem(item))
      continue
    }
    const before = baseItems.get(item.id)
    applyText(existing.get('text') as Y.Text, before?.text ?? '', item.text)
    if (before?.depth !== item.depth) existing.set('depth', item.depth)
    if (before?.checked !== item.checked) existing.set('checked', item.checked)
  }
  applyOrder(map.get('items') as Y.Array<string>, base?.items.map((item) => item.id) ?? [], next.items.map((item) => item.id))
}

function sameBlock(left: SharedBlock, right: SharedBlock): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * Applique au document partagé la modification faite par l'éditeur, de la
 * photo `base` (ce que l'éditeur affichait) à la photo `next` (ce qu'il affiche
 * maintenant). Seul ce qui a changé est touché ; ce que les autres ont modifié
 * entre-temps est conservé.
 */
export function applySnapshot(doc: Y.Doc, base: SharedSnapshot, next: SharedSnapshot, origin?: unknown): void {
  doc.transact(() => {
    applyText(doc.getText('frontmatter'), base.frontmatter, next.frontmatter)

    const footnotes = doc.getMap<Y.Text>('footnotes')
    for (const [key, value] of Object.entries(next.footnotes)) {
      const existing = footnotes.get(key)
      if (existing) applyText(existing, base.footnotes[key] ?? '', value)
      else footnotes.set(key, createText(value))
    }
    for (const key of Object.keys(base.footnotes)) if (!(key in next.footnotes)) footnotes.delete(key)

    const blocksMap = doc.getMap<Y.Map<unknown>>('blocks')
    const baseById = new Map(base.blocks.map((block) => [block.id, block]))
    for (const block of next.blocks) {
      const before = baseById.get(block.id)
      const existing = blocksMap.get(block.id)
      if (!existing || existing.get('kind') !== block.kind || (before && before.kind !== block.kind)) {
        // Nouveau bloc, ou bloc converti (paragraphe → liste…) : contenu remplacé.
        blocksMap.set(block.id, createBlock(block))
        continue
      }
      if (before && sameBlock(before, block)) continue
      if (block.kind === 'text') applyText(existing.get('md') as Y.Text, before?.kind === 'text' ? before.md : '', block.md)
      else if (block.kind === 'table') updateTable(existing, before?.kind === 'table' ? before : undefined, block)
      else updateList(existing, before?.kind === 'list' ? before : undefined, block)
    }
    // Un bloc supprimé quitte l'ordre ; son contenu reste (une saisie
    // simultanée d'un collègue dans ce bloc n'est pas perdue pour le document).
    applyOrder(doc.getArray<string>('order'), base.blocks.map((block) => block.id), next.blocks.map((block) => block.id))
  }, origin)
}

// ─── Fusion à l'arrivée ──────────────────────────────────────────────────────

/** Contenu d'un bloc, sans ses identifiants. */
function blockContent(block: SharedBlock): string {
  if (block.kind === 'text') return `text:${block.md}`
  if (block.kind === 'table') {
    return `table:${JSON.stringify([block.props, block.columns.map((column) => [column.title, column.props]), block.rows.map((row) => block.columns.map((column) => row.cells[column.id] ?? ''))])}`
  }
  return `list:${JSON.stringify([block.props, block.items.map((item) => [item.text, item.depth, item.checked])])}`
}

/**
 * Éléments ajoutés à l'identique des deux côtés (absents de `base`, présents
 * dans `ours` et dans `session`) : `ours` reprend celui de la session et la
 * base l'inclut, si bien qu'il n'est pas ajouté une seconde fois.
 */
function foldSequence<T extends { id: string }>(
  base: T[], ours: T[], session: T[], key: (entry: T) => string, adopt: (own: T, theirs: T) => T,
): { base: T[]; ours: T[] } {
  const baseIds = new Set(base.map((entry) => entry.id))
  const sessionIds = new Set(session.map((entry) => entry.id))
  const added = new Map<string, T[]>()
  for (const entry of session) {
    if (baseIds.has(entry.id)) continue
    const bucket = added.get(key(entry)) ?? []
    bucket.push(entry)
    added.set(key(entry), bucket)
  }
  if (added.size === 0) return { base, ours }
  const folded = new Set<string>()
  const nextOurs = ours.map((entry) => {
    if (baseIds.has(entry.id) || sessionIds.has(entry.id)) return entry
    const match = added.get(key(entry))?.shift()
    if (!match) return entry
    folded.add(match.id)
    return adopt(entry, match)
  })
  if (folded.size === 0) return { base, ours }
  const nextBase = [...base]
  session.forEach((entry, index) => {
    if (!folded.has(entry.id)) return
    let position = 0
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const at = nextBase.findIndex((candidate) => candidate.id === session[previous].id)
      if (at !== -1) {
        position = at + 1
        break
      }
    }
    nextBase.splice(position, 0, entry)
  })
  return { base: nextBase, ours: nextOurs }
}

/**
 * Prépare la fusion de modifications locales (`base → ours`) dans un document
 * partagé `session` qui contient peut-être déjà certaines d'entre elles : un
 * participant qui revient après le redémarrage de la session a souvent tapé
 * avant celui-ci des blocs, lignes ou éléments que la session a gardés. Ces
 * ajouts communs sont rattachés à ceux de la session au lieu d'être doublés.
 */
export function foldCommonAdditions(base: SharedSnapshot, ours: SharedSnapshot, session: SharedSnapshot): { base: SharedSnapshot; ours: SharedSnapshot } {
  const blocks = foldSequence(base.blocks, ours.blocks, session.blocks, blockContent, (_own, theirs) => theirs)
  const sessionById = new Map(session.blocks.map((block) => [block.id, block]))
  const baseById = new Map(blocks.base.map((block) => [block.id, block]))
  const baseBlocks = [...blocks.base]
  const oursBlocks = blocks.ours.map((block): SharedBlock => {
    const before = baseById.get(block.id)
    const theirs = sessionById.get(block.id)
    if (!before || !theirs || before === theirs) return block
    if (block.kind === 'table' && before.kind === 'table' && theirs.kind === 'table') {
      const rowKey = (row: SharedTableRow) => JSON.stringify(before.columns.map((column) => row.cells[column.id] ?? ''))
      const rows = foldSequence(before.rows, block.rows, theirs.rows, rowKey, (own, match) => ({ ...own, id: match.id }))
      if (rows.base === before.rows) return block
      baseBlocks[baseBlocks.indexOf(before)] = { ...before, rows: rows.base }
      return { ...block, rows: rows.ours }
    }
    if (block.kind === 'list' && before.kind === 'list' && theirs.kind === 'list') {
      const itemKey = (item: SharedListItem) => JSON.stringify([item.text, item.depth, item.checked])
      const items = foldSequence(before.items, block.items, theirs.items, itemKey, (_own, match) => match)
      if (items.base === before.items) return block
      baseBlocks[baseBlocks.indexOf(before)] = { ...before, items: items.base }
      return { ...block, items: items.ours }
    }
    return block
  })
  return { base: { ...base, blocks: baseBlocks }, ours: { ...ours, blocks: oursBlocks } }
}

/** Les types partagés suivis par l'historique d'annulation. */
export function sharedRoots(doc: Y.Doc): Y.AbstractType<unknown>[] {
  return [
    doc.getText('frontmatter'),
    doc.getMap('footnotes'),
    doc.getArray('order'),
    doc.getMap('blocks'),
  ] as Y.AbstractType<unknown>[]
}

/** Deux photos identiques ? */
export function sameSnapshot(left: SharedSnapshot, right: SharedSnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
