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

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TableBlock } from './blocks/TableBlock'
import { ListBlock } from './blocks/ListBlock'
import { SlashCommandPopup } from './SlashCommandPopup'
import { cn } from '../../utils/global'
import type { BlockNode, BlockState, InlineNode, ParagraphNode, HeadingNode, TableNode, ListNode } from './lib/types'
import type { InlineEditorHandle } from './InlineEditor'

// ─── Singletons remark ──────────────────────────────────────────────────────

const parser = unified().use(remarkParse).use(remarkGfm)

const serializer = unified()
  .use(remarkStringify, { bullet: '-', fence: '`', strong: '*', emphasis: '_' })
  .use(remarkGfm)

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = 0
const newId = () => `b${++_counter}`

function markdownToBlocks(markdown: string): BlockState[] {
  if (!markdown.trim()) return [freshParagraph()]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tree = parser.parse(markdown) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tree.children.map((node: any) => ({ id: newId(), node }))
}

function blocksToMarkdown(blocks: BlockState[]): string {
  return serializer.stringify({
    type: 'root',
    children: blocks.map((b) => b.node),
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
  return false
}

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export interface BlockEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  className?: string
  fontScale?: number
}

export function BlockEditor({ markdown, onChange, className, fontScale }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<BlockState[]>(() => markdownToBlocks(markdown))
  const [slashCommand, setSlashCommand] = useState<{ blockId: string } | null>(null)

  // Refs impératifs vers chaque InlineEditor — pour la navigation inter-blocs
  const blockRefs = useRef<Map<string, InlineEditorHandle>>(new Map())

  // Ref pour le focus différé après commit DOM (évite race condition avec setTimeout)
  const pendingFocusRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!pendingFocusRef.current) return
    const handle = blockRefs.current.get(pendingFocusRef.current)
    if (!handle) return  // nouveau bloc pas encore monté — prochain render réessaiera
    pendingFocusRef.current = null
    handle.focus()
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
      if (idx === -1 || idx === prev.length - 1) return
      const targetId = prev[idx + 1].id
      setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'top' }), 0)
    },
    [],
  )

  // Conversion de type (raccourci markdown ou slash command)
  const handleConvert = useCallback(
    (id: string, targetType: string, children?: InlineNode[]) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return
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
      } else if (targetType === 'list-bullet' || targetType === 'list-ordered') {
        const ordered = targetType === 'list-ordered'
        const lines = splitAtBreaks(kids)
        newNode = {
          type: 'list', ordered, start: ordered ? 1 : null, spread: false,
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
      } else {
        return
      }

      let updated = prev.map((b) => b.id === id ? { ...b, node: newNode } : b)
      // Si le tableau est inséré en dernière position, ajouter un paragraphe vide
      if ((targetType === 'table' || targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'checklist') && idx === prev.length - 1) {
        updated = [...updated, freshParagraph()]
      }
      blocksDirtyRef.current = true
      setBlocks(updated)
      setTimeout(() => blockRefs.current.get(id)?.focus(), 0)
    },
    [],
  )

  const handleSlashCommand = useCallback(
    (blockId: string) => {
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
      setSlashCommand(null)
      // Supprimer le "/" du DOM et récupérer le contenu restant
      const children = blockRefs.current.get(blockId)?.clearSlash() ?? []
      handleConvert(blockId, blockType, children)
    },
    [slashCommand, handleConvert],
  )

  const containerRef = useRef<HTMLDivElement>(null)

  // Ctrl+A → sélectionne tout le contenu de tous les blocs
  const handleContainerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return
      const range = document.createRange()
      range.selectNodeContents(container)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }
  }, [])

  return (
    <div ref={containerRef} className={cn('holo-markdown', className)} style={fontScale !== undefined ? { '--editor-fs-scale': fontScale } as React.CSSProperties : undefined} onKeyDown={handleContainerKeyDown}>
      {blocks.map((block, idx) => (
        <BlockDispatcher
          key={block.id}
          block={block}
          isFirst={idx === 0}
          blockRef={(handle) => {
            if (handle) blockRefs.current.set(block.id, handle)
            else blockRefs.current.delete(block.id)
          }}
          onChange={(node) => handleBlockChange(block.id, node)}
          onEnterAtStart={() => handleEnterAtStart(block.id)}
          onEnterAtEnd={() => handleEnterAtEnd(block.id)}
          onBackspaceAtStart={() => handleBackspaceAtStart(block.id)}
          onArrowUp={(x) => handleArrowUp(block.id, x)}
          onArrowDown={(x) => handleArrowDown(block.id, x)}
          onConvert={(type, children) => handleConvert(block.id, type, children)}
          onSlashCommand={() => handleSlashCommand(block.id)}
          onSplit={(after) => handleSplit(block.id, after)}
        />
      ))}
      {slashCommand && (
        <SlashCommandPopup
          onSelect={handleSlashSelect}
          onClose={handleSlashCancel}
        />
      )}
    </div>
  )
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
// Route chaque bloc vers son composant. Les types non encore implémentés
// sont rendus en fallback non-éditable.

function BlockDispatcher({
  block,
  blockRef,
  isFirst,
  onChange,
  onEnterAtStart,
  onEnterAtEnd,
  onBackspaceAtStart,
  onArrowUp,
  onArrowDown,
  onConvert,
  onSlashCommand,
  onSplit,
}: {
  block: BlockState
  blockRef: React.Ref<InlineEditorHandle>
  isFirst?: boolean
  onChange: (node: BlockNode) => void
  onEnterAtStart: () => void
  onEnterAtEnd: () => void
  onBackspaceAtStart: () => void
  onArrowUp: (x: number) => void
  onArrowDown: (x: number) => void
  onConvert: (type: string, children: InlineNode[]) => void
  onSlashCommand: () => void
  onSplit: (after: InlineNode[]) => void
}) {
  switch (block.node.type) {
    case 'paragraph':
      return (
        <ParagraphBlock
          ref={blockRef}
          node={block.node as ParagraphNode}
          onChange={(node) => onChange(node)}
          onEnterAtStart={onEnterAtStart}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onConvert={onConvert}
          onSlashCommand={onSlashCommand}
          onSplit={onSplit}
          alwaysShowPlaceholder={isFirst}
        />
      )

    case 'heading':
      return (
        <HeadingBlock
          ref={blockRef}
          node={block.node as HeadingNode}
          onChange={(node) => onChange(node)}
          onEnterAtStart={onEnterAtStart}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onConvert={onConvert}
          onSlashCommand={onSlashCommand}
          onSplit={onSplit}
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

    default:
      return (
        <div className="cursor-default rounded-holo-sm border border-dashed border-holo-border-soft px-2 py-1 text-sm italic text-holo-text-faint">
          [{block.node.type}]
        </div>
      )
  }
}
