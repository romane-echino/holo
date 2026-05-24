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

import { useState, useEffect, useCallback, useRef } from 'react'
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
}

export function BlockEditor({ markdown, onChange, className }: BlockEditorProps) {
  const [blocks, setBlocks] = useState<BlockState[]>(() => markdownToBlocks(markdown))
  const [slashCommand, setSlashCommand] = useState<{ blockId: string; rect: DOMRect } | null>(null)

  // Refs impératifs vers chaque InlineEditor — pour la navigation inter-blocs
  const blockRefs = useRef<Map<string, InlineEditorHandle>>(new Map())

  // Ref pour distinguer les changements externes des nôtres
  const lastEmittedRef = useRef<string>(markdown)

  useEffect(() => {
    if (markdown !== lastEmittedRef.current) {
      lastEmittedRef.current = markdown
      setBlocks(markdownToBlocks(markdown))
    }
  }, [markdown])

  const commit = useCallback(
    (updated: BlockState[]) => {
      const md = blocksToMarkdown(updated)
      lastEmittedRef.current = md
      onChange(md)
    },
    [onChange],
  )

  const handleBlockChange = useCallback(
    (id: string, node: BlockNode) => {
      setBlocks((prev) => {
        const updated = prev.map((b) => (b.id === id ? { ...b, node } : b))
        commit(updated)
        return updated
      })
    },
    [commit],
  )

  const handleEnterAtStart = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        const newBlock = freshParagraph()
        const updated = [
          ...prev.slice(0, idx),
          newBlock,
          ...prev.slice(idx),
        ]
        commit(updated)
        setTimeout(() => blockRefs.current.get(newBlock.id)?.focus(), 0)
        return updated
      })
    },
    [commit],
  )

  const handleEnterAtEnd = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        const newBlock = freshParagraph()
        const updated = [
          ...prev.slice(0, idx + 1),
          newBlock,
          ...prev.slice(idx + 1),
        ]
        commit(updated)
        setTimeout(() => blockRefs.current.get(newBlock.id)?.focus(), 0)
        return updated
      })
    },
    [commit],
  )

  const handleSplit = useCallback(
    (id: string, after: InlineNode[]) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        const newBlock: BlockState = {
          id: crypto.randomUUID(),
          node: { type: 'paragraph', children: after } as ParagraphNode,
        }
        const updated = [
          ...prev.slice(0, idx + 1),
          newBlock,
          ...prev.slice(idx + 1),
        ]
        commit(updated)
        setTimeout(() => blockRefs.current.get(newBlock.id)?.focus(), 0)
        return updated
      })
    },
    [commit],
  )

  const handleBackspaceAtStart = useCallback(
    (id: string) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        if (idx === 0) {
          if (prev.length === 1) return prev
          const targetId = prev[1].id
          const updated = prev.filter((b) => b.id !== id)
          commit(updated)
          setTimeout(() => blockRefs.current.get(targetId)?.focus(), 0)
          return updated
        }
        if (!isEmptyBlock(prev[idx].node)) return prev
        const targetId = prev[idx - 1].id
        const updated = prev.filter((b) => b.id !== id)
        commit(updated)
        setTimeout(() => blockRefs.current.get(targetId)?.focus(), 0)
        return updated
      })
    },
    [commit],
  )

  const handleArrowUp = useCallback(
    (id: string, cursorX: number) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx <= 0) return prev
        const targetId = prev[idx - 1].id
        setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'bottom' }), 0)
        return prev
      })
    },
    [],
  )

  const handleArrowDown = useCallback(
    (id: string, cursorX: number) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1 || idx === prev.length - 1) return prev
        const targetId = prev[idx + 1].id
        setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'top' }), 0)
        return prev
      })
    },
    [],
  )

  // Conversion de type (raccourci markdown ou slash command)
  const handleConvert = useCallback(
    (id: string, targetType: string, children?: InlineNode[]) => {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
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
          return prev
        }

        let updated = prev.map((b) => b.id === id ? { ...b, node: newNode } : b)
        // Si le tableau est inséré en dernière position, ajouter un paragraphe vide
        // pour que l'utilisateur puisse naviguer sous le tableau avec ↓ ou Tab.
        if ((targetType === 'table' || targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'checklist') && idx === prev.length - 1) {
          updated = [...updated, freshParagraph()]
        }
        commit(updated)
        setTimeout(() => blockRefs.current.get(id)?.focus(), 0)
        return updated
      })
    },
    [commit],
  )

  const handleSlashCommand = useCallback(
    (blockId: string, rect: DOMRect) => {
      setSlashCommand({ blockId, rect })
    },
    [],
  )

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

  return (
    <div className={cn('holo-markdown', className)}>
      {blocks.map((block) => (
        <BlockDispatcher
          key={block.id}
          block={block}
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
          onSlashCommand={(rect) => handleSlashCommand(block.id, rect)}
          onSplit={(after) => handleSplit(block.id, after)}
        />
      ))}
      {slashCommand && (
        <SlashCommandPopup
          anchorRect={slashCommand.rect}
          onSelect={handleSlashSelect}
          onClose={() => setSlashCommand(null)}
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
  onChange: (node: BlockNode) => void
  onEnterAtStart: () => void
  onEnterAtEnd: () => void
  onBackspaceAtStart: () => void
  onArrowUp: (x: number) => void
  onArrowDown: (x: number) => void
  onConvert: (type: string, children: InlineNode[]) => void
  onSlashCommand: (rect: DOMRect) => void
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
