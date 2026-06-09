/**
 * BlockquoteBlock.tsx — Bloc citation éditable (blockquote)
 */

import { AlertCircle, ChevronDown, CircleX, FileText, Info, Sparkles, TriangleAlert, type LucideIcon } from 'lucide-react'
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { InlineEditor } from '../InlineEditor'
import type { InlineEditorHandle } from '../InlineEditor'
import type { BlockquoteNode, ParagraphNode, InlineNode } from '../lib/types'
import { BLOCKQUOTE_ALERT_LABELS, buildBlockquoteAlertNodes, parseBlockquoteAlert, type BlockquoteAlertType } from '../lib/blockquoteAlerts'
import { cn } from '../../../utils/global'

const BLOCKQUOTE_MENU_OPEN_EVENT = 'blockquote-type-menu-open'

export interface BlockquoteBlockProps {
  node: BlockquoteNode
  className?: string
  onChange?: (node: BlockquoteNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (x: number) => void
  onArrowDown?: (x: number) => void
  onSplit?: (after: InlineNode[]) => void
  onSmartPaste?: (before: InlineNode[], after: InlineNode[], md: string) => void
  onCreateFootnote?: (selectedText: string) => string | null
  onRemoveFootnote?: (identifier: string) => void
}

export const BlockquoteBlock = forwardRef<InlineEditorHandle, BlockquoteBlockProps>(
  function BlockquoteBlock({ node, className, onChange, onEnterAtEnd, onBackspaceAtStart, onArrowUp, onArrowDown, onSplit, onSmartPaste, onCreateFootnote, onRemoveFootnote }, ref) {
    const firstPara = node.children[0] as ParagraphNode | undefined
    const inlines: InlineNode[] = firstPara?.type === 'paragraph' ? firstPara.children : []
    const editorRef = useRef<InlineEditorHandle | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const buttonRef = useRef<HTMLButtonElement | null>(null)
    const popupRef = useRef<HTMLDivElement | null>(null)
    const alert = useMemo(() => parseBlockquoteAlert(inlines), [inlines])
    const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false)
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null)
    const instanceId = useId()

    const alertOptions: Array<{ value: BlockquoteAlertType | null; label: string; Icon: LucideIcon; iconClassName: string }> = [
      { value: null, label: 'Citation simple', Icon: FileText, iconClassName: 'text-holo-text-faint' },
      { value: 'note', label: BLOCKQUOTE_ALERT_LABELS.note, Icon: Info, iconClassName: 'text-sky-300' },
      { value: 'tip', label: BLOCKQUOTE_ALERT_LABELS.tip, Icon: Sparkles, iconClassName: 'text-emerald-300' },
      { value: 'important', label: BLOCKQUOTE_ALERT_LABELS.important, Icon: AlertCircle, iconClassName: 'text-amber-300' },
      { value: 'warning', label: BLOCKQUOTE_ALERT_LABELS.warning, Icon: TriangleAlert, iconClassName: 'text-rose-300' },
      { value: 'caution', label: BLOCKQUOTE_ALERT_LABELS.caution, Icon: CircleX, iconClassName: 'text-red-300' },
    ]

    const alertStyles: Record<BlockquoteAlertType, { wrapper: string; badge: string }> = {
      note: {
        wrapper: 'border-[#38bdf8]/45 bg-[#38bdf8]/8 text-holo-text',
        badge: 'bg-[#38bdf8]/14 text-[#8bdcff]',
      },
      tip: {
        wrapper: 'border-[#10b981]/45 bg-[#10b981]/8 text-holo-text',
        badge: 'bg-[#10b981]/14 text-[#7af0c2]',
      },
      important: {
        wrapper: 'border-[#f59e0b]/45 bg-[#f59e0b]/8 text-holo-text',
        badge: 'bg-[#f59e0b]/14 text-[#ffd38a]',
      },
      warning: {
        wrapper: 'border-[#fb7185]/45 bg-[#fb7185]/8 text-holo-text',
        badge: 'bg-[#fb7185]/14 text-[#ffb4c0]',
      },
      caution: {
        wrapper: 'border-[#ef4444]/45 bg-[#ef4444]/8 text-holo-text',
        badge: 'bg-[#ef4444]/14 text-[#ffaea6]',
      },
    }

    useImperativeHandle(ref, () => ({
      focus: (cursor) => editorRef.current?.focus(cursor),
      clear: () => editorRef.current?.clear(),
      clearSlash: () => editorRef.current?.clearSlash() ?? [],
      flush: () => editorRef.current?.flush(),
      getContent: () => editorRef.current?.getContent() ?? [],
    }), [])

    useEffect(() => {
      if (!isTypeMenuOpen) return

      const handlePointerDown = (event: MouseEvent) => {
        if (menuRef.current?.contains(event.target as Node)) return
        if (popupRef.current?.contains(event.target as Node)) return
        setIsTypeMenuOpen(false)
      }

      document.addEventListener('mousedown', handlePointerDown)
      return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [isTypeMenuOpen])

    // Fermer ce menu quand un autre blockquote ouvre le sien
    useEffect(() => {
      const handler = (e: Event) => {
        const custom = e as CustomEvent<{ instanceId: string }>
        if (custom.detail.instanceId !== instanceId) setIsTypeMenuOpen(false)
      }
      window.addEventListener(BLOCKQUOTE_MENU_OPEN_EVENT, handler)
      return () => window.removeEventListener(BLOCKQUOTE_MENU_OPEN_EVENT, handler)
    }, [instanceId])

    const handleSave = (newChildren: InlineNode[]) => {
      if (!onChange) return
      const updatedPara: ParagraphNode = {
        type: 'paragraph',
        children: alert ? buildBlockquoteAlertNodes(alert.type, newChildren) : newChildren,
      }
      onChange({ ...node, children: [updatedPara, ...node.children.slice(1)] })
    }

    const visibleInlines = alert ? alert.content : inlines
    const currentAlertStyles = alert ? alertStyles[alert.type] : null
    const currentTypeLabel = alert ? BLOCKQUOTE_ALERT_LABELS[alert.type] : 'Citation'
    const currentTypeOption = alertOptions.find((option) => option.value === (alert?.type ?? null)) ?? alertOptions[0]

    const applyAlertType = (nextType: BlockquoteAlertType | null) => {
      if (!onChange) return
      const currentContent = editorRef.current?.getContent() ?? visibleInlines
      const updatedPara: ParagraphNode = {
        type: 'paragraph',
        children: nextType ? buildBlockquoteAlertNodes(nextType, currentContent) : currentContent,
      }
      onChange({ ...node, children: [updatedPara, ...node.children.slice(1)] })
      setIsTypeMenuOpen(false)
      requestAnimationFrame(() => editorRef.current?.focus())
    }

    return (
      <blockquote
        className={cn(
          'group/blockquote relative my-3 border-l-[3px] pl-4 py-2',
          alert
            ? cn('rounded-r-holo-xl pr-10', currentAlertStyles?.wrapper)
            : 'border-holo-primary/50 italic text-holo-text-muted pr-10',
          className,
        )}
        data-blockquote-alert={alert?.type}
        onBlurCapture={(event) => {
          const nextFocused = event.relatedTarget as Node | null
          if (nextFocused && event.currentTarget.contains(nextFocused)) return
          // Ne pas fermer si le focus part vers le popup (portail hors du DOM blockquote)
          if (nextFocused && popupRef.current?.contains(nextFocused)) return
          setIsTypeMenuOpen(false)
        }}
        onMouseDown={(event) => {
          const target = event.target as HTMLElement | null
          if (!target) return
          if (target.closest('[contenteditable="true"], button, a, input, [data-format-toolbar]')) return
          event.preventDefault()
          editorRef.current?.focus()
        }}
      >
        <div ref={menuRef} className="absolute right-1 top-1 z-10 flex items-center gap-2">
          <button
            ref={buttonRef}
            type="button"
            onMouseDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={() => {
              if (!isTypeMenuOpen) {
                const rect = buttonRef.current?.getBoundingClientRect()
                if (rect) setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                window.dispatchEvent(new CustomEvent(BLOCKQUOTE_MENU_OPEN_EVENT, { detail: { instanceId } }))
              }
              setIsTypeMenuOpen((current) => !current)
            }}
            aria-label={`Type de citation ${currentTypeLabel}`}
            aria-expanded={isTypeMenuOpen}
            className={cn(
              'inline-flex h-8 items-center overflow-hidden rounded-xl border text-[10px] font-semibold uppercase tracking-[0.14em] shadow-[0_8px_24px_rgba(0,0,0,.16)] transition-all',
              'w-8 justify-center px-0 py-0 opacity-100',
              'group-hover/blockquote:w-auto group-hover/blockquote:gap-1.5 group-hover/blockquote:px-2 group-hover/blockquote:py-1',
              'group-focus-within/blockquote:w-auto group-focus-within/blockquote:gap-1.5 group-focus-within/blockquote:px-2 group-focus-within/blockquote:py-1',
              isTypeMenuOpen && 'w-auto gap-1.5 px-2 py-1',
              alert && currentAlertStyles
                ? cn('border-transparent', currentAlertStyles.badge)
                : 'border-holo-border-soft bg-white/[0.04] text-holo-text-faint hover:bg-white/[0.06] hover:text-holo-text',
            )}
          >
            <span className="flex size-4 items-center justify-center leading-none">
              <currentTypeOption.Icon size={14} className={currentTypeOption.iconClassName} />
            </span>
            <span
              className={cn(
                'overflow-hidden transition-all',
                'w-0 opacity-0',
                'group-hover/blockquote:w-3 group-hover/blockquote:opacity-100',
                'group-focus-within/blockquote:w-3 group-focus-within/blockquote:opacity-100',
                isTypeMenuOpen && 'w-3 opacity-100',
              )}
            >
              <ChevronDown size={12} className={cn('transition-transform', isTypeMenuOpen && 'rotate-180')} />
            </span>
          </button>

          {isTypeMenuOpen && menuPosition && createPortal(
            <div
              ref={popupRef}
              style={{ position: 'fixed', top: menuPosition.top, right: menuPosition.right, zIndex: 9999 }}
              className="w-[8.5rem] rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.32)] backdrop-blur-2xl"
            >
              <div className="grid grid-cols-3 justify-items-center gap-1">
              {alertOptions.map((option) => {
                const isActive = (alert?.type ?? null) === option.value
                return (
                  <button
                    key={option.value ?? 'plain'}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onClick={() => applyAlertType(option.value)}
                    aria-label={`Définir le type ${option.label}`}
                    title={option.label}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-holo-md text-base transition',
                      isActive
                        ? 'bg-holo-primary-surface text-holo-primary-soft'
                        : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                    )}
                  >
                    <option.Icon aria-hidden="true" size={16} className={option.iconClassName} />
                  </button>
                )
              })}
              </div>
            </div>,
            document.body,
          )}
        </div>
        {alert && (
          <div className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold leading-none">
            <currentTypeOption.Icon size={15} className={currentTypeOption.iconClassName} />
            <span>{currentTypeLabel}</span>
          </div>
        )}
        <InlineEditor
          ref={editorRef}
          initialContent={visibleInlines}
          onSave={handleSave}
          onEnterAtEnd={onEnterAtEnd}
          onBackspaceAtStart={onBackspaceAtStart}
          onArrowUp={onArrowUp}
          onArrowDown={onArrowDown}
          onSplit={onSplit}
          onSmartPaste={onSmartPaste}
          onCreateFootnote={onCreateFootnote}
          onRemoveFootnote={onRemoveFootnote}
          blockType="blockquote"
          placeholder={alert ? 'Contenu de l’alerte…' : 'Citation…'}
          className={cn(alert && 'text-holo-text [&_[data-placeholder]]:text-holo-text-faint/70')}
        />
      </blockquote>
    )
  },
)
