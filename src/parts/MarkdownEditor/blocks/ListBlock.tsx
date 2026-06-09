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
import { FormatToolbar } from '../FormatToolbar'
import type { FormatToolbarState } from '../FormatToolbar'
import { domToInlines } from '../lib/domToInlines'
import { inlinesToHtml } from '../lib/inlinesToHtml'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'
import type { BlockNode, InlineNode, ListItemNode, ListNode, ParagraphNode } from '../lib/types'

function isInsideTag(range: Range, boundary: HTMLElement, tag: string): boolean {
  let node: Node | null = range.commonAncestorContainer
  while (node && node !== boundary) {
    if ((node as Element).tagName?.toLowerCase() === tag) return true
    node = node.parentNode
  }
  return false
}

function getLinkHref(range: Range, boundary: HTMLElement): string | null {
  let node: Node | null = range.commonAncestorContainer
  while (node && node !== boundary) {
    if ((node as Element).tagName?.toLowerCase() === 'a') {
      return (node as HTMLAnchorElement).getAttribute('href')
    }
    node = node.parentNode
  }
  return null
}

// ─── Types internes ──────────────────────────────────────────────────────────

export interface ListBlockItem {
  id: string
  inlines: InlineNode[]
  checked: boolean | null
  depth: number
}

let _li = 0
const newItemId = () => `li${++_li}`

// ─── Conversion node ↔ items ─────────────────────────────────────────────────

function nodeToItems(node: ListNode, depth = 0): ListBlockItem[] {
  return node.children.flatMap((item) => {
    const para = item.children.find((c): c is ParagraphNode => c.type === 'paragraph')
    const sublist = item.children.find((c): c is ListNode => c.type === 'list')
    const result: ListBlockItem[] = [{ id: newItemId(), inlines: para?.children ?? [], checked: item.checked, depth }]
    if (sublist) result.push(...nodeToItems(sublist, depth + 1))
    return result
  })
}

export function listBlockItemsToNode(items: ListBlockItem[], base: ListNode): ListNode {
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

// ─── Calcul des marqueurs imbriqués (1.1, a.1, a.1.1…) ──────────────────────

function computeLabels(items: ListBlockItem[], listStyle: string): string[] {
  // counters[depth] = compteur courant pour ce niveau
  const counters: number[] = []
  return items.map(item => {
    const d = item.depth
    // Reset des niveaux plus profonds
    counters.splice(d + 1)
    // Incrémenter le compteur courant
    counters[d] = (counters[d] ?? 0) + 1
    // Construire le label selon la profondeur
    if (listStyle === 'alpha') {
      // Niveau 0 → lettre, niveaux suivants → numéros
      const parts = counters.map((c, i) => i === 0 ? String.fromCharCode(96 + c) : String(c))
      return parts.join('.') + '.'
    } else if (listStyle === 'ordered' || listStyle === 'numeric') {
      return counters.join('.') + '.'
    }
    return '' // bullet/checklist → pas de label calculé
  })
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface ListBlockProps {
  node: ListNode
  onChange: (node: ListNode) => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
  onLiftItemAtStart?: (id: string, items: ListBlockItem[], node: ListNode) => void
  onCreateFootnote?: (selectedText: string) => string | null
  onRemoveFootnote?: (identifier: string) => void
}

// ─── Composant ───────────────────────────────────────────────────────────────

export const ListBlock = forwardRef<InlineEditorHandle, ListBlockProps>(
  function ListBlock({ node, onChange, onArrowUp, onArrowDown, onEnterAtEnd, onBackspaceAtStart, onLiftItemAtStart, onCreateFootnote, onRemoveFootnote }, ref) {
    const [items, setItems] = useState<ListBlockItem[]>(() => nodeToItems(node))
    const listStyle = (node.data?.listStyle as string | undefined) ?? (node.ordered ? 'ordered' : 'bullet')
    const labels = computeLabels(items, listStyle)
    // Ref toujours synchronisé avec items pour éviter les closures périmées dans les handlers
    const itemsRef = useRef(items)
    itemsRef.current = items
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
      flush() {},
      getContent() { return [] },
    }))

    // ── Emit ─────────────────────────────────────────────────────────────────

    const emit = useCallback(
      (next: ListBlockItem[]) => onChange(listBlockItemsToNode(next, node)),
      [onChange, node],
    )

    // ── Sauvegarder le contenu d'un item ─────────────────────────────────────

    const saveItem = useCallback(
      (id: string, inlines: InlineNode[]) => {
        const next = itemsRef.current.map((item) => (item.id === id ? { ...item, inlines } : item))
        setItems(next)
        emit(next)
      },
      [emit],
    )

    // ── Enter : nouvel item ou sortie de liste ────────────────────────────────

    const handleItemEnter = useCallback(
      (id: string, beforeInlines: InlineNode[], afterInlines: InlineNode[], isEmpty: boolean) => {
        const prev = itemsRef.current
        const idx = prev.findIndex((item) => item.id === id)
        if (idx === -1) return

        // Dernier item vide → sortir de la liste
        if (isEmpty && idx === prev.length - 1 && prev.length > 1) {
          const next = prev.slice(0, -1)
          setItems(next)
          emit(next)
          setTimeout(() => onEnterAtEnd?.(), 0)
          return
        }

        // Mettre à jour l'item courant ET créer le nouvel item en un seul setItems
        // (évite le batching React qui écrase les inlines si onSave et onEnter sont séparés)
        const isChecklist = prev.some((i) => i.checked !== null)
        const newItem: ListBlockItem = {
          id: newItemId(),
          inlines: afterInlines,
          checked: isChecklist ? false : null,
          depth: prev[idx].depth,
        }
        const next = [
          ...prev.slice(0, idx),
          { ...prev[idx], inlines: beforeInlines },
          newItem,
          ...prev.slice(idx + 1),
        ]
        setItems(next)
        emit(next)
        requestAnimationFrame(() => focusItem(newItem.id, 'start'))
      },
      [emit, focusItem, onEnterAtEnd],
    )

    // ── Toggle case à cocher ────────────────────────────────────────────────

    const handleItemToggle = useCallback(
      (id: string) => {
        const next = itemsRef.current.map((item) =>
          item.id === id && item.checked !== null
            ? { ...item, checked: !item.checked }
            : item
        )
        setItems(next)
        emit(next)
      },
      [emit],
    )

    // ── Tab : indentation (sous-liste) ─────────────────────────────────────────

    const handleItemTab = useCallback(
      (id: string, shift: boolean, currentInlines: InlineNode[]) => {
        const prev = itemsRef.current
        const idx = prev.findIndex((item) => item.id === id)
        if (idx === -1) return
        const item = prev[idx]
        // Toujours utiliser currentInlines (les inlines frais du DOM) pour éviter
        // d'écraser les modifications non sauvegardées avec l'ancien state
        const updatedItem = { ...item, inlines: currentInlines }
        if (shift) {
          if (item.depth === 0) {
            // Pas de dé-indentation possible, mais sauvegarder les inlines quand même
            const next = prev.map((it, i) => i === idx ? updatedItem : it)
            setItems(next)
            emit(next)
            return
          }
          const next = prev.map((it, i) => i === idx ? { ...updatedItem, depth: it.depth - 1 } : it)
          setItems(next)
          emit(next)
        } else {
          if (idx === 0) {
            // Pas d'indentation possible, mais sauvegarder les inlines quand même
            const next = prev.map((it, i) => i === idx ? updatedItem : it)
            setItems(next)
            emit(next)
            return
          }
          const maxDepth = prev[idx - 1].depth + 1
          if (item.depth >= maxDepth) {
            // Pas d'indentation possible, mais sauvegarder les inlines quand même
            const next = prev.map((it, i) => i === idx ? updatedItem : it)
            setItems(next)
            emit(next)
            return
          }
          const next = prev.map((it, i) => i === idx ? { ...updatedItem, depth: it.depth + 1 } : it)
          setItems(next)
          emit(next)
        }
      },
      [emit],
    )

    // ── Backspace sur item vide ───────────────────────────────────────────────

    const handleItemBackspace = useCallback(
      (id: string) => {
        const prev = itemsRef.current
        if (prev.length === 1) {
          // Seul item → laisser BlockEditor gérer (merge avec le bloc précédent)
          setTimeout(() => onBackspaceAtStart?.(), 0)
          return
        }
        const idx = prev.findIndex((item) => item.id === id)
        if (idx === -1) return
        const next = prev.filter((item) => item.id !== id)
        setItems(next)
        emit(next)
        const targetId = idx > 0 ? next[idx - 1].id : next[0].id
        requestAnimationFrame(() => focusItem(targetId, 'end'))
      },
      [emit, focusItem, onBackspaceAtStart],
    )

    const handleItemLift = useCallback(
      (id: string, inlines: InlineNode[]) => {
        const next = itemsRef.current.map((item) => (item.id === id ? { ...item, inlines } : item))
        setItems(next)
        emit(next)
        onLiftItemAtStart?.(id, next, node)
      },
      [emit, node, onLiftItemAtStart],
    )

    // ── Rendu ─────────────────────────────────────────────────────────────────

    return (
      <div className="my-4 space-y-0.5">
        {items.map((item, idx) => (
          <ListItemRow
            key={item.id}
            item={item}
            idx={idx}
            label={labels[idx]}
            ordered={node.ordered}
            listStyle={listStyle}
            elRef={(el) => {
              if (el) itemRefs.current.set(item.id, el)
              else itemRefs.current.delete(item.id)
            }}
            onSave={(inlines) => saveItem(item.id, inlines)}
            onToggle={() => handleItemToggle(item.id)}
            onEnter={(before, after, empty) => handleItemEnter(item.id, before, after, empty)}
            onTab={(shift, inlines) => handleItemTab(item.id, shift, inlines)}
            onBackspaceAtStart={() => handleItemBackspace(item.id)}
            onLiftItemAtStart={(inlines) => handleItemLift(item.id, inlines)}
            onArrowUp={(x) => {
              if (idx === 0) onArrowUp?.(x)
              else focusItem(items[idx - 1].id, 'end')
            }}
            onArrowDown={(x) => {
              if (idx === items.length - 1) onArrowDown?.(x)
              else focusItem(items[idx + 1].id, 'start')
            }}
            onCreateFootnote={onCreateFootnote}
            onRemoveFootnote={onRemoveFootnote}
          />
        ))}
      </div>
    )
  },
)

// ─── ListItemRow — un item de la liste ───────────────────────────────────────

function ListItemRow({
  item,
  idx: _idx,
  label,
  ordered,
  listStyle,
  elRef,
  onSave,
  onToggle,
  onEnter,
  onTab,
  onBackspaceAtStart,
  onLiftItemAtStart,
  onArrowUp,
  onArrowDown,
  onCreateFootnote,
  onRemoveFootnote,
}: {
  item: ListBlockItem
  idx: number
  label: string
  ordered: boolean
  listStyle: string
  elRef: (el: HTMLDivElement | null) => void
  onSave: (inlines: InlineNode[]) => void
  onToggle: () => void
  onEnter: (beforeInlines: InlineNode[], afterInlines: InlineNode[], isEmpty: boolean) => void
  onTab: (shift: boolean, currentInlines: InlineNode[]) => void
  onBackspaceAtStart: () => void
  onLiftItemAtStart: (currentInlines: InlineNode[]) => void
  onArrowUp: (x: number) => void
  onArrowDown: (x: number) => void
  onCreateFootnote?: (selectedText: string) => string | null
  onRemoveFootnote?: (identifier: string) => void
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef(false)
  const selectionRangeRef = useRef<Range | null>(null)
  const [toolbar, setToolbar] = useState<FormatToolbarState | null>(null)

  // Initialiser le contenu une seule fois au mount
  useEffect(() => {
    if (divRef.current) {
      divRef.current.innerHTML = inlinesToHtml(item.inlines)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleSelectionChange = () => {
      if (document.activeElement?.closest('[data-format-toolbar]')) return

      const sel = window.getSelection()
      const el = divRef.current
      if (!sel || sel.isCollapsed || !sel.rangeCount || !el) {
        setToolbar(null)
        return
      }

      const range = sel.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer)) {
        selectionRangeRef.current = null
        setToolbar(null)
        return
      }

      selectionRangeRef.current = range.cloneRange()
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) {
        setToolbar(null)
        return
      }

      setToolbar({
        rect,
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strike: document.queryCommandState('strikeThrough'),
        code: isInsideTag(range, el, 'code'),
        underline: isInsideTag(range, el, 'u'),
        superscript: isInsideTag(range, el, 'sup'),
        subscript: isInsideTag(range, el, 'sub'),
        link: getLinkHref(range, el),
        footnote: null,
      })
    }

    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  // Fermer la toolbar si scroll
  useEffect(() => {
    if (!toolbar) return
    const dismiss = () => setToolbar(null)
    window.addEventListener('scroll', dismiss, true)
    return () => window.removeEventListener('scroll', dismiss, true)
  }, [toolbar])

  const toggleCode = useCallback(() => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return

    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as Element).tagName?.toLowerCase() === 'code') {
        const frag = document.createDocumentFragment()
        while ((node as Element).firstChild) frag.appendChild((node as Element).firstChild!)
        node.parentNode?.replaceChild(frag, node)
        savedRef.current = false
        return
      }
      node = node.parentNode
    }

    const text = range.toString()
    range.deleteContents()
    const code = document.createElement('code')
    code.textContent = text
    range.insertNode(code)
    range.setStartAfter(code)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    savedRef.current = false
  }, [])

  const toggleUnderline = useCallback(() => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return

    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as Element).tagName?.toLowerCase() === 'u') {
        const frag = document.createDocumentFragment()
        while ((node as Element).firstChild) frag.appendChild((node as Element).firstChild!)
        node.parentNode?.replaceChild(frag, node)
        savedRef.current = false
        return
      }
      node = node.parentNode
    }

    try {
      const frag = range.extractContents()
      const underline = document.createElement('u')
      underline.appendChild(frag)
      range.insertNode(underline)
      const after = document.createRange()
      after.setStartAfter(underline)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)
      savedRef.current = false
    } catch {
      // Ignore DOM range errors and leave selection unchanged.
    }
  }, [])

  const toggleInlineTag = useCallback((tagName: 'sup' | 'sub') => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return

    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as Element).tagName?.toLowerCase() === tagName) {
        const frag = document.createDocumentFragment()
        while ((node as Element).firstChild) frag.appendChild((node as Element).firstChild!)
        node.parentNode?.replaceChild(frag, node)
        savedRef.current = false
        return
      }
      node = node.parentNode
    }

    try {
      const frag = range.extractContents()
      const wrapper = document.createElement(tagName)
      wrapper.appendChild(frag)
      range.insertNode(wrapper)
      const after = document.createRange()
      after.setStartAfter(wrapper)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)
      savedRef.current = false
    } catch {
      // Ignore DOM range errors and leave selection unchanged.
    }
  }, [])

  const toggleSuperscript = useCallback(() => toggleInlineTag('sup'), [toggleInlineTag])
  const toggleSubscript = useCallback(() => toggleInlineTag('sub'), [toggleInlineTag])

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

  const insertFootnoteReference = useCallback(() => {
    const el = divRef.current
    const sel = window.getSelection()
    if (!el || !sel || !onCreateFootnote) return

    const liveRange = sel.rangeCount ? sel.getRangeAt(0) : null
    const range = liveRange && !liveRange.collapsed && el.contains(liveRange.commonAncestorContainer)
      ? liveRange.cloneRange()
      : selectionRangeRef.current?.cloneRange() ?? null
    if (!range || range.collapsed || !el.contains(range.commonAncestorContainer)) return

    const selectedText = range.toString().trim()
    const identifier = onCreateFootnote(selectedText)
    if (!identifier) return

    const refNode = document.createElement('sup')
    refNode.setAttribute('data-footnote-ref', identifier)
    refNode.setAttribute('data-footnote-label', identifier)
    refNode.setAttribute('contenteditable', 'false')
    refNode.textContent = `[${identifier}]`

    range.collapse(false)
    range.insertNode(refNode)

    const after = document.createRange()
    after.setStartAfter(refNode)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)
    selectionRangeRef.current = null

    savedRef.current = false
    if (el) {
      savedRef.current = true
      onSave(domToInlines(el))
    }
  }, [onCreateFootnote, onSave])

  const removeFootnoteReference = useCallback(() => {
    const el = divRef.current
    const sel = window.getSelection()
    if (!el || !sel || !onRemoveFootnote) return
    const range = sel.rangeCount ? sel.getRangeAt(0) : null
    if (!range || !el.contains(range.commonAncestorContainer)) return

    let node: Node | null = range.commonAncestorContainer
    let footnoteEl: Element | null = null
    while (node && node !== el) {
      if ((node as Element).hasAttribute?.('data-footnote-ref')
          || (node as Element).hasAttribute?.('data-footnote-anchor')) {
        footnoteEl = node as Element
        break
      }
      node = node.parentNode
    }
    if (!footnoteEl) return

    const identifier = footnoteEl.getAttribute('data-footnote-ref')
      ?? footnoteEl.getAttribute('data-footnote-anchor')
    if (!identifier) return

    onRemoveFootnote(identifier)
    footnoteEl.remove()

    savedRef.current = true
    onSave(domToInlines(el))
  }, [onRemoveFootnote, onSave])

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
      // Lire les inlines actuels du DOM et les passer avec onTab pour éviter
      // que le setItems de tab écrase les modifications non sauvegardées
      savedRef.current = true
      const currentInlines = domToInlines(el)
      onTab(e.shiftKey, currentInlines)
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
      // beforeInlines = contenu DOM après extractContents (seule la partie avant curseur reste)
      const beforeInlines = domToInlines(el)
      onEnter(beforeInlines, afterInlines, isEmpty)
      return
    }
    if (e.key === 'Backspace' && isAtStart()) {
      const isEmpty = !el.textContent?.trim()
      if (isEmpty) {
        e.preventDefault()
        onBackspaceAtStart()
        return
      }
      e.preventDefault()
      savedRef.current = true
      const currentInlines = domToInlines(el)
      if (item.depth > 0) {
        onTab(true, currentInlines)
      } else {
        onLiftItemAtStart(currentInlines)
      }
      return
    }
    // Formatage inline
    if (e.key === 'Escape' && toolbar) {
      e.preventDefault()
      setToolbar(null)
      window.getSelection()?.collapseToStart()
      return
    }
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold'); return }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic'); return }
      if (e.key === '.') { e.preventDefault(); toggleSuperscript(); return }
      if (e.key === ',') { e.preventDefault(); toggleSubscript(); return }
      if (e.key === 's' && e.shiftKey) { e.preventDefault(); document.execCommand('strikeThrough'); return }
      if (e.key === 'k' && e.shiftKey) { e.preventDefault(); document.execCommand('unlink'); setToolbar(null); return }
    }
  }

  const marker = item.checked !== null
    ? (
      <button
        onMouseDown={(e) => { e.preventDefault(); onToggle() }}
        className={cn(
          'mt-[0.5em] flex size-[1.05em] shrink-0 items-center justify-center rounded-sm border transition-colors',
          item.checked
            ? 'border-holo-primary-soft bg-holo-primary-soft'
            : 'border-white/30 bg-transparent hover:border-holo-primary-soft/60 cursor-pointer',
        )}
      >
        {item.checked && <Check size={9} strokeWidth={3} className="text-white" />}
      </button>
    )
    : listStyle === 'alpha'
    ? (
      <span className="min-w-[2rem] mt-[0.35em] shrink-0 select-none text-right text-holo-text-faint" style={{ fontSize: 'calc(0.875rem * var(--editor-fs-scale, 1))' }}>
        {label}
      </span>
    )
    : ordered
    ? (
      <span className="min-w-[2rem] mt-[0.5em] shrink-0 select-none text-right tabular-nums text-holo-text-faint" style={{ fontSize: 'calc(0.875rem * var(--editor-fs-scale, 1))' }}>
        {label}
      </span>
    )
    : (
      <span className="mt-[0.8em] size-[5px] bg-current rounded-full shrink-0 select-none opacity-50" />
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
        data-list-text
        className={cn('min-h-[1.5em] flex-1 outline-none transition-opacity', item.checked && 'opacity-40 line-through')}
        onFocus={() => { savedRef.current = false }}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const el = divRef.current
          if (!savedRef.current && el) {
            savedRef.current = true
            onSave(domToInlines(el))
          }
          setTimeout(() => {
            if (!document.activeElement?.closest('[data-format-toolbar]')) {
              setToolbar(null)
            }
          }, 0)
        }}
        onInput={() => { savedRef.current = false }}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (text) document.execCommand('insertText', false, text)
        }}
      />

      {toolbar && (
        <FormatToolbar
          state={toolbar}
          onBold={() => document.execCommand('bold')}
          onItalic={() => document.execCommand('italic')}
          onStrike={() => document.execCommand('strikeThrough')}
          onCode={toggleCode}
          onUnderline={toggleUnderline}
          onSuperscript={toggleSuperscript}
          onSubscript={toggleSubscript}
          onFootnote={insertFootnoteReference}
          onLink={(url) => document.execCommand('createLink', false, url)}
          onUnlink={() => document.execCommand('unlink')}
          onUnlinkFootnote={removeFootnoteReference}
        />
      )}
    </div>
  )
}
