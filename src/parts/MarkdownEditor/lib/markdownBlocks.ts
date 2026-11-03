/**
 * Conversion markdown ↔ blocs de l'éditeur (sans React) : utilisée par
 * l'éditeur et par le modèle partagé de l'édition en temps réel.
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { domToInlines } from './domToInlines'
import type { BlockNode, BlockState, InlineNode, ParagraphNode, TableNode, TableMetadata, TableColumnAggregation, ListNode, ImageNode, ImageMetadata, ImageDisplayMode } from './types'

// ─── Singletons remark ──────────────────────────────────────────────────────

export const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// Plugin de sérialisation pour les nœuds <underline> → <u>...</u> dans le markdown
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function remarkUnderlinePlugin(this: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = this.data() as Record<string, any>
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = []
  data.toMarkdownExtensions.push({
    handlers: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      underline(node: any, _: any, state: any, info: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return '<u>' + (state as any).containerPhrasing(node, info) + '</u>'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      superscript(node: any, _: any, state: any, info: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return '<sup>' + (state as any).containerPhrasing(node, info) + '</sup>'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subscript(node: any, _: any, state: any, info: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return '<sub>' + (state as any).containerPhrasing(node, info) + '</sub>'
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      footnoteReference(node: any) {
        const ref = `[^${node.identifier}]`
        return node.anchorText ? `${node.anchorText}${ref}` : ref
      },
    },
  })
}

export const serializer = unified()
  .use(remarkStringify, { bullet: '-', fence: '`', strong: '*', emphasis: '_' })
  // tablePipeAlign:false → les colonnes ne sont plus alignées sur leur largeur,
  // donc modifier une cellule ne réécrit que sa propre ligne (diff git minimal).
  .use(remarkGfm, { tablePipeAlign: false })
  .use(remarkMath)
  .use(remarkUnderlinePlugin)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Identifiant de bloc unique d'un poste à l'autre (modèle partagé de l'édition en temps réel). */
export const newId = () => `b-${crypto.randomUUID()}`
let _clipboardTableCounter = 0
export const newClipboardTableId = () => `clipboard-table-${++_clipboardTableCounter}`

export function slugifyHeadingText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '') || 'section'
}

export function parseTableMetadataComment(value: string): TableMetadata | null {
  const match = value.trim().match(/^<!--\s*holo:table\s+([\s\S]+?)\s*-->$/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as TableMetadata
    if (!parsed || typeof parsed !== 'object') return null
    const isAggregation = (entry: unknown): entry is TableColumnAggregation =>
      entry === 'none' || entry === 'count' || entry === 'sum' || entry === 'avg' || entry === 'min' || entry === 'max' || entry === 'checked'
    return {
      columnTypes: Array.isArray(parsed.columnTypes)
        ? parsed.columnTypes.filter((entry) => entry === 'text' || entry === 'number' || entry === 'currency' || entry === 'date' || entry === 'checkbox')
        : undefined,
      columnColors: Array.isArray(parsed.columnColors)
        ? parsed.columnColors.map((entry) => (typeof entry === 'string' && entry ? entry : null))
        : undefined,
      columnAggregations: Array.isArray(parsed.columnAggregations)
        ? parsed.columnAggregations.filter(isAggregation)
        : undefined,
      columnWidths: Array.isArray(parsed.columnWidths)
        ? parsed.columnWidths.map((entry) => (typeof entry === 'number' && Number.isFinite(entry) && entry > 0 ? Math.round(entry) : null))
        : undefined,
    }
  } catch {
    return null
  }
}

function hasNonDefaultTableMetadata(metadata: TableMetadata | undefined): boolean {
  if (!metadata) return false
  const hasTypedColumns = metadata.columnTypes?.some((entry) => entry && entry !== 'text') ?? false
  const hasColoredColumns = metadata.columnColors?.some((entry) => Boolean(entry)) ?? false
  const hasAggregatedColumns = metadata.columnAggregations?.some((entry) => entry && entry !== 'none') ?? false
  const hasCustomWidths = metadata.columnWidths?.some((entry) => typeof entry === 'number') ?? false
  return hasTypedColumns || hasColoredColumns || hasAggregatedColumns || hasCustomWidths
}

export function buildTableMetadataComment(metadata: TableMetadata | undefined): string | null {
  if (!hasNonDefaultTableMetadata(metadata)) return null
  const payload: TableMetadata = {}
  if (metadata?.columnTypes?.some((entry) => entry && entry !== 'text')) {
    payload.columnTypes = metadata.columnTypes
  }
  if (metadata?.columnColors?.some((entry) => Boolean(entry))) {
    payload.columnColors = metadata.columnColors
  }
  if (metadata?.columnAggregations?.some((entry) => entry && entry !== 'none')) {
    payload.columnAggregations = metadata.columnAggregations
  }
  if (metadata?.columnWidths?.some((entry) => typeof entry === 'number')) {
    payload.columnWidths = metadata.columnWidths
  }
  return `<!-- holo:table ${JSON.stringify(payload)} -->`
}

const IMAGE_DISPLAY_MODES: ImageDisplayMode[] = ['full', 'banner', 'thumbnail', 'quarter', 'half']

export function parseImageMetadataComment(value: string): ImageMetadata | null {
  const match = value.trim().match(/^<!--\s*holo:image\s+([\s\S]+?)\s*-->$/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1]) as ImageMetadata
    if (!parsed || typeof parsed !== 'object') return null
    const mode = IMAGE_DISPLAY_MODES.includes(parsed.displayMode as ImageDisplayMode) ? parsed.displayMode : undefined
    return { displayMode: mode }
  } catch {
    return null
  }
}

function hasNonDefaultImageMetadata(metadata: ImageMetadata | undefined): boolean {
  return Boolean(metadata?.displayMode && metadata.displayMode !== 'full')
}

export function buildImageMetadataComment(metadata: ImageMetadata | undefined): string | null {
  if (!hasNonDefaultImageMetadata(metadata)) return null
  return `<!-- holo:image ${JSON.stringify({ displayMode: metadata!.displayMode })} -->`
}

export function paragraphSingleImage(node: BlockNode): ImageNode | null {
  if (node.type !== 'paragraph') return null
  const para = node as ParagraphNode
  if (para.children.length === 1 && para.children[0].type === 'image') return para.children[0] as ImageNode
  return null
}

// Au chargement, le markdown standard `mot[^1]` est parsé en [text "mot", footnoteReference]
// sans information d'ancre. On rattache le mot précédent à la référence pour restaurer
// le surlignage du mot ancré (et l'aperçu du tooltip au survol).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reattachFootnoteAnchors(node: any): void {
  if (!node || typeof node !== 'object') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] | undefined = node.children
  if (!Array.isArray(children)) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child?.type === 'footnoteReference' && !child.anchorText) {
      const prev = children[i - 1]
      if (prev?.type === 'text' && typeof prev.value === 'string') {
        const match = prev.value.match(/(\S+)$/)
        if (match) {
          child.anchorText = match[1]
          prev.value = prev.value.slice(0, prev.value.length - match[1].length)
        }
      }
    } else {
      reattachFootnoteAnchors(child)
    }
  }
}

/** trailingParagraph : ajoute le paragraphe vide final de l'éditeur (défaut : oui). */
export function markdownToBlocks(markdown: string, options: { trailingParagraph?: boolean } = {}): BlockState[] {
  if (!markdown.trim()) return [freshParagraph()]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = parser.parse(markdown) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = tree.children
  const result: BlockState[] = []
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    // Détecte le commentaire HTML <!-- list-style:alpha --> suivi d'une liste
    if (
      node.type === 'html' && (node.value as string).trim() === '<!-- list-style:alpha -->' &&
      i + 1 < children.length && children[i + 1].type === 'list'
    ) {
      const listNode = { ...children[i + 1], data: { ...(children[i + 1].data ?? {}), listStyle: 'alpha' } }
      result.push({ id: newId(), node: convertHtmlUnderline(listNode) })
      i++ // sauter la liste (déjà consommée)
    } else if (
      node.type === 'html'
      && /^<details(?:\s|>)/i.test((node.value as string).trim())
    ) {
      let closingIndex = -1
      for (let cursor = i + 1; cursor < children.length; cursor++) {
        if (children[cursor].type === 'html' && (children[cursor].value as string).trim() === '</details>') {
          closingIndex = cursor
          break
        }
      }

      if (closingIndex !== -1) {
        const innerChildren = children.slice(i + 1, closingIndex)
        const innerMarkdown = serializer.stringify({
          type: 'root',
          children: innerChildren,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).trim()
        const combinedValue = innerMarkdown
          ? `${(node.value as string).trim()}\n\n${innerMarkdown}\n${(children[closingIndex].value as string).trim()}`
          : `${(node.value as string).trim()}\n${(children[closingIndex].value as string).trim()}`

        result.push({ id: newId(), node: { type: 'html', value: combinedValue } })
        i = closingIndex
      } else {
        result.push({ id: newId(), node: convertHtmlUnderline(node) })
      }
    } else if (
      node.type === 'html'
      && i + 1 < children.length
      && children[i + 1].type === 'table'
    ) {
      const tableMetadata = parseTableMetadataComment(node.value as string)
      if (tableMetadata) {
        const tableNode = {
          ...children[i + 1],
          data: {
            ...(children[i + 1].data ?? {}),
            holoTable: tableMetadata,
          },
        }
        result.push({ id: newId(), node: convertHtmlUnderline(tableNode) })
        i++
      } else {
        result.push({ id: newId(), node: convertHtmlUnderline(node) })
      }
    } else if (
      node.type === 'html'
      && i + 1 < children.length
      && children[i + 1].type === 'paragraph'
      && children[i + 1].children?.length === 1
      && children[i + 1].children[0].type === 'image'
    ) {
      const imageMetadata = parseImageMetadataComment(node.value as string)
      if (imageMetadata?.displayMode) {
        const paragraphNode = children[i + 1]
        const imageChild = {
          ...paragraphNode.children[0],
          data: {
            ...(paragraphNode.children[0].data ?? {}),
            holoImage: imageMetadata,
          },
        }
        const wrappedNode = { ...paragraphNode, children: [imageChild] }
        result.push({ id: newId(), node: convertHtmlUnderline(wrappedNode) })
        i++
      } else {
        result.push({ id: newId(), node: convertHtmlUnderline(node) })
      }
    } else if (
      // $$formula$$ sur une ligne → parsé en inlineMath dans un paragraphe → convertir en bloc math
      node.type === 'paragraph' &&
      node.children?.length === 1 &&
      node.children[0].type === 'inlineMath'
    ) {
      result.push({ id: newId(), node: { type: 'math', value: node.children[0].value, meta: null } as unknown as BlockNode })
    } else if (node.type === 'footnoteDefinition') {
      // Skip: footnote definitions are stored in FootnotesContext and appended on save
    } else {
      result.push({ id: newId(), node: convertHtmlUnderline(node) })
    }
  }
  for (const block of result) reattachFootnoteAnchors(block.node)
  const blocks = result.length > 0 ? result : [freshParagraph()]
  return options.trailingParagraph === false ? blocks : ensureTrailingParagraph(blocks)
}

// Extract footnote definitions from markdown into a Map<identifier, content>
export function extractFootnoteMapFromMarkdown(markdown: string): Map<string, string> {
  if (!markdown.trim()) return new Map()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = parser.parse(markdown) as any
  const map = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const node of tree.children as any[]) {
    if (node.type === 'footnoteDefinition' && node.identifier) {
      // Serialize the definition content back to plain text
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = serializer.stringify({ type: 'root', children: node.children ?? [] } as any).trim()
      map.set(String(node.identifier), content)
    }
  }
  return map
}

// Ensure there is always a trailing empty paragraph so the user can always click below
export function ensureTrailingParagraph(blocks: BlockState[]): BlockState[] {
  if (blocks.length === 0) return [freshParagraph()]
  const lastNode = blocks[blocks.length - 1].node
  if (lastNode.type === 'paragraph' && (!('children' in lastNode) || (lastNode as {children: unknown[]}).children.length === 0)) {
    return blocks
  }
  // Check if last block is an empty paragraph (text = "")
  if (lastNode.type === 'paragraph') {
    const kids = (lastNode as {children: {value?: string}[]}).children
    const text = kids.map(k => k.value ?? '').join('')
    if (text === '') return blocks
  }
  return [...blocks, freshParagraph()]
}

function wrapInlineHtmlTag(tagName: 'u' | 'sup' | 'sub', children: InlineNode[]) {
  const type = tagName === 'u' ? 'underline' : tagName === 'sup' ? 'superscript' : 'subscript'
  return { type, children }
}

// Convertit les nœuds HTML inline `<u>`, `<sup>`, `<sub>` en nœuds sémantiques lors du chargement
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertHtmlUnderline(node: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convertChildren = (children: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const convertedChildren: any[] = []

    for (let index = 0; index < children.length; index++) {
      const child = children[index]
      if (child?.type === 'html') {
        const openMatch = (child.value as string).trim().match(/^<(u|sup|sub)>$/i)
        if (openMatch) {
          const tagName = openMatch[1].toLowerCase() as 'u' | 'sup' | 'sub'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const nestedChildren: any[] = []
          let depth = 1
          let cursor = index + 1

          for (; cursor < children.length; cursor++) {
            const candidate = children[cursor]
            if (candidate?.type === 'html') {
              const candidateValue = (candidate.value as string).trim().toLowerCase()
              if (candidateValue === `<${tagName}>`) depth++
              if (candidateValue === `</${tagName}>`) {
                depth--
                if (depth === 0) break
              }
            }
            nestedChildren.push(candidate)
          }

          if (depth === 0) {
            const nestedNode = convertHtmlUnderline({ type: 'paragraph', children: nestedChildren })
            convertedChildren.push(wrapInlineHtmlTag(tagName, nestedNode.children ?? []))
            index = cursor
            continue
          }
        }
      }

      convertedChildren.push(convertHtmlUnderline(child))
    }

    return convertedChildren
  }

  if (!node) return node
  if (Array.isArray(node.children)) {
    return { ...node, children: convertChildren(node.children) }
  }

  if (node.type === 'html') {
    const m = node.value.match(/^<(u|sup|sub)>([\s\S]*)<\/\1>$/i)
    if (m && typeof document !== 'undefined') {
      const tmp = document.createElement('div')
      tmp.innerHTML = m[2]
      return wrapInlineHtmlTag(m[1].toLowerCase() as 'u' | 'sup' | 'sub', domToInlines(tmp))
    }
  }
  return node
}

/**
 * Sérialise un tableau GFM en écrivant la ligne de séparation au format
 * usuel `| --- |` (remark produit `| - |`) : un fichier écrit par un autre
 * outil garde ainsi sa ligne de séparation intacte lors d'une édition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeTableNode(tableNode: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markdown = (serializer.stringify({ type: 'root', children: [tableNode] } as any) as string).replace(/\n+$/, '')
  const lines = markdown.split('\n')
  if (lines.length >= 2) {
    lines[1] = lines[1].replace(/(?<=\|) *(:?)-+(:?) *(?=\|)/g, (_match, left: string, right: string) => {
      const dashes = '-'.repeat(Math.max(1, 3 - left.length - right.length))
      return ` ${left}${dashes}${right} `
    })
  }
  return lines.join('\n')
}

export function blocksToMarkdown(blocks: BlockState[], footnoteMap?: Map<string, string>): string {
  // Développe les listes alpha en [commentaire HTML + liste standard]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expanded: any[] = []
  // Une ligne vide n'a pas d'équivalent markdown : elle n'écrit rien (sinon
  // des lignes blanches en trop, et en édition partagée un texte qui diffère
  // de celui des autres).
  for (const b of blocks.filter((block) => !isEmptyParagraphBlock(block))) {
    if (b.node.type === 'list' && (b.node as ListNode).data?.listStyle === 'alpha') {
      expanded.push({ type: 'html', value: '<!-- list-style:alpha -->' })
      // Sérialiser sans le champ data pour éviter les avertissements remark
      const { data: _d, ...nodeWithoutData } = b.node as ListNode
      expanded.push(nodeWithoutData)
    } else if (b.node.type === 'table') {
      const tableNode = b.node as TableNode
      const metadataComment = buildTableMetadataComment(tableNode.data?.holoTable)
      if (metadataComment) {
        expanded.push({ type: 'html', value: metadataComment })
      }
      const { data: _d, ...nodeWithoutData } = tableNode
      expanded.push({ type: 'html', value: serializeTableNode(nodeWithoutData) })
    } else if (paragraphSingleImage(b.node)) {
      const image = paragraphSingleImage(b.node) as ImageNode
      const comment = buildImageMetadataComment(image.data?.holoImage)
      if (comment) expanded.push({ type: 'html', value: comment })
      expanded.push(b.node)
    } else if (b.node.type === 'image') {
      const image = b.node as ImageNode
      const comment = buildImageMetadataComment(image.data?.holoImage)
      if (comment) expanded.push({ type: 'html', value: comment })
      expanded.push(b.node)
    } else {
      expanded.push(b.node)
    }
  }  const markdown = serializer.stringify({
    type: 'root',
    children: expanded,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as string

  let result = markdown.replace(/^> \\\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/gim, '> [!$1]')

  // Append footnote definitions at the end (standard Markdown format)
  if (footnoteMap && footnoteMap.size > 0) {
    const defs = Array.from(footnoteMap.entries())
      .map(([id, content]) => `[^${id}]: ${content}`)
      .join('\n')
    result = result.trimEnd() + '\n\n' + defs + '\n'
  }

  return result
}

/**
 * Markdown tel que l'éditeur le réémettrait pour `markdown` sans aucune
 * modification. Sert de base à la fusion 3 voies à l'enregistrement : seules
 * les différences entre cette forme et la saisie sont appliquées au fichier,
 * le reste de sa mise en forme d'origine est conservé.
 */
export function normalizeBodyMarkdown(markdown: string): string {
  return blocksToMarkdown(markdownToBlocks(markdown), extractFootnoteMapFromMarkdown(markdown))
}

/** Paragraphe vide : une ligne vide n'existe pas en markdown, seulement dans l'éditeur. */
export function isEmptyParagraphBlock(block: BlockState): boolean {
  return block.node.type === 'paragraph'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    && (block.node.children ?? []).every((child: any) => child.type === 'text' && child.value === '')
}

export function freshParagraph(): BlockState {
  return {
    id: newId(),
    node: { type: 'paragraph', children: [] } as ParagraphNode,
  }
}
