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
import { Trash2, X } from 'lucide-react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import remarkGfm from 'remark-gfm'
import { ParagraphBlock } from './blocks/ParagraphBlock'
import { HeadingBlock } from './blocks/HeadingBlock'
import { TableBlock } from './blocks/TableBlock'
import { ListBlock } from './blocks/ListBlock'
import { SlashCommandPopup } from './SlashCommandPopup'
import { domToInlines } from './lib/domToInlines'
import { cn } from '../../utils/global'
import type { BlockNode, BlockState, InlineNode, ParagraphNode, HeadingNode, TableNode, ListNode } from './lib/types'
import type { InlineEditorHandle } from './InlineEditor'

// ─── Singletons remark ──────────────────────────────────────────────────────

const parser = unified().use(remarkParse).use(remarkGfm)

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
    } else {
      result.push({ id: newId(), node: convertHtmlUnderline(node) })
    }
  }
  return result.length > 0 ? result : [freshParagraph()]
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
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const selectedBlockIdsRef = useRef<Set<string>>(new Set())
  selectedBlockIdsRef.current = selectedBlockIds
  const lastSelectedRef = useRef<string | null>(null)

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
      if (idx === -1 || idx === prev.length - 1) return
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
        } else {
          return prev
        }

        let updated = prev.map((b) => b.id === id ? { ...b, node: newNode } : b)
        // Si le tableau/liste est inséré en dernière position, ajouter un paragraphe vide
        if ((targetType === 'table' || targetType === 'list-bullet' || targetType === 'list-ordered' || targetType === 'list-alpha' || targetType === 'checklist') && idx === prev.length - 1) {
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

  // ─── Sélection multi-blocs ────────────────────────────────────────────────

  const handleBlockSelect = useCallback((id: string, shift: boolean) => {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev)
      if (shift && lastSelectedRef.current) {
        const allBlocks = blocksRef.current
        const fromIdx = allBlocks.findIndex((b) => b.id === lastSelectedRef.current)
        const toIdx = allBlocks.findIndex((b) => b.id === id)
        if (fromIdx !== -1 && toIdx !== -1) {
          const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
          for (let i = start; i <= end; i++) next.add(allBlocks[i].id)
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      lastSelectedRef.current = id
      return next
    })
  }, [])

  const handleDeleteSelected = useCallback(() => {
    const toDelete = selectedBlockIdsRef.current
    if (toDelete.size === 0) return
    blocksDirtyRef.current = true
    setBlocks((current) => {
      const remaining = current.filter((b) => !toDelete.has(b.id))
      return remaining.length > 0 ? remaining : [freshParagraph()]
    })
    setSelectedBlockIds(new Set())
  }, [])

  // Escape → désélectionner tous les blocs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedBlockIdsRef.current.size > 0) {
        setSelectedBlockIds(new Set())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

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
    <div ref={containerRef} data-testid="block-editor" className={cn('holo-markdown', className)} style={fontScale !== undefined ? { '--editor-fs-scale': fontScale } as React.CSSProperties : undefined} onKeyDown={handleContainerKeyDown}>
      {selectedBlockIds.size > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-holo-lg border border-holo-primary/30 bg-holo-primary-surface/20 px-3 py-2 text-xs">
          <span className="text-holo-text-muted">
            {selectedBlockIds.size} bloc{selectedBlockIds.size > 1 ? 's' : ''} sélectionné{selectedBlockIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              onMouseDown={(e) => { e.preventDefault(); setSelectedBlockIds(new Set()) }}
              className="flex items-center gap-1 text-holo-text-faint transition-colors hover:text-holo-text"
            >
              <X size={11} />
              <span>Annuler</span>
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleDeleteSelected() }}
              className="flex items-center gap-1 text-red-400 transition-colors hover:text-red-300"
            >
              <Trash2 size={11} />
              <span>Supprimer</span>
            </button>
          </div>
        </div>
      )}
      {blocks.map((block, idx) => (
        <div
          key={block.id}
          data-block-id={block.id}
          className={cn(
            'group/block relative',
            selectedBlockIds.has(block.id) && 'rounded-sm bg-holo-primary-surface/15 outline outline-1 outline-holo-primary/20',
          )}
        >
          {/* Sélecteur de bloc */}
          <div
            className={cn(
              'absolute -left-5 top-1 flex cursor-pointer items-center justify-center transition-opacity',
              selectedBlockIds.has(block.id) ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-40 hover:!opacity-100',
            )}
            onMouseDown={(e) => { e.preventDefault(); handleBlockSelect(block.id, e.shiftKey) }}
            title="Sélectionner le bloc"
          >
            <div
              className={cn(
                'size-3.5 rounded-sm border transition-colors',
                selectedBlockIds.has(block.id)
                  ? 'border-holo-primary-soft bg-holo-primary-soft'
                  : 'border-holo-border-muted bg-transparent',
              )}
            />
          </div>
          <BlockDispatcher
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
            onSmartPaste={(before, after, md) => handleSmartPaste(block.id, before, after, md)}
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
  onSmartPaste,
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
  onSmartPaste: (before: InlineNode[], after: InlineNode[], pastedMd: string) => void
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
          onSmartPaste={onSmartPaste}
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
