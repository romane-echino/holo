/**
 * FootnoteBlock.tsx — Bloc de note de bas de page éditable
 * Structure markdown : [^id]: contenu
 *
 * Design Holo :
 * - rendu plus calme, proche d'un callout documentaire
 * - accent coloré subtil plutôt qu'une grosse carte colorée
 * - menu de type compact
 * - édition inline intégrée, sans fond lourd
 */

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Check, CircleCheck, CircleX, Info, TriangleAlert } from 'lucide-react'
import { cn } from '../../../utils/global'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { InlineNode } from '../lib/types'

type NoteToneKey = 'info' | 'success' | 'warning' | 'error'

const NOTE_TONES = {
  info: {
    key: 'info',
    label: 'Info',
    emoji: 'ℹ️',
    Icon: Info,
    accentClassName: 'outline-sky-400/70',
    iconClassName: 'text-sky-300',
    iconSurfaceClassName: 'border-sky-300/18 bg-sky-400/[0.075] text-sky-300',
    badgeClassName: 'border-sky-300/14 bg-sky-400/[0.055] text-sky-200',
    menuItemClassName: 'data-[active=true]:bg-sky-400/[0.08] data-[active=true]:text-sky-200',
  },
  success: {
    key: 'success',
    label: 'Succès',
    emoji: '✅',
    Icon: CircleCheck,
    accentClassName: 'outline-emerald-400/70',
    iconClassName: 'text-emerald-300',
    iconSurfaceClassName: 'border-emerald-300/18 bg-emerald-400/[0.075] text-emerald-300',
    badgeClassName: 'border-emerald-300/14 bg-emerald-400/[0.055] text-emerald-200',
    menuItemClassName: 'data-[active=true]:bg-emerald-400/[0.08] data-[active=true]:text-emerald-200',
  },
  warning: {
    key: 'warning',
    label: 'Attention',
    emoji: '⚠️',
    Icon: TriangleAlert,
    accentClassName: 'outline-amber-400/70',
    iconClassName: 'text-amber-300',
    iconSurfaceClassName: 'border-amber-300/18 bg-amber-400/[0.075] text-amber-300',
    badgeClassName: 'border-amber-300/14 bg-amber-400/[0.055] text-amber-200',
    menuItemClassName: 'data-[active=true]:bg-amber-400/[0.08] data-[active=true]:text-amber-200',
  },
  error: {
    key: 'error',
    label: 'Erreur',
    emoji: '❌',
    Icon: CircleX,
    accentClassName: 'outline-rose-400/70',
    iconClassName: 'text-rose-300',
    iconSurfaceClassName: 'border-rose-300/18 bg-rose-400/[0.075] text-rose-300',
    badgeClassName: 'border-rose-300/14 bg-rose-400/[0.055] text-rose-200',
    menuItemClassName: 'data-[active=true]:bg-rose-400/[0.08] data-[active=true]:text-rose-200',
  },
} satisfies Record<
  NoteToneKey,
  {
    key: NoteToneKey
    label: string
    emoji: string
    Icon: typeof Info
    accentClassName: string
    iconClassName: string
    iconSurfaceClassName: string
    badgeClassName: string
    menuItemClassName: string
  }
>

const NOTE_TONE_ORDER: NoteToneKey[] = ['info', 'success', 'warning', 'error']
const NOTE_MARKER_REGEX = /^\s*(?:ℹ️|ℹ|✅|✔️|☑️|⚠️|⚠|🚧|❌|⛔|🛑)\s*/

function getFootnoteDomId(identifier: string): string {
  return `footnote-${identifier.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '') || 'note'}`
}

function inlineNodesToPlainText(nodes: InlineNode[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case 'text':
        case 'inlineCode':
          return node.value
        case 'strong':
        case 'emphasis':
        case 'delete':
        case 'underline':
        case 'link':
          return inlineNodesToPlainText(node.children)
        case 'break':
          return '\n'
        case 'image':
          return node.alt ?? ''
        default:
          return ''
      }
    })
    .join('')
}

function getNoteTone(content: string) {
  const normalized = content.trim()
  if (/^(✅|✔️|☑️)/.test(normalized)) return NOTE_TONES.success
  if (/^(⚠️|⚠|🚧)/.test(normalized)) return NOTE_TONES.warning
  if (/^(❌|⛔|🛑)/.test(normalized)) return NOTE_TONES.error
  return NOTE_TONES.info
}

function stripNoteMarkerFromInlineNodes(nodes: InlineNode[]): InlineNode[] {
  let stripped = false

  return nodes.map((node) => {
    if (stripped) return node

    if (node.type === 'text') {
      stripped = true
      return { ...node, value: node.value.replace(NOTE_MARKER_REGEX, '').trimStart() }
    }

    if (
      node.type === 'strong' ||
      node.type === 'emphasis' ||
      node.type === 'delete' ||
      node.type === 'underline' ||
      node.type === 'link'
    ) {
      const children = stripNoteMarkerFromInlineNodes(node.children)
      stripped = JSON.stringify(children) !== JSON.stringify(node.children) || stripped
      return { ...node, children }
    }

    return node
  })
}

function replaceFirstInlineText(nodes: InlineNode[], replacer: (value: string) => string): [InlineNode[], boolean] {
  const updatedNodes = nodes.map((node) => {
    if (node.type === 'text') {
      return [{ ...node, value: replacer(node.value) }, true] as const
    }

    if (
      node.type === 'strong' ||
      node.type === 'emphasis' ||
      node.type === 'delete' ||
      node.type === 'underline' ||
      node.type === 'link'
    ) {
      const [children, replaced] = replaceFirstInlineText(node.children, replacer)
      return [{ ...node, children }, replaced] as const
    }

    return [node, false] as const
  })

  const replacement = updatedNodes.find((entry) => entry[1])
  if (replacement) return [updatedNodes.map((entry) => entry[0]), true]

  return [nodes, false]
}

function applyNoteToneToInlineNodes(nodes: InlineNode[], toneKey: NoteToneKey): InlineNode[] {
  const tone = NOTE_TONES[toneKey]
  const [updatedNodes, replaced] = replaceFirstInlineText(nodes, (value) => {
    const strippedValue = value.replace(NOTE_MARKER_REGEX, '').trimStart()
    return `${tone.emoji}${strippedValue ? ` ${strippedValue}` : ' '}`
  })

  if (replaced) return updatedNodes

  return [{ type: 'text', value: `${tone.emoji} ` }, ...nodes]
}

export interface FootnoteDefinitionNode {
  type: 'footnoteDefinition'
  identifier: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  children: any[]
}

export interface FootnoteBlockProps {
  node: FootnoteDefinitionNode
  onChange?: (node: FootnoteDefinitionNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (x: number) => void
  onArrowDown?: (x: number) => void
  onSplit?: (after: InlineNode[]) => void
  onSmartPaste?: (before: InlineNode[], after: InlineNode[], md: string) => void
}

export const FootnoteBlock = forwardRef<InlineEditorHandle, FootnoteBlockProps>(
  function FootnoteBlock(
    { node, onChange, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onSplit, onSmartPaste },
    ref,
  ) {
    const [isToneMenuOpen, setIsToneMenuOpen] = useState(false)
    const toneMenuRef = useRef<HTMLDivElement | null>(null)
    const editorRef = useRef<InlineEditorHandle | null>(null)

    const firstPara = node.children[0] as { type: string; children?: InlineNode[] } | undefined
    const inlines: InlineNode[] = firstPara?.type === 'paragraph' && Array.isArray(firstPara.children) ? firstPara.children : []
    const noteTone = getNoteTone(inlineNodesToPlainText(inlines))
    const editorInlines = stripNoteMarkerFromInlineNodes(inlines)
    const inlineContentVersion = JSON.stringify(editorInlines)
    const ToneIcon = noteTone.Icon

    useEffect(() => {
      if (!isToneMenuOpen) return

      const handlePointerDown = (event: MouseEvent) => {
        if (toneMenuRef.current && !toneMenuRef.current.contains(event.target as Node)) {
          setIsToneMenuOpen(false)
        }
      }

      document.addEventListener('mousedown', handlePointerDown)
      return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [isToneMenuOpen])

    useImperativeHandle(ref, () => ({
      focus: (cursor) => editorRef.current?.focus(cursor),
      clear: () => editorRef.current?.clear(),
      clearSlash: () => editorRef.current?.clearSlash() ?? [],
    }), [])

    const handleSave = (newChildren: InlineNode[], toneKey: NoteToneKey = noteTone.key) => {
      if (!onChange) return

      onChange({
        ...node,
        children: [{ type: 'paragraph', children: applyNoteToneToInlineNodes(newChildren, toneKey) }],
      })
    }

    const handleToneChange = (toneKey: NoteToneKey) => {
      handleSave(editorInlines, toneKey)
      setIsToneMenuOpen(false)
    }

    return (
      <div
        id={getFootnoteDomId(node.identifier)}
        title={`Note ${node.identifier}`}
        className="group/footnote relative my-4 overflow-visible rounded-holo-2xl border border-holo-border-soft bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition hover:border-holo-primary/18 hover:bg-white/[0.024]"
      >
        <div className={cn('pointer-events-none absolute inset-0 rounded-holo-2xl outline-2 opacity-40', noteTone.accentClassName)} />

        <div className="flex gap-3 px-3.5 py-3.5">
          <div ref={toneMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsToneMenuOpen((open) => !open)}
              className={cn(
                'flex size-8 items-center justify-center rounded-holo-lg  transition active:scale-[0.98]',
                noteTone.iconSurfaceClassName,
              )}
              aria-label={`Changer le type de note: ${noteTone.label}`}
              title="Changer le type de note"
            >
              <ToneIcon size={15} />
            </button>

            {isToneMenuOpen && (
              <div className="absolute left-0 top-10 z-40 w-48 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
                  Type de note
                </div>

                {NOTE_TONE_ORDER.map((toneKey) => {
                  const tone = NOTE_TONES[toneKey]
                  const Icon = tone.Icon
                  const isActive = tone.key === noteTone.key

                  return (
                    <button
                      key={tone.key}
                      type="button"
                      data-active={isActive}
                      onClick={() => handleToneChange(tone.key)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-holo-lg px-2.5 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text',
                        tone.menuItemClassName,
                      )}
                    >
                      <span className={cn('flex size-7 items-center justify-center rounded-holo-md border', tone.iconSurfaceClassName)}>
                        <Icon size={13} />
                      </span>

                      <span className="min-w-0 flex-1 truncate">{tone.label}</span>

                      {isActive && <Check size={13} className={tone.iconClassName} />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-2 flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[11px] text-holo-text-faint">
                Note <span className="font-mono text-holo-text-muted">[{node.identifier}]</span>
              </span>
            </div>

            <div
              className="rounded-holo-lg px-0.5 py-0.5 text-holo-text-soft transition group-hover/footnote:bg-white/[0.012]"
              onMouseDown={(event) => {
                const target = event.target as HTMLElement | null
                if (!target || target.closest('button, a, input, [data-format-toolbar]')) return
                if (target.closest('[contenteditable="true"]')) return
                event.preventDefault()
                editorRef.current?.focus()
              }}
            >
              <InlineEditor
                key={`${node.identifier}:${inlineContentVersion}`}
                ref={editorRef}
                initialContent={editorInlines}
                onSave={handleSave}
                onEnterAtEnd={onEnterAtEnd}
                onBackspaceAtStart={onBackspaceAtStart}
                onArrowUp={onArrowUp}
                onArrowDown={onArrowDown}
                onSplit={onSplit}
                onSmartPaste={onSmartPaste}
                blockType="footnoteDefinition"
                placeholder="Contenu de la note…"
              />
            </div>
          </div>
        </div>
      </div>
    )
  },
)
