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

import React, { useState, useEffect, useCallback, useRef, useLayoutEffect, useImperativeHandle, forwardRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TableBlock } from './blocks/TableBlock'
import { ListBlock, listBlockItemsToNode } from './blocks/ListBlock'
import { CodeBlock } from './blocks/CodeBlock'
import { DetailsBlock, buildDetailsHtml, isDetailsHtmlNode } from './blocks/DetailsBlock'
import { HtmlBlock } from './blocks/HtmlBlock'
import { YouTubeBlock, buildYouTubeHtml, isYouTubeHtmlNode } from './blocks/YouTubeBlock'
import { MermaidBlock } from './blocks/MermaidBlock'
import { BlockquoteBlock } from './blocks/BlockquoteBlock'
import { ImageBlock } from './blocks/ImageBlock'
import { MathBlock } from './blocks/MathBlock'
import { SlashCommandPopup } from './SlashCommandPopup'
import { buildBlockquoteAlertNodes, type BlockquoteAlertType } from './lib/blockquoteAlerts'
import { inlinesToMarkdown } from './lib/inlinesToMarkdown'
import { setClipboardEventData } from './lib/clipboard'
import { cn } from '../../utils/global'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useEditorFilePath } from './EditorFileContext'
import { getParentPath, resolveRepoRelativePath } from '../../lib/appUtils'
import { parseMarkdownToClipboardHtml } from '../../lib/markdown'
import { useFootnotes } from '../../contexts/FootnotesContext'
import { flushPendingEdits, getHistoryOverride } from '../../lib/editorFlush'
import { singleSpliceDiff } from '../../lib/realtime/encoding'
import { blocksToMarkdown, extractFootnoteMapFromMarkdown, freshParagraph, isEmptyParagraphBlock, markdownToBlocks, newClipboardTableId, newId, paragraphSingleImage, slugifyHeadingText } from './lib/markdownBlocks'
import { alignSequences } from '../../lib/alignSequences'
import type { BlockNode, BlockState, InlineNode, ParagraphNode, HeadingNode, TableNode, ListNode, CodeNode, BlockquoteNode, ImageNode, TextNode } from './lib/types'
import type { MathNode } from './blocks/MathBlock'
import type { InlineEditorHandle } from './InlineEditor'


/** Blocs qui se mettent à jour sur place quand leur contenu change (sans être remontés). */
const BLOCK_TYPES_UPDATED_IN_PLACE = new Set(['table', 'list'])

type ReconciledBlocks = {
  blocks: BlockState[]
  /** Bloc remplacé par sa version modifiée : ancien id → nouvel id */
  replaced: Map<string, string>
}

/**
 * Remplace les blocs par ceux d'un nouveau markdown (modification reçue d'un
 * collègue) en touchant le moins possible à l'éditeur :
 * - un bloc inchangé garde son identité : son éditeur reste monté, le focus et
 *   le curseur sont préservés, même si des blocs sont insérés au-dessus ;
 * - un tableau ou une liste modifié garde aussi son identité et ne met à jour
 *   que ce qui a changé (la cellule ou l'élément en cours de saisie reste en place) ;
 * - les lignes vides locales (absentes du markdown) sont conservées à leur place.
 */
function reconcileBlocks(previous: BlockState[], nextBlocks: BlockState[]): ReconciledBlocks {
  const replaced = new Map<string, string>()
  // Comparaison sur le markdown écrit (et non la structure interne, qui peut
  // différer pour un même contenu, ex. alertes) : un bloc inchangé n'est
  // jamais remonté pendant qu'on y tape.
  const keyOf = (block: BlockState) => `${block.node.type}\n${blocksToMarkdown([block])}`
  const emptyDocument = nextBlocks.length === 1 && isEmptyParagraphBlock(nextBlocks[0])
  const content = emptyDocument ? previous : previous.filter((block) => !isEmptyParagraphBlock(block))
  const { matches, exact } = alignSequences(
    content.map(keyOf),
    nextBlocks.map(keyOf),
    (previousIndex, nextIndex) => content[previousIndex].node.type === nextBlocks[nextIndex].node.type,
  )

  const result = nextBlocks.map((block, index) => {
    const match = matches[index]
    if (match === -1) return block
    const previousBlock = content[match]
    if (exact[index]) return previousBlock
    if (BLOCK_TYPES_UPDATED_IN_PLACE.has(block.node.type)) return { id: previousBlock.id, node: block.node }
    replaced.set(previousBlock.id, block.id)
    return block
  })
  if (emptyDocument) return { blocks: result, replaced }

  // Lignes vides : réinsérées après le bloc qui les précédait.
  const nextIndexOfPrevious = new Map<string, number>()
  matches.forEach((previousIndex, nextIndex) => {
    if (previousIndex !== -1) nextIndexOfPrevious.set(content[previousIndex].id, nextIndex)
  })
  const emptiesAfter = new Map<number, BlockState[]>()
  let anchor = -1
  for (const block of previous) {
    if (isEmptyParagraphBlock(block)) {
      emptiesAfter.set(anchor, [...(emptiesAfter.get(anchor) ?? []), block])
    } else {
      anchor = nextIndexOfPrevious.get(block.id) ?? anchor
    }
  }
  if (emptiesAfter.size === 0) return { blocks: result, replaced }
  const withEmpties: BlockState[] = [...(emptiesAfter.get(-1) ?? [])]
  result.forEach((block, index) => {
    withEmpties.push(block, ...(emptiesAfter.get(index) ?? []))
  })
  return { blocks: withEmpties, replaced }
}

/** Position du curseur dans le texte d'un élément éditable (0 si hors de l'élément). */
function getCaretTextOffset(element: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const caret = selection.getRangeAt(0)
  if (!element.contains(caret.endContainer)) return 0
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(caret.endContainer, caret.endOffset)
  return range.toString().length
}

function blocksToClipboardPayload(blocks: BlockState[], footnoteMap?: Map<string, string>) {
  const markdown = blocksToMarkdown(blocks, footnoteMap)
  return {
    html: parseMarkdownToClipboardHtml(markdown, newClipboardTableId),
    markdown,
  }
}

function areBlockNodesEqual(left: BlockNode, right: BlockNode): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function areBlockStateArraysIdentical(left: BlockState[], right: BlockState[]): boolean {
  return left.length === right.length && left.every((block, index) => block === right[index])
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
      .map((n: any) => n.value ?? (n.type === 'footnoteReference' ? `[^${n.identifier ?? ''}]` : ''))
      .join('')
    return !text.trim()
  }
  // Liste avec un seul item vide → considérée comme vide
  if (node.type === 'list') {
    const ln = node as ListNode
    if (ln.children.length !== 1) return false
    const para = ln.children[0].children.find((c) => c.type === 'paragraph') as ParagraphNode | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = (para?.children ?? []).map((n: any) => n.value ?? (n.type === 'footnoteReference' ? `[^${n.identifier ?? ''}]` : '')).join('')
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
  return false
}

function buildNextFootnoteIdentifier(blocks: BlockState[], _selectedText = ''): string {
  // Find all used footnote identifiers from inline footnoteReference nodes
  const existing = new Set<string>()
  for (const block of blocks) {
    const collectFootnoteIds = (nodes: InlineNode[]) => {
      for (const node of nodes) {
        if (node.type === 'footnoteReference') {
          existing.add(String(node.identifier).trim())
        } else if ('children' in node && Array.isArray(node.children)) {
          collectFootnoteIds(node.children)
        }
      }
    }
    if (block.node.type === 'paragraph' || block.node.type === 'heading' || block.node.type === 'blockquote') {
      collectFootnoteIds((block.node as {children?: InlineNode[]}).children ?? [])
    }
  }
  
  let n = 1
  while (existing.has(String(n))) n += 1
  return String(n)
}

// ─── BlockEditor ─────────────────────────────────────────────────────────────

export interface BlockEditorHandle {
  insertImage: (url: string, alt: string) => void
  flushPendingChanges: () => void
}

export interface BlockEditorProps {
  markdown: string
  onChange: (markdown: string) => void
  className?: string
  fontScale?: number
  onOpenLinkedFile?: (filePath: string) => Promise<void> | void
}

export const BlockEditor = forwardRef<BlockEditorHandle, BlockEditorProps>(function BlockEditor({ markdown, onChange, className, fontScale, onOpenLinkedFile }: BlockEditorProps, ref) {
  const { footnotes, setFootnote, removeFootnote: removeFootnoteCtx, initFootnotes } = useFootnotes()

  // Keep a ref so closures (history snapshots etc.) always see current footnotes
  const footnotesRef = useRef(footnotes)
  footnotesRef.current = footnotes

  const [blocks, setBlocks] = useState<BlockState[]>(() => markdownToBlocks(markdown))
  const [slashCommand, setSlashCommand] = useState<{ blockId: string } | null>(null)
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const [isLinkActivationModifierPressed, setIsLinkActivationModifierPressed] = useState(false)
  const [hoveredLinkTooltip, setHoveredLinkTooltip] = useState<{ href: string; x: number; y: number } | null>(null)
  const [hoveredFootnote, setHoveredFootnote] = useState<{ identifier: string; rect: DOMRect } | null>(null)
  const dragAnchorRef = useRef<string | null>(null)
  const { rootPath } = useWorkspace()
  const currentFilePath = useEditorFilePath()
  const headingDomIdByBlockId = useMemo(() => {
    const counters = new Map<string, number>()
    const domIds = new Map<string, string>()

    for (const block of blocks) {
      if (block.node.type !== 'heading') continue
      const text = (block.node as HeadingNode).children.map((node: InlineNode) => ('value' in node ? (node as { value?: string }).value ?? '' : '')).join('')
      const slug = slugifyHeadingText(text)
      const occurrence = (counters.get(slug) ?? 0) + 1
      counters.set(slug, occurrence)
      domIds.set(block.id, `heading-${slug}${occurrence > 1 ? `-${occurrence}` : ''}`)
    }

    return domIds
  }, [blocks])

  // ─── Historique undo/redo ────────────────────────────────────────────────────
  // Chaque entrée est la sérialisation markdown de l'état des blocs.
  // L'état initial est seedé au montage.
  const historyRef = useRef<{ stack: string[]; pos: number }>({
    stack: [markdown],
    pos: 0,
  })
  const isHistoryMovingRef = useRef(false)
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushHistorySnapshot = useCallback((snapshot: string) => {
    const history = historyRef.current
    if (history.stack[history.pos] === snapshot) return
    history.stack = history.stack.slice(0, history.pos + 1)
    history.stack.push(snapshot)
    history.pos = history.stack.length - 1
    if (history.stack.length > 100) {
      history.stack.shift()
      history.pos -= 1
    }
    console.log('[BlockEditor][history] push', {
      pos: history.pos,
      size: history.stack.length,
      preview: snapshot.slice(0, 120),
    })
  }, [])

  const scheduleHistorySnapshot = useCallback((snapshot: string) => {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    console.log('[BlockEditor][history] schedule', {
      preview: snapshot.slice(0, 120),
    })
    historyTimerRef.current = setTimeout(() => {
      pushHistorySnapshot(snapshot)
    }, 250)
  }, [pushHistorySnapshot])

  const applyBlocksMutation = useCallback((
    updater: (previous: BlockState[]) => BlockState[],
    historyMode: 'immediate' | 'debounced' = 'immediate',
  ) => {
    setBlocks((previous) => {
      const next = updater(previous)
      if (next === previous) return previous
      if (areBlockStateArraysIdentical(previous, next)) return previous

      blocksDirtyRef.current = true

      if (!isHistoryMovingRef.current) {
        const snapshot = blocksToMarkdown(next, footnotesRef.current)
        if (historyMode === 'immediate') pushHistorySnapshot(snapshot)
        else scheduleHistorySnapshot(snapshot)
      }

      return next
    })
  }, [pushHistorySnapshot, scheduleHistorySnapshot])

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

  // Bloc en cours d'édition au moment d'une mise à jour externe : s'il est
  // remplacé (un collègue l'a modifié), le focus et le curseur sont restaurés
  // à la même position.
  const focusRestoreRef = useRef<{ index: number; previousId: string; offset: number; text: string } | null>(null)
  const replacedBlocksRef = useRef<Map<string, string>>(new Map())
  useLayoutEffect(() => {
    const restore = focusRestoreRef.current
    if (!restore) return
    focusRestoreRef.current = null
    // Bloc toujours là (même identité) : son éditeur a gardé le focus.
    if (blocks.some((candidate) => candidate.id === restore.previousId)) return
    const replacementId = replacedBlocksRef.current.get(restore.previousId)
    const block = (replacementId && blocks.find((candidate) => candidate.id === replacementId))
      || blocks[Math.min(restore.index, blocks.length - 1)]
    if (!block) return
    // Texte inséré ou supprimé avant le curseur : la position suit.
    const element = document.querySelector<HTMLElement>(`[data-block-id="${block.id}"] [contenteditable="true"]`)
    let offset = restore.offset
    const splice = element ? singleSpliceDiff(restore.text, element.textContent ?? '') : null
    if (splice && splice.index < offset) {
      offset = Math.max(splice.index, offset + splice.insert.length - splice.remove)
    }
    blockRefs.current.get(block.id)?.focus({ type: 'offset', offset })
  }, [blocks])

  // Changement externe du prop markdown → réinitialise sans émettre en retour.
  // useLayoutEffect : appliqué dans le même rendu que la réception (édition
  // temps réel). Une saisie enregistrée entre-temps partirait sinon d'une
  // version périmée du document et annulerait les modifications reçues.
  useLayoutEffect(() => {
    if (markdown !== lastEmittedRef.current) {
      lastEmittedRef.current = markdown
      blocksDirtyRef.current = false
      const active = document.activeElement as HTMLElement | null
      const activeBlockId = (active?.closest('[data-block-id]') as HTMLElement | null)?.dataset.blockId ?? null
      const activeIndex = activeBlockId ? blocksRef.current.findIndex((block) => block.id === activeBlockId) : -1
      if (active && activeBlockId && activeIndex !== -1) {
        focusRestoreRef.current = { index: activeIndex, previousId: activeBlockId, offset: getCaretTextOffset(active), text: active.textContent ?? '' }
      }
      setBlocks((previous) => {
        const reconciled = reconcileBlocks(previous, markdownToBlocks(markdown))
        replacedBlocksRef.current = reconciled.replaced
        return reconciled.blocks
      })
      initFootnotes(extractFootnoteMapFromMarkdown(markdown))
      // Réinitialise l'historique quand le document change de l'extérieur
      historyRef.current = { stack: [markdown], pos: 0 }
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    }
  }, [markdown, initFootnotes])

  useEffect(() => {
    const handleModifierChange = (event: KeyboardEvent | MouseEvent) => {
      setIsLinkActivationModifierPressed(Boolean(event.ctrlKey || event.metaKey))
    }

    const resetModifierState = () => setIsLinkActivationModifierPressed(false)

    window.addEventListener('keydown', handleModifierChange, true)
    window.addEventListener('keyup', handleModifierChange, true)
    window.addEventListener('mousemove', handleModifierChange, true)
    window.addEventListener('blur', resetModifierState)

    return () => {
      window.removeEventListener('keydown', handleModifierChange, true)
      window.removeEventListener('keyup', handleModifierChange, true)
      window.removeEventListener('mousemove', handleModifierChange, true)
      window.removeEventListener('blur', resetModifierState)
    }
  }, [])

  // Émet les changements internes au parent après le rendu (jamais pendant)
  useEffect(() => {
    if (!blocksDirtyRef.current) return
    blocksDirtyRef.current = false
    const md = blocksToMarkdown(blocks, footnotes)
    lastEmittedRef.current = md
    onChangeRef.current(md)

    if (isHistoryMovingRef.current) {
      isHistoryMovingRef.current = false
    }
  }, [blocks])

  // Ré-émet le markdown quand le contenu d'une note change (édition via tooltip)
  const footnotesEmitMountRef = useRef(false)
  useEffect(() => {
    if (!footnotesEmitMountRef.current) {
      footnotesEmitMountRef.current = true
      return
    }
    const md = blocksToMarkdown(blocksRef.current, footnotes)
    if (md === lastEmittedRef.current) return
    lastEmittedRef.current = md
    onChangeRef.current(md)
  }, [footnotes])

  const handleBlockChange = useCallback(
    (id: string, node: BlockNode) => {
      applyBlocksMutation((prev) => prev.map((block) => {
        if (block.id !== id) return block
        if (areBlockNodesEqual(block.node, node)) return block
        return { ...block, node }
      }), 'immediate')
    },
    [applyBlocksMutation],
  )

  const handleEnterAtStart = useCallback(
    (id: string) => {
      const newBlock = freshParagraph()
      pendingFocusRef.current = newBlock.id
      applyBlocksMutation((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx), newBlock, ...prev.slice(idx)]
      }, 'immediate')
    },
    [applyBlocksMutation],
  )

  const handleEnterAtEnd = useCallback(
    (id: string) => {
      const newBlock = freshParagraph()
      pendingFocusRef.current = newBlock.id
      applyBlocksMutation((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      }, 'immediate')
    },
    [applyBlocksMutation],
  )

  const handleSplit = useCallback(
    (id: string, after: InlineNode[]) => {
      const newBlock: BlockState = {
        id: crypto.randomUUID(),
        node: { type: 'paragraph', children: after } as ParagraphNode,
      }
      pendingFocusRef.current = newBlock.id
      applyBlocksMutation((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
      }, 'immediate')
    },
    [applyBlocksMutation],
  )

  const handleBackspaceAtStart = useCallback(
    (id: string) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return
      if (idx === 0) {
        if (prev.length === 1) return
        pendingFocusRef.current = prev[1].id
        applyBlocksMutation((state) => state.filter((b) => b.id !== id), 'immediate')
        return
      }
      if (!isEmptyBlock(prev[idx].node)) return
      pendingFocusRef.current = prev[idx - 1].id
      applyBlocksMutation((state) => state.filter((b) => b.id !== id), 'immediate')
    },
    [applyBlocksMutation],
  )

  const handleDeleteAtEnd = useCallback(
    (id: string) => {
      const prev = blocksRef.current
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1 || idx === prev.length - 1) return
      const nextBlock = prev[idx + 1]
      const currentBlock = prev[idx]

      // Bloc courant vide → le supprimer et placer le curseur au début du bloc suivant
      if (isEmptyBlock(currentBlock.node)) {
        applyBlocksMutation((state) => state.filter((b) => b.id !== id), 'immediate')
        setTimeout(() => blockRefs.current.get(nextBlock.id)?.focus(), 0)
        return
      }
      // Bloc suivant vide → le supprimer, focus reste sur le bloc courant
      if (isEmptyBlock(nextBlock.node)) {
        applyBlocksMutation((state) => state.filter((b) => b.id !== nextBlock.id), 'immediate')
        return
      }
      // Paragraphe + paragraphe suivant → fusionner les contenus
      if (currentBlock.node.type === 'paragraph' && nextBlock.node.type === 'paragraph') {
        const mergedChildren = [
          ...(currentBlock.node as ParagraphNode).children,
          ...(nextBlock.node as ParagraphNode).children,
        ]
        applyBlocksMutation(
          (s) =>
            s
              .map((b) => b.id === id ? { ...b, node: { type: 'paragraph', children: mergedChildren } as ParagraphNode } : b)
              .filter((b) => b.id !== nextBlock.id),
          'immediate',
        )
        return
      }
      // Sinon : laisser le navigateur gérer la suppression dans le bloc courant
    },
    [applyBlocksMutation],
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
      applyBlocksMutation((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) return prev
        return [...prev.slice(0, idx), ...pastedBlocks, ...prev.slice(idx + 1)]
      }, 'immediate')
    },
    [applyBlocksMutation],
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
          applyBlocksMutation((s) => [...s, newBlock], 'immediate')
        }
        return
      }
      const targetId = prev[idx + 1].id
      setTimeout(() => blockRefs.current.get(targetId)?.focus({ type: 'arrow', x: cursorX, edge: 'top' }), 0)
    },
    [],
  )

  const handleLiftListItemAtStart = useCallback(
    (id: string, itemId: string, items: import('./blocks/ListBlock').ListBlockItem[], baseNode: ListNode) => {
      applyBlocksMutation((prev) => {
        const blockIndex = prev.findIndex((block) => block.id === id)
        if (blockIndex === -1) return prev

        const itemIndex = items.findIndex((item) => item.id === itemId)
        if (itemIndex === -1) return prev

        const currentItem = items[itemIndex]
        if (currentItem.depth > 0) return prev

        let descendantsEnd = itemIndex + 1
        while (descendantsEnd < items.length && items[descendantsEnd].depth > currentItem.depth) {
          descendantsEnd += 1
        }

        const beforeItems = items.slice(0, itemIndex)
        const descendantItems = items
          .slice(itemIndex + 1, descendantsEnd)
          .map((item) => ({ ...item, depth: Math.max(0, item.depth - 1) }))
        const afterItems = [...descendantItems, ...items.slice(descendantsEnd)]

        const replacement: BlockState[] = []
        if (beforeItems.length > 0) {
          replacement.push({
            id: crypto.randomUUID(),
            node: listBlockItemsToNode(beforeItems, baseNode),
          })
        }

        replacement.push({
          id,
          node: { type: 'paragraph', children: currentItem.inlines } as ParagraphNode,
        })

        if (afterItems.length > 0) {
          replacement.push({
            id: crypto.randomUUID(),
            node: listBlockItemsToNode(afterItems, baseNode),
          })
        }

        pendingFocusRef.current = id
        return [...prev.slice(0, blockIndex), ...replacement, ...prev.slice(blockIndex + 1)]
      }, 'immediate')

      setTimeout(() => blockRefs.current.get(id)?.focus(), 0)
    },
    [applyBlocksMutation],
  )

  const restoreFocusAfterHistoryMove = useCallback((nextBlocks: BlockState[]) => {
    if (nextBlocks.length === 0) return
    const focusedId = lastFocusedBlockIdRef.current
    const currentBlocks = blocksRef.current
    const focusedIndex = focusedId ? currentBlocks.findIndex((block) => block.id === focusedId) : -1
    const fallbackIndex = focusedIndex >= 0 ? focusedIndex : 0
    const targetIndex = Math.min(fallbackIndex, nextBlocks.length - 1)
    pendingFocusRef.current = nextBlocks[targetIndex].id
    setSelectedBlockIds(new Set())
  }, [])

  // Conversion de type (raccourci markdown ou slash command)
  const handleConvert = useCallback(
    (id: string, targetType: string, children?: InlineNode[]) => {
      applyBlocksMutation((prev) => {
        const idx = prev.findIndex((b) => b.id === id)
        if (idx === -1) {
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
        } else if (targetType === 'code') {
          newNode = { type: 'code', lang: 'plaintext', value: inlinesToMarkdown(kids) } as CodeNode
        } else if (targetType === 'mermaid') {
          newNode = { type: 'code', lang: 'mermaid', value: 'flowchart TD\n  A[Depart] --> B[Arrivee]' } as CodeNode
        } else if (targetType === 'details') {
          newNode = { type: 'html', value: buildDetailsHtml('Click me', 'Content') } as unknown as BlockNode
        } else if (targetType === 'youtube') {
          newNode = { type: 'html', value: buildYouTubeHtml('https://www.youtube.com/watch?v=dQw4w9WgXcQ') } as unknown as BlockNode
        } else if (targetType === 'html') {
          newNode = { type: 'html', value: '<div class="callout">\n  <strong>Hello HTML</strong>\n</div>' } as unknown as BlockNode
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
        } else if (targetType.startsWith('blockquote-alert:')) {
          const alertType = targetType.slice('blockquote-alert:'.length) as BlockquoteAlertType
          newNode = {
            type: 'blockquote',
            children: [{ type: 'paragraph', children: buildBlockquoteAlertNodes(alertType, kids) }],
          } as unknown as BlockNode
        } else if (targetType === 'separator') {
          newNode = { type: 'thematicBreak' } as unknown as BlockNode
        } else {
          return prev
        }

        let updated = prev.map((b) => b.id === id ? { ...b, node: newNode } : b)
        // Si tableau/liste/math/blockquote/separator/heading est inséré en dernière position, ajouter un paragraphe vide
        if ((targetType === 'table' || targetType === 'code' || targetType === 'mermaid' || targetType === 'details' || targetType === 'youtube' || targetType === 'html' || targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'list-alpha' || targetType === 'checklist' || targetType === 'math' || targetType.startsWith('math-value:') || targetType === 'blockquote' || targetType.startsWith('blockquote-alert:') || targetType === 'separator' || targetType.startsWith('heading-')) && idx === prev.length - 1) {
          updated = [...updated, freshParagraph()]
        }
        return updated
      }, 'immediate')
      setTimeout(() => blockRefs.current.get(id)?.focus(), 0)
    },
    [applyBlocksMutation],
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

  // Seed footnotes from initial markdown on first mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { initFootnotes(extractFootnoteMapFromMarkdown(markdown)) }, [])

  const handleCreateFootnoteFromSelection = useCallback((_blockId: string, selectedText: string) => {
    const identifier = buildNextFootnoteIdentifier(blocksRef.current, selectedText)
    // Initialize footnote with empty content in context
    setFootnote(identifier, '')
    return identifier
  }, [setFootnote])

  const removeFootnote = useCallback((identifier: string) => {
    removeFootnoteCtx(identifier)
  }, [removeFootnoteCtx])
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
      applyBlocksMutation((prev) => {
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
      }, 'immediate')
    },
    flushPendingChanges() {
      flushPendingEdits()
    },
  }), [applyBlocksMutation])

  // Bouton + dans la marge : insère un paragraphe vide après le bloc et ouvre le slash command
  const handleInsertAndSlash = useCallback((id: string) => {
    const newBlock = freshParagraph()
    pendingFocusRef.current = newBlock.id
    pendingSlashRef.current = newBlock.id
    applyBlocksMutation((prev) => {
      const idx = prev.findIndex((b) => b.id === id)
      if (idx === -1) return [...prev, newBlock]
      return [...prev.slice(0, idx + 1), newBlock, ...prev.slice(idx + 1)]
    }, 'immediate')
  }, [applyBlocksMutation])

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
    // Entrée en mode bloc-select seulement si la souris sort du bloc d'origine
    if (!dragModeActiveRef.current) {
      const elUnder = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const currentBlockId = getBlockIdFromEl(elUnder)
      // Tant que la souris reste sur le même bloc → laisser le navigateur gérer la sélection texte
      if (currentBlockId === dragAnchorRef.current || !currentBlockId) return
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
    const target = e.target as HTMLElement | null
    const isFormFieldTarget = Boolean(target && (
      target.tagName === 'TEXTAREA'
      || target.tagName === 'INPUT'
      || target.closest('.cm-editor')
    ))

    // CTRL+Z → undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (isFormFieldTarget && selectedBlockIds.size === 0) return
      e.preventDefault()
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
      const historyOverride = getHistoryOverride()
      if (historyOverride) {
        historyOverride.undo()
        return
      }
      const focusedId = lastFocusedBlockIdRef.current
      if (focusedId) {
        blockRefs.current.get(focusedId)?.flush?.()
      }
      const h = historyRef.current
      if (h.pos > 0) {
        h.pos--
        console.log('[BlockEditor][history] undo', {
          pos: h.pos,
          size: h.stack.length,
          preview: h.stack[h.pos]?.slice(0, 120),
        })
        const nextBlocks = markdownToBlocks(h.stack[h.pos])
        initFootnotes(extractFootnoteMapFromMarkdown(h.stack[h.pos]))
        restoreFocusAfterHistoryMove(nextBlocks)
        isHistoryMovingRef.current = true
        blocksDirtyRef.current = true
        setBlocks(nextBlocks)
      }
      return
    }
    // CTRL+Y / CTRL+SHIFT+Z → redo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
      if (isFormFieldTarget && selectedBlockIds.size === 0) return
      e.preventDefault()
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
      const historyOverride = getHistoryOverride()
      if (historyOverride) {
        historyOverride.redo()
        return
      }
      const h = historyRef.current
      if (h.pos < h.stack.length - 1) {
        h.pos++
        console.log('[BlockEditor][history] redo', {
          pos: h.pos,
          size: h.stack.length,
          preview: h.stack[h.pos]?.slice(0, 120),
        })
        const nextBlocks = markdownToBlocks(h.stack[h.pos])
        initFootnotes(extractFootnoteMapFromMarkdown(h.stack[h.pos]))
        restoreFocusAfterHistoryMove(nextBlocks)
        isHistoryMovingRef.current = true
        blocksDirtyRef.current = true
        setBlocks(nextBlocks)
      }
      return
    }
    if (e.key === 'Enter' && selectedBlockIds.size === 1) {
      const [selectedBlockId] = [...selectedBlockIds]
      e.preventDefault()
      handleEnterAtEnd(selectedBlockId)
      setSelectedBlockIds(new Set())
      return
    }
    // Supprimer les blocs sélectionnés
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlockIds.size > 0) {
      e.preventDefault()
      applyBlocksMutation((prev) => {
        const filtered = prev.filter((b) => !selectedBlockIds.has(b.id))
        return filtered.length > 0 ? filtered : [freshParagraph()]
      }, 'immediate')
      setSelectedBlockIds(new Set())
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      if (isFormFieldTarget && selectedBlockIds.size === 0) return
      e.preventDefault()
      setSelectedBlockIds(new Set(blocksRef.current.map((b) => b.id)))
    }
  }, [handleEnterAtEnd, pushHistorySnapshot, restoreFocusAfterHistoryMove, selectedBlockIds])

  const handleSelectedBlocksCopy = useCallback((clipboardData?: DataTransfer | null) => {
    if (selectedBlockIds.size === 0) return false
    const selected = blocksRef.current.filter((b) => selectedBlockIds.has(b.id))
    const payload = blocksToClipboardPayload(selected)
    setClipboardEventData(clipboardData, payload)
    // Une seule image sélectionnée : on copie aussi l'image elle-même dans le
    // presse-papiers système, pour la coller dans Teams, Word, un mail…
    // (un collage dans Holo réutilise alors l'image existante, sans doublon).
    const onlyImage = selected.length === 1
      ? (selected[0].node.type === 'image' ? selected[0].node as ImageNode : paragraphSingleImage(selected[0].node))
      : null
    if (onlyImage?.url && window.holo?.writeClipboardImage) {
      const url = onlyImage.url
      setTimeout(() => { void window.holo?.writeClipboardImage(url, currentFilePath).catch(() => undefined) }, 0)
    }
    return true
  }, [selectedBlockIds, currentFilePath])

  const handleSelectedBlocksCut = useCallback((clipboardData?: DataTransfer | null) => {
    if (!handleSelectedBlocksCopy(clipboardData)) return false
    applyBlocksMutation((prev) => {
      const filtered = prev.filter((b) => !selectedBlockIds.has(b.id))
      return filtered.length > 0 ? filtered : [freshParagraph()]
    }, 'immediate')
    setSelectedBlockIds(new Set())
    return true
  }, [applyBlocksMutation, handleSelectedBlocksCopy, selectedBlockIds])

  const buildLinkTooltip = useCallback((href: string) => {
    const trimmedHref = href.trim()
    if (!trimmedHref) return ''
    const actionHint = /^(https?:|mailto:|holo:)/i.test(trimmedHref)
      ? 'Ctrl/Cmd+clic pour ouvrir dans le navigateur'
      : 'Ctrl/Cmd+clic pour ouvrir le fichier'
    return `${trimmedHref}\n${actionHint}`
  }, [])

  const resolveLinkedFilePath = useCallback((href: string) => {
    const trimmedHref = href.trim()
    if (!trimmedHref || trimmedHref.startsWith('#')) return null

    const cleanHref = trimmedHref.split('#')[0]?.split('?')[0]?.trim() ?? ''
    if (!cleanHref) return null

    if (cleanHref.startsWith('/')) {
      if (!rootPath) return null
      return resolveRepoRelativePath(rootPath, cleanHref.replace(/^\/+/, ''))
    }

    if (!currentFilePath) return null

    const normalizedBaseDir = getParentPath(currentFilePath).replace(/\\/g, '/')
    const baseParts = normalizedBaseDir.split('/').filter(Boolean)
    const hrefParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean)
    const resolvedParts = [...baseParts]

    for (const part of hrefParts) {
      if (part === '.') continue
      if (part === '..') {
        if (resolvedParts.length > 0) resolvedParts.pop()
        continue
      }
      resolvedParts.push(part)
    }

    return `${currentFilePath.replace(/\\/g, '/').startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`
  }, [currentFilePath, rootPath])

  const footnoteHideTimerRef = useRef<number | null>(null)

  const cancelFootnoteHide = useCallback(() => {
    if (footnoteHideTimerRef.current !== null) {
      window.clearTimeout(footnoteHideTimerRef.current)
      footnoteHideTimerRef.current = null
    }
  }, [])

  const scheduleFootnoteHide = useCallback(() => {
    cancelFootnoteHide()
    footnoteHideTimerRef.current = window.setTimeout(() => {
      footnoteHideTimerRef.current = null
      setHoveredFootnote(null)
    }, 180)
  }, [cancelFootnoteHide])

  useEffect(() => cancelFootnoteHide, [cancelFootnoteHide])

  const handleContainerMouseOver = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const footnoteAnchor = (e.target as HTMLElement | null)?.closest('.holo-footnote-anchor, sup[data-footnote-ref]') as HTMLElement | null
    if (footnoteAnchor) {
      const identifier = footnoteAnchor.getAttribute('data-footnote-anchor') ?? footnoteAnchor.getAttribute('data-footnote-ref') ?? ''
      if (identifier) {
        cancelFootnoteHide()
        setHoveredFootnote({ identifier, rect: footnoteAnchor.getBoundingClientRect() })
        setHoveredLinkTooltip(null)
        return
      }
    }
    // Le tooltip est rendu via un portail React : ses événements remontent jusqu'ici.
    // Si on survole le tooltip lui-même, garder ouvert au lieu de programmer le masquage.
    if ((e.target as HTMLElement | null)?.closest('[data-testid="footnote-editor-tooltip"]')) {
      cancelFootnoteHide()
      return
    }
    scheduleFootnoteHide()

    const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) {
      setHoveredLinkTooltip(null)
      return
    }
    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!href) return
    anchor.removeAttribute('title')
    setHoveredLinkTooltip({ href, x: e.clientX, y: e.clientY })
  }, [buildLinkTooltip, cancelFootnoteHide, scheduleFootnoteHide])

  const handleContainerMouseLeave = useCallback(() => {
    setHoveredLinkTooltip(null)
    scheduleFootnoteHide()
  }, [scheduleFootnoteHide])

  const handleContainerMouseMoveWithTooltip = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    handleContainerMouseMove(e)

    const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) {
      if (hoveredLinkTooltip) setHoveredLinkTooltip(null)
      return
    }

    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!href) return

    anchor.removeAttribute('title')
    setHoveredLinkTooltip({ href, x: e.clientX, y: e.clientY })
  }, [handleContainerMouseMove, hoveredLinkTooltip])

  const handleContainerClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null
    if (!anchor) return

    const href = anchor.getAttribute('href')?.trim() ?? ''
    if (!href) return

  anchor.removeAttribute('title')

    if (!(e.ctrlKey || e.metaKey)) return

    e.preventDefault()
    e.stopPropagation()

    if (/^(https?:|mailto:|holo:)/i.test(href)) {
      await window.holo?.openExternalUrl(href)
      return
    }

    const targetPath = resolveLinkedFilePath(href)
    if (targetPath?.toLowerCase().endsWith('.md')) {
      await onOpenLinkedFile?.(targetPath)
    }
  }, [buildLinkTooltip, onOpenLinkedFile, resolveLinkedFilePath])

  return (
    <div
      ref={containerRef}
      data-testid="block-editor"
      tabIndex={-1}
      className={cn('holo-markdown outline-none', className)}
      data-link-activation-modifier={isLinkActivationModifierPressed ? 'true' : 'false'}
      style={fontScale !== undefined ? { '--editor-fs-scale': fontScale } as React.CSSProperties : undefined}
      onKeyDown={handleContainerKeyDown}
      onMouseDown={handleContainerMouseDown}
      onMouseMove={handleContainerMouseMoveWithTooltip}
      onMouseUp={handleContainerMouseUp}
      onMouseOver={handleContainerMouseOver}
      onMouseLeave={handleContainerMouseLeave}
      onClick={(e) => { void handleContainerClick(e) }}
      onDragStart={(e) => { if (!(e.target as HTMLElement).closest('[data-drag-handle]')) e.preventDefault() }}
      onCopyCapture={(e) => {
        if (!handleSelectedBlocksCopy(e.clipboardData)) return
        e.preventDefault()
        e.stopPropagation()
      }}
      onCutCapture={(e) => {
        if (!handleSelectedBlocksCut(e.clipboardData)) return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          data-block-id={block.id}
          id={block.node.type === 'heading' ? headingDomIdByBlockId.get(block.id) : undefined}
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
          onDragLeave={(e) => {
            // Ignorer si le curseur quitte vers un enfant du même bloc (évite le scintillement)
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              if (dragOverBlockId === block.id) setDragOverBlockId(null)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (!dragReorderBlockId || dragReorderBlockId === block.id) return
            applyBlocksMutation((prev) => {
              const next = prev.filter(b => b.id !== dragReorderBlockId)
              const srcBlock = prev.find(b => b.id === dragReorderBlockId)!
              const targetIdx = next.findIndex(b => b.id === block.id)
              const insertAt = dragOverPos === 'before' ? targetIdx : targetIdx + 1
              next.splice(insertAt, 0, srcBlock)
              return next
            }, 'immediate')
            setDragReorderBlockId(null)
            setDragOverBlockId(null)
          }}
          onDragEnd={() => { setDragReorderBlockId(null); setDragOverBlockId(null) }}
          className={cn(
            'group/block relative rounded-sm transition-colors',
            selectedBlockIds.has(block.id) && 'bg-holo-primary/10 ring-1 ring-inset ring-holo-primary/30',
            dragReorderBlockId === block.id && 'opacity-40',
          )}
          onFocusCapture={() => {
            lastFocusedBlockIdRef.current = block.id
            setSelectedBlockIds(new Set())
          }}
        >
          {/* Indicateur de dépôt drag-sort */}
          {dragOverBlockId === block.id && dragOverPos === 'before' && (
            <div className="pointer-events-none absolute inset-x-0 -top-0.5 z-10 flex items-center">
              <div className="h-0.5 w-full rounded-full bg-holo-primary shadow-[0_0_8px_2px_rgba(123,97,255,0.5)]" />
            </div>
          )}
          {dragOverBlockId === block.id && dragOverPos === 'after' && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-0.5 z-10 flex items-center">
              <div className="h-0.5 w-full rounded-full bg-holo-primary shadow-[0_0_8px_2px_rgba(123,97,255,0.5)]" />
            </div>
          )}
          {/* Drag handle + bouton + dans la marge */}
          <div className="absolute -left-7 top-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100 group-focus-within/block:opacity-100">
            <div
              data-drag-handle
              draggable
              className="flex size-5 cursor-grab items-center justify-center rounded text-holo-text-faint transition hover:text-holo-text active:cursor-grabbing"
              title="Glisser pour réordonner"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSelectedBlockIds(new Set([block.id]))
                containerRef.current?.focus({ preventScroll: true })
              }}
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
            onLiftListItemAtStart={(itemId, items, node) => handleLiftListItemAtStart(block.id, itemId, items, node)}
            onSlashCommand={() => handleSlashCommand(block.id)}
            onSplit={(after) => handleSplit(block.id, after)}
            onSmartPaste={(before, after, md) => handleSmartPaste(block.id, before, after, md)}
            onCreateFootnote={(selectedText) => handleCreateFootnoteFromSelection(block.id, selectedText)}
            onRemoveFootnote={removeFootnote}
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
      {hoveredLinkTooltip && (
        <div
          className="pointer-events-none fixed z-[120] max-w-[420px] rounded-holo-md border border-holo-border-soft bg-holo-bg-elevated px-3 py-2 text-xs shadow-holo-md"
          style={{ left: Math.max(12, Math.min(hoveredLinkTooltip.x + 14, window.innerWidth - 432)), top: hoveredLinkTooltip.y + 18 }}
        >
          <div className="break-all text-holo-text">{hoveredLinkTooltip.href}</div>
          <div className="mt-1 text-holo-text-faint">{buildLinkTooltip(hoveredLinkTooltip.href).split('\n')[1] ?? ''}</div>
        </div>
      )}
      {hoveredFootnote && (() => {
        const content = footnotes.get(hoveredFootnote.identifier) ?? ''
        const { rect } = hoveredFootnote
        const top = rect.bottom + 8 + window.scrollY
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - 320))

        return createPortal(
          <div
            data-testid="footnote-editor-tooltip"
            className="pointer-events-auto fixed z-[120] max-w-[300px] rounded-holo-xl border border-holo-primary/25 bg-holo-bg-elevated shadow-[0_8px_32px_rgba(0,0,0,.32)]"
            style={{ top, left }}
            onMouseEnter={cancelFootnoteHide}
            onMouseLeave={scheduleFootnoteHide}
          >
            <div className="mb-1 flex items-center gap-2 border-b border-holo-border-soft px-3.5 pt-2.5 pb-2">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full border border-holo-primary/30 bg-holo-primary/10 px-1.5 text-[10px] font-semibold leading-none text-holo-primary-soft">{hoveredFootnote.identifier}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-holo-text-faint">Note</span>
            </div>
            <textarea
              autoFocus
              value={content}
              onChange={(e) => setFootnote(hoveredFootnote.identifier, e.target.value)}
              placeholder="Ajouter une note…"
              className="w-full resize-none bg-transparent p-2.5 text-xs text-holo-text outline-none"
              rows={3}
            />
          </div>,
          document.body
        )
      })()}
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
  onLiftListItemAtStart,
  onSlashCommand,
  onSplit,
  onSmartPaste,
  onCreateFootnote,
    onRemoveFootnote,
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
  onLiftListItemAtStart: (itemId: string, items: import('./blocks/ListBlock').ListBlockItem[], node: ListNode) => void
  onSlashCommand: () => void
  onSplit: (after: InlineNode[]) => void
  onSmartPaste: (before: InlineNode[], after: InlineNode[], pastedMd: string) => void
  onCreateFootnote: (selectedText: string) => string | null
    onRemoveFootnote?: (identifier: string) => void
  onTabExit: () => void
}) {
  switch (block.node.type) {
    case 'paragraph': {
      // Un paragraphe ne contenant qu'une image → rendu comme ImageBlock (évite perte lors du blur)
      const para = block.node as ParagraphNode
      if (para.children.length === 1 && para.children[0].type === 'image') {
        return <ImageBlock node={para.children[0] as ImageNode} isSelected={isSelected} onSelect={onSelect} onChange={(image) => onChange({ ...para, children: [image] })} />
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
          onCreateFootnote={onCreateFootnote}
          onRemoveFootnote={onRemoveFootnote}
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
          onCreateFootnote={onCreateFootnote}
          alwaysShowPlaceholder={isFirst}
        />
      )

    case 'table':
      return (
        <TableBlock
          ref={blockRef}
          node={block.node as TableNode}
          onChange={(node) => onChange(node)}
          onSelect={onSelect}
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
          onLiftItemAtStart={onLiftListItemAtStart}
                    onRemoveFootnote={onRemoveFootnote}
          onCreateFootnote={onCreateFootnote}
        />
      )

    case 'code':
      if ((block.node as CodeNode).lang === 'mermaid') {
        return (
          <MermaidBlock
            ref={blockRef}
            node={block.node as CodeNode}
            onChange={(node) => onChange(node)}
            onEnterAtEnd={onEnterAtEnd}
            onBackspaceAtStart={onBackspaceAtStart}
          />
        )
      }

      return (
        <CodeBlock
          ref={blockRef}
          node={block.node as CodeNode}
          onChange={(node) => onChange(node)}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
        />
      )

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
          onCreateFootnote={onCreateFootnote}
        />
      )

    case 'image':
      return <ImageBlock node={block.node as ImageNode} isSelected={isSelected} onSelect={onSelect} onChange={(image) => onChange(image)} />

    case 'thematicBreak':
      return (
        <div
          onClick={onSelect}
          className={cn('cursor-pointer rounded transition', isSelected && 'ring-2 ring-holo-primary/40')}
          style={{ paddingTop: 'calc(3rem * var(--editor-fs-scale, 1))', paddingBottom: 'calc(3rem * var(--editor-fs-scale, 1))' }}
        >
          <hr className="my-0 border-holo-border-soft" />
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



    case 'html':
      if (isDetailsHtmlNode(block.node)) {
        return (
          <DetailsBlock
            ref={blockRef}
            node={block.node}
            onChange={(node) => onChange(node as unknown as BlockNode)}
            onEnterAtEnd={onEnterAtEnd}
            onBackspaceAtStart={onBackspaceAtStart}
          />
        )
      }

      if (isYouTubeHtmlNode(block.node)) {
        return (
          <YouTubeBlock
            ref={blockRef}
            node={block.node}
            onChange={(node) => onChange(node as unknown as BlockNode)}
            onEnterAtEnd={onEnterAtEnd}
            onBackspaceAtStart={onBackspaceAtStart}
          />
        )
      }

      return (
        <HtmlBlock
          ref={blockRef}
          node={block.node}
          onChange={(node) => onChange(node as unknown as BlockNode)}
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
