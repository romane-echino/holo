/**
 * BlockEditor.tsx — Orchestrateur principal
 *
 * - Source de vérité en mémoire : BlockState[] (mdast nodes + id)
 * - Parse initial : markdown → remark-parse → BlockState[]
 * - Sauvegarde : BlockState[] → remark-stringify → markdown string → onChange()
 * - Gestion clavier inter-blocs : Enter crée un paragraphe, Backspace supprime un bloc vide
 *
 * Seul ParagraphBlock est implémenté pour l'instant.
 * Les autres types sont rendus en fallback non-éditable.
 */

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useImperativeHandle, forwardRef } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { GripVertical } from 'lucide-react'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TableBlock } from './blocks/TableBlock'
import { ListBlock } from './blocks/ListBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { BlockquoteBlock } from './blocks/BlockquoteBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { MathBlock } from './blocks/MathBlock'
import { FootnoteBlock } from './blocks/FootnoteBlock'
import { SlashCommandPopup } from './SlashCommandPopup'
import { domToInlines } from './lib/domToInlines'
import { cn } from '../../utils/global'
import type { BlockNode, BlockState, InlineNode, ParagraphNode, HeadingNode, TableNode, ListNode, CodeNode, BlockquoteNode, ImageNode, TextNode } from './lib/types'
import type { MathNode } from './blocks/MathBlock'
import type { FootnoteDefinitionNode } from './blocks/FootnoteBlock'
import type { InlineEditorHandle } from './InlineEditor'

// ─── Singletons remark ──────────────────────────────────────────────────────

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// Plugin de sérialisation pour les nœuds <underline> → <u>...</u> dans le markdown
function remarkUnderlinePlugin(this: any) {
  const data = this.data() as Record<string, any>
  if (!data.toMarkdownExtensions) data.toMarkdownExtensions = []
  data.toMarkdownExtensions.push({
    handlers: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      underline(node: any, _: any, state: any, info: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return '<u>' + (state as any).containerPhrasing(node, info) + '</u>'
      },
    },
  })
}

const serializer = unified()
  .use(remarkStringify, { bullet: '-', fence: '`', strong: '*', emphasis: '_' })
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkUnderlinePlugin)

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = 0
const newId = () => `b${++_counter}`

function markdownToBlocks(markdown: string): BlockState[] {
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
      // $$formula$$ sur une ligne → parsé en inlineMath dans un paragraphe → convertir en bloc math
      node.type === 'paragraph' &&
      node.children?.length === 1 &&
      node.children[0].type === 'inlineMath'
    ) {
      result.push({ id: newId(), node: { type: 'math', value: node.children[0].value, meta: null } as unknown as BlockNode })
    } else {
      result.push({ id: newId(), node: convertHtmlUnderline(node) })
    }
  }
  return ensureTrailingParagraph(result.length > 0 ? result : [freshParagraph()])
}

// Ensure there is always a trailing empty paragraph so the user can always click below
function ensureTrailingParagraph(blocks: BlockState[]): BlockState[] {
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

// Convertit les nœuds HTML inline `<u>...</u>` en nœuds underline lors du chargement
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertHtmlUnderline(node: any): any {
  if (!node) return node
  if (node.type === 'html') {
    const m = node.value.match(/^<u>([\s\S]*)<\/u>$/)
    if (m) {
      const tmp = document.createElement('div')
      tmp.innerHTML = m[1]
      return { type: 'underline', children: domToInlines(tmp) }
    }
  }
  if (node.children) {
    return { ...node, children: node.children.map(convertHtmlUnderline) }
  }
  return node
}

function blocksToMarkdown(blocks: BlockState[]): string {
  // Développe les listes alpha en [commentaire HTML + liste standard]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const expanded: any[] = []
  for (const b of blocks) {
    if (b.node.type === 'list' && (b.node as ListNode).data?.listStyle === 'alpha') {
      expanded.push({ type: 'html', value: '<!-- list-style:alpha -->' })
      // Sérialiser sans le champ data pour éviter les avertissements remark
      const { data: _d, ...nodeWithoutData } = b.node as ListNode
      expanded.push(nodeWithoutData)
    } else {
      expanded.push(b.node)
    }
  }
  return serializer.stringify({
    type: 'root',
    children: expanded,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as string
}

function freshParagraph(): BlockState {
  return {
    id: newId(),
    node: { type: 'paragraph', children: [] } as ParagraphNode,
  }
}

// Découpe les inlines aux <br> — utile quand on colle du texte multiligne puis qu'on
// convertit le bloc en liste (une ligne = un item).
function splitAtBreaks(inlines: InlineNode[]): InlineNode[][] {
  const lines: InlineNode[][] = []
  let current: InlineNode[] = []
  for (const node of inlines) {
    if (node.type === 'break') {
      lines.push(current)
      current = []
    } else {
      current.push(node)
    }
  }
  lines.push(current)
  const nonEmpty = lines.filter((l) => l.length > 0)
  return nonEmpty.length > 0 ? nonEmpty : [[]]
}

function isEmptyBlock(node: BlockNode): boolean {
  if (node.type === 'paragraph') {
    const text = (node as ParagraphNode).children
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((n: any) => n.value ?? '')
      .join('')
    return !text.trim()
  }
  // Liste avec un seul item vide → considérée comme vide
  if (node.type === 'list') {
    const ln = node as ListNode
    if (ln.children.length !== 1) return false
    const para = ln.children[0].children.find((c) => c.type === 'paragraph') as ParagraphNode | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (para?.children ?? []).map((n: any) => n.value ?? '').join('')
    return !text.trim()
  }
  // Blockquote avec premier paragraphe vide
  if (node.type === 'blockquote') {
    const bq = node as BlockquoteNode
    const firstPara = bq.children[0] as ParagraphNode | undefined
    if (!firstPara || firstPara.type !== 'paragraph') return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !(firstPara.children as any[]).map((n: any) => n.value ?? '').join('').trim()
  }
  // Note de bas de page avec contenu vide
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((node as any).type === 'footnoteDefinition') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = node as any
    const firstPara = fn.children?.[0]
    if (!firstPara || firstPara.type !== 'paragraph') return true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !(firstPara.children ?? []).map((n: any) => n.value ?? '').join('').trim()
  }
  return false
}

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export interface BlockEditorHandle {
  insertImage: (url: string, alt: string) => void
}

export interface BlockEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  className?: string
  fontScale?: number
}

export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(function BlockEditor({ markdown, onChange, className, fontScale }: BlockEditorProps, ref) {
  const [blocks, setBlocks] = useState<BlockState[]>(() => markdownToBlocks(markdown))
  const [slashCommand, setSlashCommand] = useState<{ blockId: string } | null>(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const dragAnchorRef = useRef<string | null>(null)

  // Drag-reorder state
  const [dragReorderBlockId, setDragReorderBlockId] = useState<string | null>(null)
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null)
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after'>('after')

  // Refs impératifs vers chaque InlineEditor — pour la navigation inter-blocs
  const blockRefs = useRef<Map<string, InlineEditorHandle>>(new Map())

  // Ref pour focus différé + slash command différée (bouton +)
  const pendingFocusRef = useRef<string | null>(null)
  const pendingSlashRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return
    const handle = blockRefs.current.get(pendingFocusRef.current)
    if (!handle) return
    const slashId = pendingSlashRef.current
    pendingFocusRef.current = null
    handle.focus()
    if (slashId) {
      pendingSlashRef.current = null
      setSlashCommand({ blockId: slashId })
    }
  })

  // Lecture synchrone des blocs — évite de fermer sur des états stales dans les handlers
  const blocksRef = useRef<BlockState[]>(blocks)
  blocksRef.current = blocks

  // Ref pour distinguer les changements internes des changements de prop externes
  const lastEmittedRef = useRef<string>(markdown)

  // Ref pour déclencher onChange hors de la phase rendu (évite setState-during-render)
  const blocksDirtyRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // Changement externe du prop markdown → réinitialise sans émettre en retour
  useEffect(() => {
    if (markdown !== lastEmittedRef.current) {
      console.log('[BlockEditor] ⚠️ EXTERNAL SYNC fired! markdown prop changed, resetting blocks. Blocks before reset:', blocksRef.current.length, '→', markdownToBlocks(markdown).length)
      console.log('[BlockEditor] lastEmitted:', JSON.stringify(lastEmittedRef.current?.slice(0, 80)))
      console.log('[BlockEditor] new markdown:', JSON.stringify(markdown?.slice(0, 80)))
      lastEmittedRef.current = markdown
      blocksDirtyRef.current = false
      setBlocks(markdownToBlocks(markdown))
    }
  }, [markdown])

  // Émet les changements internes au parent après le rendu (jamais pendant)
  useEffect(() => {
    if (!blocksDirtyRef.current) return
    blocksDirtyRef.current = false
    const md = blocksToMarkdown(blocks)
    console.log('[BlockEditor] 📤 EMIT', blocks.length, 'blocks →', JSON.stringify(md.slice(0, 120)))
    lastEmittedRef.current = md
    onChangeRef.current(md)
  }, [blocks])

  const handleBlockChange = useCallback(
    (id: string, node: BlockNode) => {
      blocksDirtyRef.current = true
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, node } : b)))
    },
    [],
  )

  const handleEnterAtStart = useCallback(
    (id: string) => {
      const newBlock = freshParagraph()
      pendingFocusRef.current = newBlock.id
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx), newBlock, ...prev.slice(idx)]
      })
    },
    [],
  )

  const handleEnterAtEnd = useCallback(
    (id: string) => {
      const newBlock = freshParagraph()
      pendingFocusRef.current = newBlock.id
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      })
    },
    [],
  )

  const handleSplit = useCallback(
    (id: string, after: InlineNode[]) => {
      const newBlock: BlockState = {
        id: crypto.randomUUID(),
        node: { type: 'paragraph', children: after } as ParagraphNode,
      }
      pendingFocusRef.current = newBlock.id
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      })
    },
    [],
  )

  const handleBackspaceAtStart = useCallback(
    (id: string) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return
      if (idx === 0) {
        if (prev.length === 1) return
        pendingFocusRef.current = prev[1].id
        blocksDirtyRef.current = true
        setBlocks((s) => s.filter((b) => b.id !== id))
        return
      }
      if (!isEmptyBlock(prev[idx].node)) return
      pendingFocusRef.current = prev[idx - 1].id
      blocksDirtyRef.current = true
      setBlocks((s) => s.filter((b) => b.id !== id))
    },
    [],
  )

  const handleDeleteAtEnd = useCallback(
    (id: string) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1 || idx === prev.length - 1) return
      const nextBlock = prev[idx + 1]
      const currentBlock = prev[idx]
      // Bloc suivant vide → le supprimer, focus reste sur le bloc courant
      if (isEmptyBlock(nextBlock.node)) {
        blocksDirtyRef.current = true
        setBlocks((s) => s.filter((b) => b.id !== nextBlock.id))
        return
      }
      // Paragraphe + paragraphe suivant → fusionner les contenus
      if (currentBlock.node.type === 'paragraph' && nextBlock.node.type === 'paragraph') {
        const mergedChildren = [
          ...(currentBlock.node as ParagraphNode).children,
          ...(nextBlock.node as ParagraphNode).children,
        ]
        blocksDirtyRef.current = true
        setBlocks((s) =>
          s
            .map((b) => b.id === id ? { ...b, node: { type: 'paragraph', children: mergedChildren } as ParagraphNode } : b)
            .filter((b) => b.id !== nextBlock.id),
        )
        return
      }
      // Sinon : laisser le navigateur gérer la suppression dans le bloc courant
    },
    [],
  )

  const handleSmartPaste = useCallback(
    (id: string, before: InlineNode[], after: InlineNode[], pastedMd: string) => {
      const pastedBlocks = markdownToBlocks(pastedMd.trim())

      // Fusionner before dans le premier bloc collé
      const first = pastedBlocks[0]
      if (first.node.type === 'paragraph') {
        ;(first.node as ParagraphNode).children = [
          ...before,
          ...(first.node as ParagraphNode).children,
        ]
      } else if (before.length > 0) {
        pastedBlocks.unshift({ id: newId(), node: { type: 'paragraph', children: before } as ParagraphNode })
      }

      // Fusionner after dans le dernier bloc collé
      const last = pastedBlocks[pastedBlocks.length - 1]
      if (last.node.type === 'paragraph') {
        ;(last.node as ParagraphNode).children = [
          ...(last.node as ParagraphNode).children,
          ...after,
        ]
      } else if (after.length > 0) {
        pastedBlocks.push({ id: newId(), node: { type: 'paragraph', children: after } as ParagraphNode })
      }

      pendingFocusRef.current = pastedBlocks[pastedBlocks.length - 1].id
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx), ...pastedBlocks, ...prev.slice(idx + 1)]
      })
    },
    [],
  )

  const handleArrowUp = useCallback(
    (id: string, cursorX: number) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx <= 0) return
      const targetId = prev[idx - 1].id
      setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'bottom' }), 0)
    },
    [],
  )

  const handleArrowDown = useCallback(
    (id: string, cursorX: number) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return
      // Si c'est le dernier bloc ET que c'est un tableau, créer un paragraphe vide après
      if (idx === prev.length - 1) {
        if (prev[idx].node.type === 'table') {
          const newBlock = freshParagraph()
          pendingFocusRef.current = newBlock.id
          blocksDirtyRef.current = true
          setBlocks((s) => [...s, newBlock])
        }
        return
      }
      const targetId = prev[idx + 1].id
      setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'top' }), 0)
    },
    [],
  )

  // Conversion de type (raccourci markdown ou slash command)
  const handleConvert = useCallback(
    (id: string, targetType: string, children?: InlineNode[]) => {
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        console.log('[BlockEditor] 🔄 handleConvert setBlocks updater called — prev.length=', prev.length, 'targetType=', targetType, 'id=', id.slice(0,8))
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) {
          console.warn('[BlockEditor] ❌ handleConvert: block id not found in prev!')
          return prev
        }
        const current = prev[idx].node
        const kids = children ?? ('children' in current ? (current as ParagraphNode).children : [])
        let newNode: BlockNode

        if (targetType === 'paragraph') {
          newNode = { type: 'paragraph', children: kids }
        } else if (targetType.startsWith('heading-')) {
          const depth = parseInt(targetType.split('-')[1]) as 1|2|3|4
          newNode = { type: 'heading', depth, children: kids }
        } else if (targetType === 'table') {
          const cell = () => ({ type: 'tableCell' as const, children: [] })
          const row  = () => ({ type: 'tableRow'  as const, children: [cell(), cell(), cell()] })
          newNode = { type: 'table', align: ['left', 'left', 'left'], children: [row(), row(), row()] } as TableNode
        } else if (targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'list-alpha') {
          const ordered = targetType !== 'list-bullet'
          const lines = splitAtBreaks(kids)
          const listData = targetType === 'list-alpha' ? { listStyle: 'alpha' } : undefined
          newNode = {
            type: 'list', ordered, start: ordered ? 1 : null, spread: false,
            ...(listData ? { data: listData } : {}),
            children: lines.map((line) => ({
              type: 'listItem' as const, spread: false, checked: null,
              children: [{ type: 'paragraph' as const, children: line }],
            })),
          } as ListNode
        } else if (targetType === 'checklist') {
          const lines = splitAtBreaks(kids)
          newNode = {
            type: 'list', ordered: false, start: null, spread: false,
            children: lines.map((line) => ({
              type: 'listItem' as const, spread: false, checked: false,
              children: [{ type: 'paragraph' as const, children: line }],
            })),
          } as ListNode
        } else if (targetType === 'math') {
          newNode = { type: 'math', value: '', meta: null } as unknown as BlockNode
        } else if (targetType.startsWith('math-value:')) {
          const formula = targetType.slice('math-value:'.length)
          newNode = { type: 'math', value: formula, meta: null } as unknown as BlockNode
        } else if (targetType === 'blockquote') {
          newNode = { type: 'blockquote', children: [{ type: 'paragraph', children: kids }] } as unknown as BlockNode
        } else if (targetType === 'footnote') {
          const id = 'note-' + Math.random().toString(36).slice(2, 6)
          newNode = { type: 'footnoteDefinition', identifier: id, label: id, children: [{ type: 'paragraph', children: kids }] } as unknown as BlockNode
        } else if (targetType === 'separator') {
          newNode = { type: 'thematicBreak' } as unknown as BlockNode
        } else {
          return prev
        }

        let updated = prev.map((b) => b.id === id ? { ...b, node: newNode } : b)
        // Si tableau/liste/math/blockquote/separator/heading/footnote est inséré en dernière position, ajouter un paragraphe vide
        if ((targetType === 'table' || targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'list-alpha' || targetType === 'checklist' || targetType === 'math' || targetType.startsWith('math-value:') || targetType === 'blockquote' || targetType === 'separator' || targetType.startsWith('heading-') || targetType === 'footnote') && idx === prev.length - 1) {
          updated = [...updated, freshParagraph()]
        }
        console.log('[BlockEditor] 🔄 handleConvert result:', updated.length, 'blocks (was', prev.length, ')')
        updated.forEach((b, i) => console.log(`  [${i}] id=${b.id.slice(0,8)} type=${b.node.type}`))
        return updated
      })
      setTimeout(() => blockRefs.current.get(id)?.focus(), 0)
    },
    [],
  )

  const handleSlashCommand = useCallback(
    (blockId: string) => {
      console.log('[BlockEditor] 🔪 SLASH COMMAND opened for block', blockId, '— total blocks:', blocksRef.current.length)
      blocksRef.current.forEach((b, i) => console.log(`  [${i}] id=${b.id.slice(0,8)} type=${b.node.type}`))
      setSlashCommand({ blockId })
    },
    [],
  )

  const handleSlashCancel = useCallback(() => {
    if (!slashCommand) return
    const { blockId } = slashCommand
    setSlashCommand(null)
    // Supprimer le "/" et le texte tapé du DOM
    const inlines = blockRefs.current.get(blockId)?.clearSlash() ?? []
    // Mettre à jour l'état React avec le contenu nettoyé
    const block = blocksRef.current.find((b) => b.id === blockId)
    if (!block) return
    handleBlockChange(blockId, { ...block.node, children: inlines } as BlockNode)
  }, [slashCommand, handleBlockChange])

  const handleSlashSelect = useCallback(
    (blockType: string) => {
      if (!slashCommand) return
      const { blockId } = slashCommand
      console.log('[BlockEditor] ✅ SLASH SELECT', blockType, 'for block', blockId, '— total blocks before convert:', blocksRef.current.length)
      setSlashCommand(null)
      // Supprimer le "/" du DOM et récupérer le contenu restant
      const children = blockRefs.current.get(blockId)?.clearSlash() ?? []
      console.log('[BlockEditor] clearSlash returned', children.length, 'inline nodes')
      handleConvert(blockId, blockType, children)
    },
    [slashCommand, handleConvert],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const lastFocusedBlockIdRef = useRef<string | null>(null)

  // Expose insertImage via ref
  useImperativeHandle(ref, () => ({
    insertImage(url: string, alt: string) {
      const imageNode = {
        type: 'paragraph' as const,
        children: [{ type: 'image' as const, url, alt, title: null }],
      }
      const newBlock: BlockState = { id: crypto.randomUUID(), node: imageNode }
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const focusedId = lastFocusedBlockIdRef.current
        let next: BlockState[]
        if (!focusedId) {
          next = [...prev, newBlock]
        } else {
          const idx = prev.findIndex((b) => b.id === focusedId)
          if (idx === -1) {
            next = [...prev, newBlock]
          } else {
            const focused = prev[idx]
            // Si le bloc focalisé est un paragraphe vide → le remplacer par l'image
            const isParagraph = focused.node.type === 'paragraph'
            const isEmpty = isParagraph && (focused.node as ParagraphNode).children.every(
              (c) => c.type === 'text' && (c as TextNode).value === ''
            )
            if (isEmpty) {
              next = [...prev.slice(0, idx), newBlock, ...prev.slice(idx + 1)]
            } else {
              next = [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
            }
          }
        }
        // Si l'image est le dernier bloc, ajouter un paragraphe vide après
        const last = next[next.length - 1]
        if (last?.id === newBlock.id) {
          next = [...next, freshParagraph()]
        }
        return next
      })
    },
  }))

  // Bouton + dans la marge : insère un paragraphe vide après le bloc et ouvre le slash command
  const handleInsertAndSlash = useCallback((id: string) => {
    const newBlock = freshParagraph()
    pendingFocusRef.current = newBlock.id
    pendingSlashRef.current = newBlock.id
    blocksDirtyRef.current = true
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return [...prev, newBlock]
      return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
    })
  }, [])

  // ─── Sélection de blocs ─────────────────────────────────────────────────────
  // Helper: returns block IDs in range [anchorId, targetId] (inclusive, in order)
  const getRangeOfBlocks = useCallback((anchorId: string, targetId: string): string[] => {
    const list = blocksRef.current
    const a = list.findIndex((b) => b.id === anchorId)
    const t = list.findIndex((b) => b.id === targetId)
    if (a === -1 || t === -1) return [anchorId]
    const [lo, hi] = a <= t ? [a, t] : [t, a]
    return list.slice(lo, hi + 1).map((b) => b.id)
  }, [])

  // Retourne le block-id de l'élément DOM (ou d'un ancêtre portant data-block-id)
  const getBlockIdFromEl = useCallback((el: HTMLElement | null): string | null => {
    return (el?.closest('[data-block-id]') as HTMLElement | null)?.dataset.blockId ?? null
  }, [])

  // Refs pour le drag-select au niveau conteneur
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const dragModeActiveRef = useRef(false) // true une fois le seuil de mouvement dépassé

  const handleContainerMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const blockId = getBlockIdFromEl(e.target as HTMLElement)
    if (!blockId) return
    dragStartPosRef.current = { x: e.clientX, y: e.clientY }
    dragAnchorRef.current = blockId
    dragModeActiveRef.current = false
    // Shift+click sans drag → sélection de plage immédiate
    // e.preventDefault() empêche le contenteditable de recevoir le focus (ce qui
    // effacerait la sélection via onFocusCapture)
    if (e.shiftKey && selectedBlockIds.size > 0) {
      e.preventDefault()
      const anchor = [...selectedBlockIds][0]
      setSelectedBlockIds(new Set(getRangeOfBlocks(anchor, blockId)))
      containerRef.current?.focus({ preventScroll: true })
    }
  }, [getBlockIdFromEl, getRangeOfBlocks, selectedBlockIds])

  const handleContainerMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.buttons !== 1 || !dragStartPosRef.current || !dragAnchorRef.current) return
    const dy = Math.abs(e.clientY - dragStartPosRef.current.y)
    const dx = Math.abs(e.clientX - dragStartPosRef.current.x)
    // Seuil de 10px pour entrer en mode drag-select
    if (!dragModeActiveRef.current && dy < 10 && dx < 10) return
    // Entrée en mode bloc-select : annule la sélection texte native
    if (!dragModeActiveRef.current) {
      dragModeActiveRef.current = true
      window.getSelection()?.removeAllRanges()
      setSelectedBlockIds(new Set([dragAnchorRef.current]))
      containerRef.current?.focus({ preventScroll: true })
    }
    // Étend la sélection vers le bloc sous la souris
    window.getSelection()?.removeAllRanges()
    const elUnder = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
    const hoverId = getBlockIdFromEl(elUnder)
    if (hoverId) {
      const range = getRangeOfBlocks(dragAnchorRef.current, hoverId)
      setSelectedBlockIds((prev) => {
        // Évite un setState si la sélection n'a pas changé
        if (prev.size === range.length && range.every((id) => prev.has(id))) return prev
        return new Set(range)
      })
    }
  }, [getBlockIdFromEl, getRangeOfBlocks])

  const handleContainerMouseUp = useCallback(() => {
    dragStartPosRef.current = null
    dragModeActiveRef.current = false
  }, [])

  // Ctrl+A → sélectionne tous les blocs | Ctrl+C → copie le markdown des blocs sélectionnés
  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Supprimer les blocs sélectionnés
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIds.size > 0) {
      e.preventDefault()
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const filtered = prev.filter((b) => !selectedBlockIds.has(b.id))
        return filtered.length > 0 ? filtered : [freshParagraph()]
      })
      setSelectedBlockIds(new Set())
      return
    }
    // Ctrl+C avec des blocs sélectionnés → copie le markdown correspondant
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedBlockIds.size > 0) {
      e.preventDefault()
      const selected = blocksRef.current.filter((b) => selectedBlockIds.has(b.id))
      const md = blocksToMarkdown(selected)
      navigator.clipboard.writeText(md).catch(() => {
        window.holo?.writeClipboardText?.(md)
      })
      return
    }
    // Ctrl+X avec des blocs sélectionnés → coupe le markdown (copie + suppression)
    if ((e.ctrlKey || e.metaKey) && e.key === 'x' && selectedBlockIds.size > 0) {
      e.preventDefault()
      const selected = blocksRef.current.filter((b) => selectedBlockIds.has(b.id))
      const md = blocksToMarkdown(selected)
      navigator.clipboard.writeText(md).catch(() => {
        window.holo?.writeClipboardText?.(md)
      })
      blocksDirtyRef.current = true
      setBlocks((prev) => {
        const filtered = prev.filter((b) => !selectedBlockIds.has(b.id))
        return filtered.length > 0 ? filtered : [freshParagraph()]
      })
      setSelectedBlockIds(new Set())
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      setSelectedBlockIds(new Set(blocksRef.current.map((b) => b.id)))
    }
  }, [selectedBlockIds])

  return (
    <div
      ref={containerRef}
      data-testid="block-editor"
      tabIndex={-1}
      className={cn('holo-markdown outline-none', className)}
      style={fontScale !== undefined ? { '--editor-fs-scale': fontScale } as React.CSSProperties : undefined}
      onKeyDown={handleContainerKeyDown}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMove}
      onMouseUp={handleContainerMouseUp}
      onDragStart={(e) => { if (!(e.target as HTMLElement).closest('[data-drag-handle]')) e.preventDefault() }}
    >
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          data-block-id={block.id}
          id={block.node.type === 'heading' ? 'heading-' + (block.node as HeadingNode).children.map((n: InlineNode) => ('value' in n ? (n as any).value : '')).join('').toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '') : undefined}
          draggable
          onDragStart={(e) => {
            if (!(e.target as HTMLElement).closest('[data-drag-handle]')) { e.preventDefault(); return }
            setDragReorderBlockId(block.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            if (!dragReorderBlockId || dragReorderBlockId === block.id) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setDragOverBlockId(block.id)
            setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
          }}
          onDragLeave={() => { if (dragOverBlockId === block.id) setDragOverBlockId(null) }}
          onDrop={(e) => {
            e.preventDefault()
            if (!dragReorderBlockId || dragReorderBlockId === block.id) return
            blocksDirtyRef.current = true
            setBlocks(prev => {
              const next = prev.filter(b => b.id !== dragReorderBlockId)
              const srcBlock = prev.find(b => b.id === dragReorderBlockId)!
              const targetIdx = next.findIndex(b => b.id === block.id)
              const insertAt = dragOverPos === 'before' ? targetIdx : targetIdx + 1
              next.splice(insertAt, 0, srcBlock)
              return next
            })
            setDragReorderBlockId(null)
            setDragOverBlockId(null)
          }}
          onDragEnd={() => { setDragReorderBlockId(null); setDragOverBlockId(null) }}
          className={cn(
            'group/block relative rounded-sm transition-colors',
            selectedBlockIds.has(block.id) && 'bg-holo-primary/10 ring-1 ring-inset ring-holo-primary/30',
            dragOverBlockId === block.id && dragOverPos === 'before' && 'border-t-2 border-holo-primary',
            dragOverBlockId === block.id && dragOverPos === 'after' && 'border-b-2 border-holo-primary',
            dragReorderBlockId === block.id && 'opacity-40',
          )}
          onFocusCapture={() => {
            lastFocusedBlockIdRef.current = block.id
            setSelectedBlockIds(new Set())
          }}
        >
          {/* Drag handle + bouton + dans la marge */}
          <div className="absolute -left-7 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100">
            <div
              data-drag-handle
              draggable
              className="flex size-5 cursor-grab items-center justify-center rounded text-holo-text-faint transition hover:text-holo-text active:cursor-grabbing"
              title="Glisser pour réordonner"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <GripVertical size={12} />
            </div>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleInsertAndSlash(block.id) }}
              className="flex size-5 items-center justify-center rounded-full border border-holo-border-soft bg-holo-bg text-holo-text-faint shadow-sm transition hover:border-holo-primary/40 hover:bg-holo-primary-surface hover:text-holo-primary-soft"
              title="Insérer un bloc"
              aria-label="Insérer un bloc"
            >
              <span className="text-xs leading-none">+</span>
            </button>
          </div>
          <BlockDispatcher
            block={block}
            isFirst={idx === 0}
            isSelected={selectedBlockIds.has(block.id)}
            onSelect={() => {
              setSelectedBlockIds(new Set([block.id]))
              containerRef.current?.focus({ preventScroll: true })
            }}
            blockRef={(handle) => {
              if (handle) blockRefs.current.set(block.id, handle)
              else blockRefs.current.delete(block.id)
            }}
            onChange={(node) => handleBlockChange(block.id, node)}
            onEnterAtStart={() => handleEnterAtStart(block.id)}
            onEnterAtEnd={() => handleEnterAtEnd(block.id)}
            onBackspaceAtStart={() => handleBackspaceAtStart(block.id)}
            onDeleteAtEnd={() => handleDeleteAtEnd(block.id)}
            onArrowUp={(x) => handleArrowUp(block.id, x)}
            onArrowDown={(x) => handleArrowDown(block.id, x)}
            onConvert={(type, children) => handleConvert(block.id, type, children)}
            onSlashCommand={() => handleSlashCommand(block.id)}
            onSplit={(after) => handleSplit(block.id, after)}
            onSmartPaste={(before, after, md) => handleSmartPaste(block.id, before, after, md)}
            onTabExit={() => handleArrowDown(block.id, 0)}
          />
        </div>
      ))}
      {slashCommand && (
        <SlashCommandPopup
          onSelect={handleSlashSelect}
          onClose={handleSlashCancel}
        />
      )}
    </div>
  )
})

// ─── Dispatcher ───────────────────────────────────────────────────────────────
// Route chaque bloc vers son composant. Les types non encore implémentés
// sont rendus en fallback non-éditable.

function BlockDispatcher({
  block,
  blockRef,
  isFirst,
  isSelected,
  onSelect,
  onChange,
  onEnterAtStart,
  onEnterAtEnd,
  onBackspaceAtStart,
  onDeleteAtEnd,
  onArrowUp,
  onArrowDown,
  onConvert,
  onSlashCommand,
  onSplit,
  onSmartPaste,
  onTabExit,
}: {
  block: BlockState
  blockRef: React.Ref<InlineEditorHandle>
  isFirst?: boolean
  isSelected?: boolean
  onSelect?: () => void
  onChange: (node: BlockNode) => void
  onEnterAtStart: () => void
  onEnterAtEnd: () => void
  onBackspaceAtStart: () => void
  onDeleteAtEnd: () => void
  onArrowUp: (x: number) => void
  onArrowDown: (x: number) => void
  onConvert: (type: string, children: InlineNode[]) => void
  onSlashCommand: () => void
  onSplit: (after: InlineNode[]) => void
  onSmartPaste: (before: InlineNode[], after: InlineNode[], pastedMd: string) => void
  onTabExit: () => void
}) {
  switch (block.node.type) {
    case 'paragraph': {
      // Un paragraphe ne contenant qu'une image → rendu comme ImageBlock (évite perte lors du blur)
      const para = block.node as ParagraphNode
      if (para.children.length === 1 && para.children[0].type === 'image') {
        return <ImageBlock node={para.children[0] as ImageNode} isSelected={isSelected} onSelect={onSelect} />
      }
      return (
        <ParagraphBlock
          ref={blockRef}
          node={para}
          onChange={(node) => onChange(node)}
          onEnterAtStart={onEnterAtStart}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onDeleteAtEnd={onDeleteAtEnd}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onConvert={onConvert}
          onSlashCommand={onSlashCommand}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
          alwaysShowPlaceholder={isFirst}
        />
      )
    }

    case 'heading':
      return (
        <HeadingBlock
          ref={blockRef}
          node={block.node as HeadingNode}
          onChange={(node) => onChange(node)}
          onEnterAtStart={onEnterAtStart}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onDeleteAtEnd={onDeleteAtEnd}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onConvert={onConvert}
          onSlashCommand={onSlashCommand}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
          alwaysShowPlaceholder={isFirst}
        />
      )

    case 'table':
      return (
        <TableBlock
          ref={blockRef}
          node={block.node as TableNode}
          onChange={(node) => onChange(node)}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onTabExit={onTabExit}
        />
      )

    case 'list':
      return (
        <ListBlock
          ref={blockRef}
          node={block.node as ListNode}
          onChange={(node) => onChange(node)}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
        />
      )

    case 'code':
      return <CodeBlock node={block.node as CodeNode} />

    case 'blockquote':
      return (
        <BlockquoteBlock
          ref={blockRef}
          node={block.node as BlockquoteNode}
          onChange={(node) => onChange(node as unknown as BlockNode)}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
        />
      )

    case 'image':
      return <ImageBlock node={block.node as ImageNode} isSelected={isSelected} onSelect={onSelect} />

    case 'thematicBreak':
      return (
        <div
          onClick={onSelect}
          className={cn('cursor-pointer rounded py-1 transition', isSelected && 'ring-2 ring-holo-primary/40')}
        >
          <hr className="border-holo-border-soft" />
        </div>
      )

    case 'math':
      return (
        <MathBlock
          ref={blockRef}
          node={block.node as unknown as MathNode}
          onChange={(node) => onChange(node as unknown as BlockNode)}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
        />
      )

    case 'footnoteDefinition':
      return (
        <FootnoteBlock
          ref={blockRef}
          node={block.node as unknown as FootnoteDefinitionNode}
          onChange={(node) => onChange(node as unknown as BlockNode)}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
        />
      )

    default:
      return (
        <div className="cursor-default rounded-holo-sm border border-dashed border-holo-border-soft px-2 py-1 text-sm italic text-holo-text-faint">
          [{block.node.type}]
        </div>
      )
  }
}
