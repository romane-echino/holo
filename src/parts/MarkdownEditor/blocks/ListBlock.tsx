/**
 * ListBlock.tsx — Bloc liste (bullet / numérotée) pour le BlockEditor
 *
 * Architecture proche de TableBlock :
 * - État interne : Item[] (stable pour les re-renders React)
 * - forwardRef<InlineEditorHandle> pour la navigation inter-blocs
 * - Chaque item est un <div contentEditable> avec inlinesToHtml / domToInlines
 *
 * Comportement clavier :
 * - Enter         → nouvel item en dessous
 * - Enter (vide, dernier item) → sort de la liste (appelle onEnterAtEnd)
 * - Backspace début item vide → supprime l'item (ou appelle onBackspaceAtStart si seul)
 * - ↑ / ↓        → navigation inter-items, puis inter-blocs en bord de liste
 * - Ctrl+B/I/Shift+S → formatage inline (bold / italic / strikethrough)
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../../utils/global'
import { domToInlines } from '../lib/domToInlines'
import { inlinesToHtml } from '../lib/inlinesToHtml'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'
import type { BlockNode, InlineNode, ListItemNode, ListNode, ParagraphNode } from '../lib/types'

// ─── Types internes ──────────────────────────────────────────────────────────

interface Item {
  id: string
  inlines: InlineNode[]
  checked: boolean | null
  depth: number
}

let _li = 0
const newItemId = () => `li${++_li}`

// ─── Conversion node ↔ items ─────────────────────────────────────────────────

function nodeToItems(node: ListNode, depth = 0): Item[] {
  return node.children.flatMap((item) => {
    const para = item.children.find((c): c is ParagraphNode => c.type === 'paragraph')
    const sublist = item.children.find((c): c is ListNode => c.type === 'list')
    const result: Item[] = [{ id: newItemId(), inlines: para?.children ?? [], checked: item.checked, depth }]
    if (sublist) result.push(...nodeToItems(sublist, depth + 1))
    return result
  })
}

function itemsToNode(items: Item[], base: ListNode): ListNode {
  function buildLevel(start: number, depth: number): { listItems: ListItemNode[]; nextIdx: number } {
    const listItems: ListItemNode[] = []
    let i = start
    while (i < items.length) {
      const item = items[i]
      if (item.depth < depth) break
      if (item.depth === depth) {
        const children: BlockNode[] = [{ type: 'paragraph', children: item.inlines }]
        i++
        if (i < items.length && items[i].depth > depth) {
          const { listItems: sub, nextIdx } = buildLevel(i, depth + 1)
          children.push({ ...base, spread: false, children: sub } as ListNode)
          i = nextIdx
        }
        listItems.push({ type: 'listItem', spread: false, checked: item.checked, children })
      } else {
        // depth > expected — traiter au niveau actuel
        listItems.push({ type: 'listItem', spread: false, checked: item.checked, children: [{ type: 'paragraph', children: item.inlines }] })
        i++
      }
    }
    return { listItems, nextIdx: i }
  }
  const { listItems } = buildLevel(0, 0)
  return { ...base, spread: false, children: listItems }
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ListBlockProps {
  node: ListNode
  onChange: (node: ListNode) => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

// ─── Composant ───────────────────────────────────────────────────────────────

export const ListBlock = forwardRef<InlineEditorHandle, ListBlockProps>(
  function ListBlock({ node, onChange, onArrowUp, onArrowDown, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const [items, setItems] = useState<Item[]>(() => nodeToItems(node))
    const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())

    // ── Focus helper ──────────────────────────────────────────────────────────

    const focusItem = useCallback((id: string, edge: 'start' | 'end') => {
      const el = itemRefs.current.get(id)
      if (!el) return
      el.focus()
      const sel = window.getSelection()
      if (!sel) return
      const range = document.createRange()
      if (edge === 'end') {
        range.selectNodeContents(el)
        range.collapse(false)
      } else {
        range.setStart(el, 0)
        range.collapse(true)
      }
      sel.removeAllRanges()
      sel.addRange(range)
    }, [])

    // ── Handle impératif (navigation depuis BlockEditor) ──────────────────────

    useImperativeHandle(ref, () => ({
      focus(cursor?: InitialCursor) {
        if (cursor?.type === 'arrow' && cursor.edge === 'bottom') {
          const last = items[items.length - 1]
          if (last) requestAnimationFrame(() => focusItem(last.id, 'end'))
        } else {
          const first = items[0]
          if (first) requestAnimationFrame(() => focusItem(first.id, 'start'))
        }
      },
      clear() {},
      clearSlash() { return [] },
    }))

    // ── Emit ─────────────────────────────────────────────────────────────────

    const emit = useCallback(
      (next: Item[]) => onChange(itemsToNode(next, node)),
      [onChange, node],
    )

    // ── Sauvegarder le contenu d'un item ─────────────────────────────────────

    const saveItem = useCallback(
      (id: string, inlines: InlineNode[]) => {
        setItems((prev) => {
          const next = prev.map((item) => (item.id === id ? { ...item, inlines } : item))
          emit(next)
          return next
        })
      },
      [emit],
    )

    // ── Enter : nouvel item ou sortie de liste ────────────────────────────────

    const handleItemEnter = useCallback(
      (id: string, afterInlines: InlineNode[], isEmpty: boolean) => {
        setItems((prev) => {
          const idx = prev.findIndex((item) => item.id === id)
          if (idx === -1) return prev

          // Dernier item vide → sortir de la liste
          if (isEmpty && idx === prev.length - 1 && prev.length > 1) {
            const next = prev.slice(0, -1)
            emit(next)
            setTimeout(() => onEnterAtEnd?.(), 0)
            return next
          }

          // Créer un nouvel item avec le contenu après le curseur
          const isChecklist = prev.some((i) => i.checked !== null)
          const newItem: Item = {
            id: newItemId(),
            inlines: afterInlines,
            checked: isChecklist ? false : null,
            depth: prev[idx].depth,
          }
          const next = [...prev.slice(0, idx + 1), newItem, ...prev.slice(idx + 1)]
          emit(next)
          requestAnimationFrame(() => focusItem(newItem.id, 'start'))
          return next
        })
      },
      [emit, focusItem, onEnterAtEnd],
    )

    // ── Toggle case à cocher ────────────────────────────────────────────────

    const handleItemToggle = useCallback(
      (id: string) => {
        setItems((prev) => {
          const next = prev.map((item) =>
            item.id === id && item.checked !== null
              ? { ...item, checked: !item.checked }
              : item
          )
          emit(next)
          return next
        })
      },
      [emit],
    )

    // ── Tab : indentation (sous-liste) ─────────────────────────────────────────

    const handleItemTab = useCallback(
      (id: string, shift: boolean) => {
        setItems((prev) => {
          const idx = prev.findIndex((item) => item.id === id)
          if (idx === -1) return prev
          const item = prev[idx]
          if (shift) {
            if (item.depth === 0) return prev
            const next = prev.map((it, i) => i === idx ? { ...it, depth: it.depth - 1 } : it)
            emit(next)
            return next
          } else {
            if (idx === 0) return prev // impossible d'indenter le 1er élément
            const maxDepth = prev[idx - 1].depth + 1
            if (item.depth >= maxDepth) return prev
            const next = prev.map((it, i) => i === idx ? { ...it, depth: it.depth + 1 } : it)
            emit(next)
            return next
          }
        })
      },
      [emit],
    )

    // ── Backspace sur item vide ───────────────────────────────────────────────

    const handleItemBackspace = useCallback(
      (id: string) => {
        setItems((prev) => {
          if (prev.length === 1) {
            // Seul item → laisser BlockEditor gérer (merge avec le bloc précédent)
            setTimeout(() => onBackspaceAtStart?.(), 0)
            return prev
          }
          const idx = prev.findIndex((item) => item.id === id)
          if (idx === -1) return prev
          const next = prev.filter((item) => item.id !== id)
          emit(next)
          const targetId = idx > 0 ? next[idx - 1].id : next[0].id
          requestAnimationFrame(() => focusItem(targetId, 'end'))
          return next
        })
      },
      [emit, focusItem, onBackspaceAtStart],
    )

    // ── Rendu ─────────────────────────────────────────────────────────────────

    return (
      <div className="my-0.5 space-y-0.5">
        {items.map((item, idx) => (
          <ListItemRow
            key={item.id}
            item={item}
            idx={idx}
            ordered={node.ordered}
            elRef={(el) => {
              if (el) itemRefs.current.set(item.id, el)
              else itemRefs.current.delete(item.id)
            }}
            onSave={(inlines) => saveItem(item.id, inlines)}
            onToggle={() => handleItemToggle(item.id)}
            onEnter={(after, empty) => handleItemEnter(item.id, after, empty)}
            onTab={(shift) => handleItemTab(item.id, shift)}
            onBackspaceAtStart={() => handleItemBackspace(item.id)}
            onArrowUp={(x) => {
              if (idx === 0) onArrowUp?.(x)
              else focusItem(items[idx - 1].id, 'end')
            }}
            onArrowDown={(x) => {
              if (idx === items.length - 1) onArrowDown?.(x)
              else focusItem(items[idx + 1].id, 'start')
            }}
          />
        ))}
      </div>
    )
  },
)

// ─── ListItemRow — un item de la liste ───────────────────────────────────────

function ListItemRow({
  item,
  idx,
  ordered,
  elRef,
  onSave,
  onToggle,
  onEnter,
  onTab,
  onBackspaceAtStart,
  onArrowUp,
  onArrowDown,
}: {
  item: Item
  idx: number
  ordered: boolean
  elRef: (el: HTMLDivElement | null) => void
  onSave: (inlines: InlineNode[]) => void
  onToggle: () => void
  onEnter: (afterInlines: InlineNode[], isEmpty: boolean) => void
  onTab: (shift: boolean) => void
  onBackspaceAtStart: () => void
  onArrowUp: (x: number) => void
  onArrowDown: (x: number) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef(false)

  // Initialiser le contenu une seule fois au mount
  useEffect(() => {
    if (divRef.current) {
      divRef.current.innerHTML = inlinesToHtml(item.inlines)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const getCursorX = (): number => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return el?.getBoundingClientRect().left ?? 0
    return sel.getRangeAt(0).getBoundingClientRect().left || el.getBoundingClientRect().left
  }

  const isAtStart = (): boolean => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return false
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return false
    const el = divRef.current
    if (!el) return false
    try {
      const test = document.createRange()
      test.setStart(el, 0)
      test.setEnd(range.startContainer, range.startOffset)
      return test.toString().length === 0
    } catch { return false }
  }

  const isOnFirstLine = (): boolean => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return false
    const el = divRef.current
    if (!el) return false
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect.height) return true
    return rect.top - el.getBoundingClientRect().top < rect.height
  }

  const isOnLastLine = (): boolean => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return false
    const el = divRef.current
    if (!el) return false
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect.height) return true
    return el.getBoundingClientRect().bottom - rect.bottom < rect.height
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = divRef.current
    if (!el) return

    if (e.key === 'ArrowUp' && isOnFirstLine()) {
      e.preventDefault()
      onArrowUp(getCursorX())
      return
    }
    if (e.key === 'ArrowDown' && isOnLastLine()) {
      e.preventDefault()
      onArrowDown(getCursorX())
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      onTab(e.shiftKey)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const isEmpty = !el.textContent?.trim()
      // Extraire le contenu après le curseur pour le mettre dans le nouvel item
      const sel = window.getSelection()
      let afterInlines: InlineNode[] = []
      if (!isEmpty && sel?.rangeCount) {
        try {
          const cursor = sel.getRangeAt(0)
          const afterRange = document.createRange()
          afterRange.setStart(cursor.endContainer, cursor.endOffset)
          afterRange.setEnd(el, el.childNodes.length)
          const tmp = document.createElement('div')
          tmp.appendChild(afterRange.extractContents())
          afterInlines = domToInlines(tmp)
        } catch { /* ignore */ }
      }
      savedRef.current = true
      onSave(domToInlines(el))
      onEnter(afterInlines, isEmpty)
      return
    }
    if (e.key === 'Backspace' && isAtStart() && !el.textContent?.trim()) {
      e.preventDefault()
      onBackspaceAtStart()
      return
    }
    // Formatage inline
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); return }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); return }
      if (e.key === 's' && e.shiftKey) { e.preventDefault(); document.execCommand('strikeThrough'); return }
    }
  }

  const marker = item.checked !== null
    ? (
      <button
        onMouseDown={(e) => { e.preventDefault(); onToggle() }}
        className={cn(
          'mt-[0.25em] flex size-[1.05em] shrink-0 items-center justify-center rounded-sm border transition-colors',
          item.checked
            ? 'border-holo-primary-soft bg-holo-primary-soft'
            : 'border-holo-border-muted bg-transparent hover:border-holo-primary-soft/60',
        )}
      >
        {item.checked && <Check size={9} strokeWidth={3} className="text-white" />}
      </button>
    )
    : ordered
    ? (
      <span className="min-w-[1.5rem] shrink-0 select-none text-right text-sm tabular-nums text-holo-text-faint">
        {idx + 1}.
      </span>
    )
    : (
      <span className="mt-[0.55em] size-[5px] shrink-0 select-none rounded-full bg-current opacity-50" />
    )

  return (
    <div className="flex items-start gap-2.5 py-[1px]" style={{ paddingLeft: `${item.depth * 1.5}rem` }}>
      {marker}
      <div
        ref={(el) => {
          (divRef as React.MutableRefObject<HTMLDivElement | null>).current = el
          elRef(el)
        }}
        contentEditable
        suppressContentEditableWarning
        className={cn('min-h-[1.5em] flex-1 outline-none transition-opacity', item.checked && 'opacity-40 line-through')}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const el = divRef.current
          if (!savedRef.current && el) {
            savedRef.current = true
            onSave(domToInlines(el))
          }
        }}
        onInput={() => { savedRef.current = false }}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (text) document.execCommand('insertText', false, text)
        }}
      />
    </div>
  )
}
