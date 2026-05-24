/**
 * InlineEditor.tsx — Éditeur de contenu inline partagé
 *
 * contentEditable avec sous-ensemble HTML strict (strong/em/code/a/del/br).
 * - Init : inlinesToHtml() → innerHTML
 * - Save (blur) : domToInlines() → InlineNode[]
 * - Raccourcis : Ctrl+B, Ctrl+I
 * - Callbacks : onEnterAtEnd, onBackspaceAtStart (pour la navigation entre blocs)
 * - Handle impératif : focus(cursor?) pour la navigation clavier inter-blocs
 */

import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { domToInlines } from './lib/domToInlines'
import { inlinesToHtml } from './lib/inlinesToHtml'
import { FormatToolbar } from './FormatToolbar'
import type { FormatToolbarState } from './FormatToolbar'
import type { InlineNode } from './lib/types'
import { cn } from '../../utils/global'

// ─── Helpers sélection (niveau module) ──────────────────────────────────────

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
    if ((node as Element).tagName?.toLowerCase() === 'a')
      return (node as HTMLAnchorElement).getAttribute('href')
    node = node.parentNode
  }
  return null
}

export type InitialCursor =
  | { type: 'click'; x: number; y: number }
  | { type: 'arrow'; x: number; edge: 'top' | 'bottom' }
  | null

/** Handle exposé via ref pour la navigation inter-blocs */
export interface InlineEditorHandle {
  focus: (cursor?: InitialCursor) => void
  /** Vide le contenu du div (utilisé après une conversion de type) */
  clear: () => void
  /** Supprime le «/» du DOM et retourne le contenu restant */
  clearSlash: () => InlineNode[]
}

export interface InlineEditorProps {
  initialContent: InlineNode[]
  onSave: (nodes: InlineNode[]) => void
  onEnterAtEnd?: () => void
  onEnterAtStart?: () => void
  onBackspaceAtStart?: () => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  /** Type sémantique du bloc — utilisé comme data-block-type pour le CSS */
  blockType?: string
  /** Texte du placeholder */
  placeholder?: string
  /** Conversion de type via raccourci markdown (# + espace, etc.) */
  onConvert?: (type: string, children: InlineNode[]) => void
  /** Commande slash dans un bloc vide */
  onSlashCommand?: (rect: DOMRect) => void
  /** Shift+Enter : scinde le bloc au curseur — le contenu après va dans un nouveau bloc */
  onSplit?: (after: InlineNode[]) => void
  className?: string
}

export const InlineEditor = forwardRef<InlineEditorHandle, InlineEditorProps>(function InlineEditor({
  initialContent,
  onSave,
  onEnterAtEnd,
  onEnterAtStart,
  onBackspaceAtStart,
  onArrowUp,
  onArrowDown,
  blockType,
  placeholder = 'Écrire quelque chose…',
  onConvert,
  onSlashCommand,
  onSplit,
  className,
}, ref) {
  const divRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef(false)
  const slashRangeRef = useRef<Range | null>(null)

  // État de la toolbar de formatage inline
  const [toolbar, setToolbar] = useState<FormatToolbarState | null>(null)

  // Met à jour data-empty selon le contenu réel (ignore le <br> fantôme de Chrome)
  const syncEmpty = useCallback((el: HTMLElement) => {
    const hasContent = domToInlines(el).length > 0
    el.dataset.empty = hasContent ? 'false' : 'true'
  }, [])

  // Init une seule fois au mount : set content sans focus automatique
  useEffect(() => {
    const el = divRef.current
    if (!el) return
    el.innerHTML = inlinesToHtml(initialContent)
    syncEmpty(el)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Toolbar : suit la sélection active dans ce bloc
  useEffect(() => {
    const handleSelectionChange = () => {
      // Conserver la toolbar si le focus est dedans (ex. input URL du lien)
      if (document.activeElement?.closest('[data-format-toolbar]')) return
      const sel = window.getSelection()
      const el = divRef.current
      if (!sel || sel.isCollapsed || !sel.rangeCount || !el) {
        setToolbar(null)
        return
      }
      const range = sel.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer)) { setToolbar(null); return }
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) { setToolbar(null); return }
      setToolbar({
        rect,
        bold:   document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strike: document.queryCommandState('strikeThrough'),
        code:   isInsideTag(range, el, 'code'),
        link:   getLinkHref(range, el),
      })
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [])

  // Positionne le curseur selon le type de navigation
  const positionCursor = (el: HTMLElement, cursor?: InitialCursor) => {
    const sel = window.getSelection()
    if (!sel) return

    if (cursor?.type === 'click') {
      const r = document.caretRangeFromPoint(cursor.x, cursor.y)
      if (r) { sel.removeAllRanges(); sel.addRange(r); return }
    }

    if (cursor?.type === 'arrow') {
      const elRect = el.getBoundingClientRect()
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 24
      const y = cursor.edge === 'top'
        ? elRect.top + lh / 2
        : elRect.bottom - lh / 2
      const r = document.caretRangeFromPoint(cursor.x, y)
      if (r) { sel.removeAllRanges(); sel.addRange(r); return }
    }

    // Fallback : curseur à la fin
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  // Handle impératif : appelé par BlockEditor pour la navigation inter-blocs
  useImperativeHandle(ref, () => ({
    focus(cursor?: InitialCursor) {
      const el = divRef.current
      if (!el) return
      el.focus()
      savedRef.current = false
      positionCursor(el, cursor)
    },
    clear() {
      const el = divRef.current
      if (!el) return
      el.innerHTML = ''
      syncEmpty(el)
    },
    clearSlash(): InlineNode[] {
      const el = divRef.current
      if (!el) return []
      const slashRange = slashRangeRef.current
      if (slashRange) {
        try {
          const deleteRange = document.createRange()
          // Effacer depuis le '/' jusqu'à la position courante du curseur
          // (inclut le texte de recherche tapé après le '/')
          deleteRange.setStart(slashRange.startContainer, slashRange.startOffset - 1)
          const sel = window.getSelection()
          if (sel?.rangeCount) {
            const cur = sel.getRangeAt(0)
            deleteRange.setEnd(cur.startContainer, cur.startOffset)
          } else {
            deleteRange.setEnd(slashRange.startContainer, slashRange.startOffset)
          }
          deleteRange.deleteContents()
        } catch { /* ignore */ }
        slashRangeRef.current = null
      }
      syncEmpty(el)
      // Marquer comme sauvegardé : clearSlash() capture le contenu et le transmet
      // via handleConvert. Si on laissait savedRef=false, onBlur déclencherait
      // un save() qui écraserait le nouveau nœud (list/table) avec un ParagraphNode.
      savedRef.current = true
      return domToInlines(el)
    },
  }))

  // Bascule le formatage <code> sur la sélection
  const toggleCode = useCallback(() => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    // Désencapsuler si déjà dans <code>
    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as Element).tagName?.toLowerCase() === 'code') {
        const frag = document.createDocumentFragment()
        while ((node as Element).firstChild) frag.appendChild((node as Element).firstChild!)
        node.parentNode?.replaceChild(frag, node)
        syncEmpty(el); savedRef.current = false
        return
      }
      node = node.parentNode
    }
    // Encapsuler — GFM inline code est du texte brut
    const text = range.toString()
    range.deleteContents()
    const code = document.createElement('code')
    code.textContent = text
    range.insertNode(code)
    range.setStartAfter(code)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    syncEmpty(el); savedRef.current = false
  }, [syncEmpty])

  const save = useCallback(() => {
    if (savedRef.current) return
    const el = divRef.current
    // Ne pas sauvegarder si l'élément a été retiré du DOM (ex : conversion de type)
    if (!el || !document.contains(el)) return
    savedRef.current = true
    onSave(domToInlines(el))
  }, [onSave])

  // Vérifie si le curseur est au tout début du contenu
  // Mesure le texte entre le début de l'élément et le curseur
  const isAtStart = (): boolean => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return false
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return false
    const el = divRef.current
    if (!el) return false
    try {
      const testRange = document.createRange()
      testRange.setStart(el, 0)
      testRange.setEnd(range.startContainer, range.startOffset)
      return testRange.toString().length === 0
    } catch {
      return false
    }
  }

  // Détecte si le curseur est visuellement sur la première ligne
  const isOnFirstLine = (): boolean => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return false
    const el = divRef.current
    if (!el) return false
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect.height) return true // bloc vide
    return rect.top - el.getBoundingClientRect().top < rect.height
  }

  // Détecte si le curseur est visuellement sur la dernière ligne
  const isOnLastLine = (): boolean => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return false
    const el = divRef.current
    if (!el) return false
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect.height) return true // bloc vide
    return el.getBoundingClientRect().bottom - rect.bottom < rect.height
  }

  // Retourne la position X du curseur (en coordonnées viewport)
  const getCursorX = (): number => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel || !sel.rangeCount || !el) return el?.getBoundingClientRect().left ?? 0
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    return rect.left || el.getBoundingClientRect().left
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Raccourcis de conversion : # + espace au début d’un bloc (avec ou sans contenu)
    if (e.key === ' ' && onConvert) {
      const el = divRef.current
      const sel = window.getSelection()
      if (el && sel?.rangeCount) {
        const range = sel.getRangeAt(0)
        if (range.collapsed) {
          try {
            const testRange = document.createRange()
            testRange.setStart(el, 0)
            testRange.setEnd(range.startContainer, range.startOffset)
            const textBeforeCursor = testRange.toString()
            const match = textBeforeCursor.match(/^(#{1,4})$/)
            if (match) {
              e.preventDefault()
              testRange.deleteContents()
              const children = domToInlines(el)
              onConvert(`heading-${match[1].length}`, children)
              return
            }
            // - ou * → liste à puces
            if (/^[-*]$/.test(textBeforeCursor)) {
              e.preventDefault()
              testRange.deleteContents()
              const children = domToInlines(el)
              onConvert('list-bullet', children)
              return
            }
            // 1. → liste numérotée
            if (textBeforeCursor === '1.') {
              e.preventDefault()
              testRange.deleteContents()
              const children = domToInlines(el)
              onConvert('list-ordered', children)
              return
            }
            // [ ] → checklist
            if (textBeforeCursor === '[ ]') {
              e.preventDefault()
              testRange.deleteContents()
              const children = domToInlines(el)
              onConvert('checklist', children)
              return
            }
          } catch { /* ignore */ }
        }
      }
    }

    // Commande slash — ouvre le menu à tout moment
    if (e.key === '/' && onSlashCommand) {
      const el = divRef.current
      if (el) {
        // Laisser le "/" s’insérer, puis capturer la position et ouvrir le popup
        setTimeout(() => {
          const sel = window.getSelection()
          if (!sel?.rangeCount) return
          const range = sel.getRangeAt(0)
          slashRangeRef.current = range.cloneRange()
          const rect = range.getBoundingClientRect()
          onSlashCommand(rect.width === 0 ? el.getBoundingClientRect() : rect)
        }, 0)
      }
    }

    // Enter → bloc avant si curseur au début d'un bloc non vide, sinon bloc après
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const blockIsEmpty = !divRef.current?.textContent?.trim()
      if (!blockIsEmpty && isAtStart() && onEnterAtStart) {
        save()
        onEnterAtStart()
      } else if (onEnterAtEnd) {
        save()
        onEnterAtEnd()
      }
      return
    }

    // Shift+Enter → scinde le bloc au curseur
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      if (!onSplit) return
      const el = divRef.current
      const sel = window.getSelection()
      if (!el || !sel?.rangeCount) return
      const cursor = sel.getRangeAt(0)
      // Extraire le contenu après le curseur dans un div temporaire
      const afterRange = document.createRange()
      afterRange.setStart(cursor.endContainer, cursor.endOffset)
      afterRange.setEnd(el, el.childNodes.length)
      const tmp = document.createElement('div')
      tmp.appendChild(afterRange.extractContents())
      const afterNodes = domToInlines(tmp)
      syncEmpty(el)
      savedRef.current = false
      save()
      onSplit(afterNodes)
      return
    }

    // Backspace au début → supprime le bloc s'il est vide
    if (e.key === 'Backspace' && isAtStart() && onBackspaceAtStart) {
      const el = divRef.current
      if (el && !el.textContent?.trim()) {
        e.preventDefault()
        save()
        onBackspaceAtStart()
      }
      return
    }

    // Flèche haut sur première ligne → bloc précédent
    if (e.key === 'ArrowUp' && isOnFirstLine() && onArrowUp) {
      e.preventDefault()
      save()
      onArrowUp(getCursorX())
      return
    }

    // Flèche bas sur dernière ligne → bloc suivant
    if (e.key === 'ArrowDown' && isOnLastLine() && onArrowDown) {
      e.preventDefault()
      save()
      onArrowDown(getCursorX())
      return
    }

    // Formatage inline
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); document.execCommand('bold');              return }
      if (e.key === 'i') { e.preventDefault(); document.execCommand('italic');            return }
      if (e.key === 'e') { e.preventDefault(); toggleCode();                              return }
      if (e.key === 's' && e.shiftKey) { e.preventDefault(); document.execCommand('strikeThrough'); return }
    }
  }

  return (
    <>
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        data-block-type={blockType}
        onFocus={() => { savedRef.current = false }}
        onBlur={() => {
          save()
          // Masquer la toolbar sauf si le focus part vers elle (ex. input URL)
          setTimeout(() => {
            if (!document.activeElement?.closest('[data-format-toolbar]')) {
              setToolbar(null)
            }
          }, 0)
        }}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (!text) return
          // Insérer le texte brut à la position du curseur (préserve l'historique undo)
          document.execCommand('insertText', false, text)
        }}
        onInput={(e) => { syncEmpty(e.currentTarget); savedRef.current = false }}
        className={cn('outline-none', className)}
      />
      {toolbar && (
        <FormatToolbar
          state={toolbar}
          onBold={()   => document.execCommand('bold')}
          onItalic={()  => document.execCommand('italic')}
          onStrike={()  => document.execCommand('strikeThrough')}
          onCode={toggleCode}
          onLink={(url) => document.execCommand('createLink', false, url)}
          onUnlink={()  => document.execCommand('unlink')}
        />
      )}
    </>
  )
})
