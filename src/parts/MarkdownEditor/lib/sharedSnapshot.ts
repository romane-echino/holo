/**
 * Markdown ↔ photo du document partagé (modèle de blocs de l'édition en temps
 * réel) et blocs de l'éditeur ↔ blocs partagés.
 *
 * Le fichier markdown reste la référence dans git : il est relu en blocs pour
 * démarrer une session, et réécrit à partir des blocs partagés.
 */
import type { BlockState, InlineNode, ListItemNode, ListNode, ParagraphNode, TableCellNode, TableColumnAggregation, TableColumnType, TableMetadata, TableNode } from './types'
import { blocksToMarkdown, extractFootnoteMapFromMarkdown, markdownToBlocks } from './markdownBlocks'
import { inlinesToMarkdown } from './inlinesToMarkdown'
import { alignSequences } from '../../../lib/alignSequences'
import type { SharedBlock, SharedListBlock, SharedListItem, SharedSnapshot, SharedTableBlock, SharedTableColumn, SharedTableRow } from '../../../lib/realtime/sharedModel'

const randomId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

/** Identifiants des lignes, colonnes et éléments, gardés dans le nœud pour l'éditeur. */
export type HoloIds = { columns?: string[]; rows?: string[]; items?: string[] }

const FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(markdown: string): { frontmatter: string; body: string } {
  const match = FRONTMATTER.exec(markdown)
  return match ? { frontmatter: match[0], body: markdown.slice(match[0].length) } : { frontmatter: '', body: markdown }
}

type Footnotes = Record<string, string>

/**
 * Un renvoi `[^1]` n'est reconnu que si sa définition est dans le même texte :
 * pour relire un bloc seul, on lui ajoute les définitions du document.
 */
function withFootnotes(markdown: string, footnotes: Footnotes | undefined): string {
  if (!footnotes || !markdown.includes('[^')) return markdown
  const definitions = Object.entries(footnotes).map(([identifier, content]) => `[^${identifier}]: ${content}`)
  return definitions.length > 0 ? `${markdown}\n\n${definitions.join('\n')}` : markdown
}

/** Contenu en ligne (gras, liens…) d'un texte markdown d'une ligne. */
export function parseInline(markdown: string, footnotes?: Footnotes): InlineNode[] {
  if (!markdown) return []
  const [first, ...others] = markdownToBlocks(withFootnotes(markdown, footnotes), { trailingParagraph: false })
  if (others.length === 0 && first?.node.type === 'paragraph') return (first.node as ParagraphNode).children
  return [{ type: 'text', value: markdown }]
}

// ─── Blocs de l'éditeur → blocs partagés ─────────────────────────────────────

function tableToShared(id: string, node: TableNode): SharedTableBlock {
  const ids = (node.data?.holoIds ?? {}) as HoloIds
  const metadata = node.data?.holoTable ?? {}
  const [header, ...body] = node.children
  const columnCount = Math.max(header?.children.length ?? 0, ...body.map((row) => row.children.length))
  const columns: SharedTableColumn[] = Array.from({ length: columnCount }, (_, index) => ({
    id: ids.columns?.[index] ?? randomId('c'),
    title: inlinesToMarkdown((header?.children[index]?.children ?? []) as InlineNode[]),
    props: {
      align: node.align?.[index] ?? null,
      type: metadata.columnTypes?.[index] ?? 'text',
      color: metadata.columnColors?.[index] ?? null,
      aggregation: metadata.columnAggregations?.[index] ?? 'none',
      width: metadata.columnWidths?.[index] ?? null,
    },
  }))
  const rows: SharedTableRow[] = body.map((row, rowIndex) => ({
    id: ids.rows?.[rowIndex] ?? randomId('r'),
    cells: Object.fromEntries(columns.map((column, index) => [column.id, inlinesToMarkdown((row.children[index]?.children ?? []) as InlineNode[])])),
  }))
  return { id, kind: 'table', props: {}, columns, rows }
}

function listToShared(id: string, node: ListNode): SharedListBlock {
  const ids = ((node.data?.holoIds ?? {}) as HoloIds).items ?? []
  const items: SharedListItem[] = []
  const walk = (list: ListNode, depth: number) => {
    for (const item of list.children) {
      const paragraph = item.children.find((child) => child.type === 'paragraph') as ParagraphNode | undefined
      items.push({
        id: ids[items.length] ?? randomId('i'),
        text: inlinesToMarkdown(paragraph?.children ?? []),
        depth,
        checked: item.checked ?? null,
      })
      const sublist = item.children.find((child) => child.type === 'list') as ListNode | undefined
      if (sublist) walk(sublist, depth + 1)
    }
  }
  walk(node, 0)
  return {
    id,
    kind: 'list',
    props: { ordered: Boolean(node.ordered), start: node.start ?? null, style: (node.data?.listStyle as string | undefined) ?? null },
    items,
  }
}

export function editorBlockToShared(block: BlockState): SharedBlock {
  if (block.node.type === 'table') return tableToShared(block.id, block.node as TableNode)
  if (block.node.type === 'list') return listToShared(block.id, block.node as ListNode)
  return { id: block.id, kind: 'text', md: blocksToMarkdown([block]).replace(/\n+$/, '') }
}

// ─── Blocs partagés → blocs de l'éditeur ─────────────────────────────────────

function sharedTableToNode(block: SharedTableBlock, footnotes?: Footnotes): TableNode {
  const cell = (markdown: string): TableCellNode => ({ type: 'tableCell', children: parseInline(markdown, footnotes) })
  const prop = <T>(column: SharedTableColumn, key: string, fallback: T): T => (column.props[key] as T | undefined) ?? fallback
  const metadata: TableMetadata = {
    columnTypes: block.columns.map((column) => prop<TableColumnType>(column, 'type', 'text')),
    columnColors: block.columns.map((column) => prop<string | null>(column, 'color', null)),
    columnAggregations: block.columns.map((column) => prop<TableColumnAggregation>(column, 'aggregation', 'none')),
    columnWidths: block.columns.map((column) => prop<number | null>(column, 'width', null)),
  }
  return {
    type: 'table',
    align: block.columns.map((column) => prop<'left' | 'center' | 'right' | null>(column, 'align', null)),
    children: [
      { type: 'tableRow', children: block.columns.map((column) => cell(column.title)) },
      ...block.rows.map((row) => ({ type: 'tableRow' as const, children: block.columns.map((column) => cell(row.cells[column.id] ?? '')) })),
    ],
    data: { holoTable: metadata, holoIds: { columns: block.columns.map((column) => column.id), rows: block.rows.map((row) => row.id) } satisfies HoloIds },
  }
}

function sharedListToNode(block: SharedListBlock, footnotes?: Footnotes): ListNode {
  const ordered = Boolean(block.props.ordered)
  const base = { type: 'list' as const, ordered, start: (block.props.start as number | null) ?? (ordered ? 1 : null), spread: false }
  const build = (start: number, depth: number): { children: ListItemNode[]; next: number } => {
    const children: ListItemNode[] = []
    let index = start
    while (index < block.items.length) {
      const item = block.items[index]
      if (item.depth < depth) break
      const content: ListItemNode['children'] = [{ type: 'paragraph', children: parseInline(item.text, footnotes) }]
      index += 1
      if (index < block.items.length && block.items[index].depth > item.depth) {
        const sub = build(index, block.items[index].depth)
        content.push({ ...base, children: sub.children } as ListNode)
        index = sub.next
      }
      children.push({ type: 'listItem', spread: false, checked: item.checked, children: content })
    }
    return { children, next: index }
  }
  const style = block.props.style as string | null
  return {
    ...base,
    children: build(0, 0).children,
    data: { ...(style ? { listStyle: style } : {}), holoIds: { items: block.items.map((item) => item.id) } satisfies HoloIds },
  }
}

/**
 * Bloc(s) de l'éditeur pour un bloc partagé. Un bloc texte dont le markdown
 * contient plusieurs blocs (fusion de saisies simultanées) en donne plusieurs :
 * le premier garde l'identifiant partagé, les suivants « id~1 », « id~2 »…
 */
export function sharedBlockToEditor(block: SharedBlock, footnotes?: Footnotes): BlockState[] {
  if (block.kind === 'table') return [{ id: block.id, node: sharedTableToNode(block, footnotes) }]
  if (block.kind === 'list') return [{ id: block.id, node: sharedListToNode(block, footnotes) }]
  const parsed = markdownToBlocks(withFootnotes(block.md, footnotes), { trailingParagraph: false })
  return parsed.map((entry, index) => ({ id: index === 0 ? block.id : `${block.id}~${index}`, node: entry.node }))
}

// ─── Document entier ─────────────────────────────────────────────────────────

export function markdownToSnapshot(markdown: string): SharedSnapshot {
  const { frontmatter, body } = splitFrontmatter(markdown)
  return {
    frontmatter,
    footnotes: Object.fromEntries(extractFootnoteMapFromMarkdown(body)),
    blocks: markdownToBlocks(body).map(editorBlockToShared),
  }
}

export function snapshotToMarkdown(snapshot: SharedSnapshot): string {
  const blocks = snapshot.blocks.flatMap((block) => sharedBlockToEditor(block, snapshot.footnotes))
  return snapshot.frontmatter + blocksToMarkdown(blocks, new Map(Object.entries(snapshot.footnotes)))
}

// ─── Identifiants : deux versions d'un même document ─────────────────────────

const blockKey = (block: SharedBlock) => JSON.stringify(block.kind === 'text'
  ? [block.kind, block.md]
  : block.kind === 'table'
    ? [block.kind, block.columns.map((column) => column.title), block.rows.map((row) => block.columns.map((column) => row.cells[column.id]))]
    : [block.kind, block.items.map((item) => [item.text, item.depth, item.checked])])

function alignIds<T extends { id: string }>(target: T[], reference: T[], key: (entry: T) => string): Map<string, string> {
  const { matches } = alignSequences(reference.map(key), target.map(key))
  const mapping = new Map<string, string>()
  matches.forEach((match, index) => { if (match !== -1) mapping.set(target[index].id, reference[match].id) })
  return mapping
}

/** Lignes et colonnes de `block` reprennent les identifiants de leurs équivalents dans `counterpart`. */
function alignTableIds(block: SharedTableBlock, counterpart: SharedTableBlock): SharedTableBlock {
  const columnIds = alignIds(block.columns, counterpart.columns, (column) => column.title)
  const columns = block.columns.map((column) => ({ ...column, id: columnIds.get(column.id) ?? column.id }))
  // Une ligne se compare par le contenu de ses cellules, dans l'ordre des colonnes de son tableau.
  const rowKey = (table: SharedTableBlock, row: SharedTableRow) => JSON.stringify(table.columns.map((column) => row.cells[column.id] ?? ''))
  const rowMatches = alignSequences(counterpart.rows.map((row) => rowKey(counterpart, row)), block.rows.map((row) => rowKey(block, row))).matches
  const rows = block.rows.map((row, rowIndex) => ({
    id: rowMatches[rowIndex] === -1 ? row.id : counterpart.rows[rowMatches[rowIndex]].id,
    cells: Object.fromEntries(block.columns.map((column) => [columnIds.get(column.id) ?? column.id, row.cells[column.id] ?? ''])),
  }))
  return { ...block, columns, rows }
}

function alignListIds(block: SharedListBlock, counterpart: SharedListBlock): SharedListBlock {
  const itemIds = alignIds(block.items, counterpart.items, (item) => JSON.stringify([item.text, item.depth]))
  return { ...block, items: block.items.map((item) => ({ ...item, id: itemIds.get(item.id) ?? item.id })) }
}

/**
 * Redonne aux blocs de `target` (et à leurs lignes, colonnes, éléments) les
 * identifiants de leurs équivalents dans `reference`, par le contenu. Deux
 * versions d'un même document lues séparément (fichier local, version git,
 * session) deviennent ainsi comparables bloc à bloc.
 */
export function alignSnapshotIds(target: SharedSnapshot, reference: SharedSnapshot): SharedSnapshot {
  const { matches } = alignSequences(
    reference.blocks.map(blockKey),
    target.blocks.map(blockKey),
    (referenceIndex, targetIndex) => reference.blocks[referenceIndex].kind === target.blocks[targetIndex].kind,
  )
  const blocks = target.blocks.map((block, index): SharedBlock => {
    const match = matches[index]
    if (match === -1) return block
    const counterpart = reference.blocks[match]
    if (block.kind === 'table' && counterpart.kind === 'table') return { ...alignTableIds(block, counterpart), id: counterpart.id }
    if (block.kind === 'list' && counterpart.kind === 'list') return { ...alignListIds(block, counterpart), id: counterpart.id }
    return { ...block, id: counterpart.id }
  })
  return { ...target, blocks }
}

/**
 * Blocs déjà identifiés (même identifiant des deux côtés) : seules leurs
 * lignes, colonnes et éléments reprennent les identifiants de `previous`,
 * par le contenu (l'éditeur de tableau et de liste ne les garde pas encore).
 */
export function alignContainerIds(next: SharedSnapshot, previous: SharedSnapshot): SharedSnapshot {
  const previousById = new Map(previous.blocks.map((block) => [block.id, block]))
  const blocks = next.blocks.map((block): SharedBlock => {
    const counterpart = previousById.get(block.id)
    if (block.kind === 'table' && counterpart?.kind === 'table') return alignTableIds(block, counterpart)
    if (block.kind === 'list' && counterpart?.kind === 'list') return alignListIds(block, counterpart)
    return block
  })
  return { ...next, blocks }
}
