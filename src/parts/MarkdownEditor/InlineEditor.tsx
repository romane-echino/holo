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
import { inlinesToMarkdown } from './lib/inlinesToMarkdown'
import { FormatToolbar } from './FormatToolbar'
import type { FormatToolbarState } from './FormatToolbar'
import type { InlineNode } from './lib/types'
import { cn } from '../../utils/global'

async function writeClipboardPayload(payload: {
  plainText: string
  html: string
  markdown: string
}) {
  if (typeof navigator === 'undefined' || !('clipboard' in navigator)) return
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard.write !== 'function') return

  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/plain': new Blob([payload.plainText], { type: 'text/plain' }),
        'text/html': new Blob([payload.html], { type: 'text/html' }),
        'text/markdown': new Blob([payload.markdown], { type: 'text/markdown' }),
        'text/x-markdown': new Blob([payload.markdown], { type: 'text/x-markdown' }),
      }),
    ])
  } catch {
    // Le fallback e.clipboardData reste la source principale si l'API async est refusée.
  }
}

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
  /** Delete en fin de bloc → fusionner avec le bloc suivant */
  onDeleteAtEnd?: () => void
  onArrowUp?: (cursorX: number) => void
  onArrowDown?: (cursorX: number) => void
  /** Type sémantique du bloc — utilisé comme data-block-type pour le CSS */
  blockType?: string
  /** Texte du placeholder */
  placeholder?: string
  /** Toujours afficher le placeholder (même sans focus) — pour le premier bloc */
  alwaysShowPlaceholder?: boolean
  /** Conversion de type via raccourci markdown (# + espace, etc.) */
  onConvert?: (type: string, children: InlineNode[]) => void
  /** Commande slash dans un bloc vide */
  onSlashCommand?: () => void
  /** Shift+Enter : scinde le bloc au curseur — le contenu après va dans un nouveau bloc */
  onSplit?: (after: InlineNode[]) => void
  /** Coller du texte multi-paragraphe : délègue la création des blocs au parent */
  onSmartPaste?: (before: InlineNode[], after: InlineNode[], pastedMd: string) => void
  className?: string
}

export const InlineEditor = forwardRef<InlineEditorHandle, InlineEditorProps>(function InlineEditor({
  initialContent,
  onSave,
  onEnterAtEnd,
  onEnterAtStart,
  onBackspaceAtStart,
  onDeleteAtEnd,
  onArrowUp,
  onArrowDown,
  blockType,
  placeholder = 'Écrire quelque chose…',
  alwaysShowPlaceholder,
  onConvert,
  onSlashCommand,
  onSplit,
  onSmartPaste,
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
        underline: isInsideTag(range, el, 'u'),
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
          // Effacer depuis le '/' jusqu'à la position courante du curseur.
          // IMPORTANT : window.getSelection() peut pointer vers l'input du popup
          // (qui a le focus), pas vers ce div. Si le curseur n'est pas dans ce
          // div, on revient à la position juste après le '/' (slashRange) pour
          // éviter de créer un Range cross-éléments qui détruirait le DOM.
          deleteRange.setStart(slashRange.startContainer, slashRange.startOffset - 1)
          const sel = window.getSelection()
          if (sel?.rangeCount && el.contains(sel.getRangeAt(0).startContainer)) {
            const cur = sel.getRangeAt(0)
            console.log('[InlineEditor] clearSlash: cursor is inside el, deleting up to cursor')
            deleteRange.setEnd(cur.startContainer, cur.startOffset)
          } else {
            console.log('[InlineEditor] clearSlash: cursor is OUTSIDE el (popup input has focus), deleting only "/"')
            deleteRange.setEnd(slashRange.startContainer, slashRange.startOffset)
          }
          deleteRange.deleteContents()
        } catch (err) {
          console.error('[InlineEditor] clearSlash deleteContents error:', err)
        }
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

  // Bascule le formatage <u> sur la sélection
  const toggleUnderline = useCallback(() => {
    const sel = window.getSelection()
    const el = divRef.current
    if (!sel?.rangeCount || !el) return
    const range = sel.getRangeAt(0)
    if (range.collapsed) return
    // Désencapsuler si déjà dans <u>
    let node: Node | null = range.commonAncestorContainer
    while (node && node !== el) {
      if ((node as Element).tagName?.toLowerCase() === 'u') {
        const frag = document.createDocumentFragment()
        while ((node as Element).firstChild) frag.appendChild((node as Element).firstChild!)
        node.parentNode?.replaceChild(frag, node)
        syncEmpty(el); savedRef.current = false
        return
      }
      node = node.parentNode
    }
    // Encapsuler dans <u> en préservant la mise en forme intérieure
    try {
      const frag = range.extractContents()
      const u = document.createElement('u')
      u.appendChild(frag)
      range.insertNode(u)
      const after = document.createRange()
      after.setStartAfter(u)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)
    } catch { /* ignore */ }
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

  // Vérifie si le curseur est à la toute fin du contenu
  const isAtEnd = (): boolean => {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return false
    const range = sel.getRangeAt(0)
    if (!range.collapsed) return false
    const el = divRef.current
    if (!el) return false
    try {
      const testRange = document.createRange()
      testRange.setStart(range.endContainer, range.endOffset)
      testRange.setEnd(el, el.childNodes.length)
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {    // CTRL+Z / CTRL+Y / CTRL+SHIFT+Z → déléguer à BlockEditor (empêcher l'undo natif du navigateur)
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || e.key === 'Z')) {
      e.preventDefault()
      // Ne pas stopPropagation — l'événement doit remonter jusqu'au conteneur BlockEditor
      return
    }
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

    // Commande slash — ouvre le menu seulement si le bloc est vide
    // Pour déclencher en milieu de texte : utiliser Ctrl+Espace
    if (e.key === '/' && onSlashCommand) {
      const el = divRef.current
      if (el) {
        const isEmpty = !el.textContent?.trim()
        if (isEmpty) {
          setTimeout(() => {
            const sel = window.getSelection()
            if (!sel?.rangeCount) return
            const range = sel.getRangeAt(0)
            slashRangeRef.current = range.cloneRange()
            onSlashCommand()
          }, 0)
        }
      }
    }

    // Ctrl+Espace — ouvre la palette de commande sans insérer de "/"
    if ((e.ctrlKey || e.metaKey) && e.key === ' ' && onSlashCommand) {
      e.preventDefault()
      // Pas de slashRange : clearSlash() sera un no-op à la sélection/annulation
      slashRangeRef.current = null
      onSlashCommand()
    }

    // Enter → scinde le bloc au curseur (milieu) ou crée un nouveau bloc (fin/début)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const el = divRef.current
      const blockIsEmpty = !el?.textContent?.trim()
      // $$ seul ou $$formule$$ → convertit en bloc LaTeX
      if (el && onConvert) {
        const text = el.textContent?.trim() ?? ''
        const isClosedMath = text.startsWith('$$') && text.endsWith('$$') && text.length > 4
        const isOpenMath = text === '$$'
        if (isClosedMath || isOpenMath) {
          const formula = isClosedMath ? text.slice(2, -2).trim() : ''
          el.textContent = ''
          onConvert('math-value:' + formula, [])
          return
        }
      }
      if (!blockIsEmpty && isAtStart() && onEnterAtStart) {
        save()
        onEnterAtStart()
        return
      }
      // Tenter de scinder si curseur au milieu du bloc
      if (onSplit && el && !blockIsEmpty) {
        const sel = window.getSelection()
        if (sel?.rangeCount) {
          try {
            const cursor = sel.getRangeAt(0)
            const afterRange = document.createRange()
            afterRange.setStart(cursor.endContainer, cursor.endOffset)
            afterRange.setEnd(el, el.childNodes.length)
            const extracted = afterRange.extractContents()
            const tmp = document.createElement('div')
            tmp.appendChild(extracted)
            if (tmp.textContent?.trim()) {
              const afterNodes = domToInlines(tmp)
              syncEmpty(el)
              savedRef.current = false
              save()
              onSplit(afterNodes)
              return
            }
            // Contenu après vide (fin du bloc) → laisser tomber et créer bloc après
          } catch { /* fall through */ }
        }
      }
      save()
      onEnterAtEnd?.()
      return
    }

    // Shift+Enter → saut de ligne doux dans le bloc
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      const sel = window.getSelection()
      const el = divRef.current
      if (!sel?.rangeCount || !el) return
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const br = document.createElement('br')
      range.insertNode(br)
      const after = document.createRange()
      after.setStartAfter(br)
      after.collapse(true)
      sel.removeAllRanges()
      sel.addRange(after)
      syncEmpty(el)
      savedRef.current = false
      return
    }

    // Backspace au début → supprime le bloc s'il est vide, ou dé-formate un titre
    if (e.key === 'Backspace' && isAtStart() && onBackspaceAtStart) {
      const el = divRef.current
      if (el && !el.textContent?.trim()) {
        // Bloc vide → supprimer le bloc
        e.preventDefault()
        save()
        onBackspaceAtStart()
        return
      }
      if (el && onConvert && blockType?.startsWith('heading-')) {
        // Titre non-vide en position 0 → convertir en paragraphe (comme Notion)
        e.preventDefault()
        onConvert('paragraph', domToInlines(el))
        return
      }
      // Autre bloc non-vide → laisser le navigateur gérer
      return
    }

    // Delete en fin de bloc → fusionner avec le bloc suivant
    if (e.key === 'Delete' && isAtEnd() && onDeleteAtEnd) {
      e.preventDefault()
      save()
      onDeleteAtEnd()
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
      if (e.key === 'u') { e.preventDefault(); toggleUnderline();                        return }
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
        data-always-placeholder={alwaysShowPlaceholder || undefined}
        onCopy={(e) => {
          const el = divRef.current
          const sel = window.getSelection()
          if (!el || !sel || sel.isCollapsed || !sel.rangeCount) return

          const range = sel.getRangeAt(0)
          if (!el.contains(range.commonAncestorContainer)) return

          const tmp = document.createElement('div')
          tmp.appendChild(range.cloneContents())

          const plainText = range.toString()
          const html = tmp.innerHTML
          const markdown = inlinesToMarkdown(domToInlines(tmp))

          e.preventDefault()
          e.clipboardData.setData('text/plain', plainText)
          e.clipboardData.setData('text/html', html)
          e.clipboardData.setData('text/markdown', markdown)
          e.clipboardData.setData('text/x-markdown', markdown)
          void writeClipboardPayload({ plainText, html, markdown })
        }}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          if (!text) return

          // Normalise les fins de ligne (Windows CRLF → LF)
          const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

          // Smart paste — contenu multi-blocs → déléguer au BlockEditor
          // Déclenché dès qu'il y a une séquence multi-paragraphe (\n\n) OU
          // des indicateurs de blocs markdown en début de ligne (heading, liste, blockquote, code fence)
          const isBlockMarkdown = normalized.includes('\n\n')
            || /(?:^|\n)(?:[#>][ \t]|[-*+][ \t]|\d+\.[ \t]|```|---$)/.test(normalized)
          if (onSmartPaste && isBlockMarkdown) {
            const el = divRef.current
            const sel = window.getSelection()
            if (el && sel?.rangeCount) {
              try {
                const cursor = sel.getRangeAt(0)
                const beforeRange = document.createRange()
                beforeRange.setStart(el, 0)
                beforeRange.setEnd(cursor.startContainer, cursor.startOffset)
                const beforeTmp = document.createElement('div')
                beforeTmp.appendChild(beforeRange.cloneContents())
                const beforeNodes = domToInlines(beforeTmp)

                const afterRange = document.createRange()
                afterRange.setStart(cursor.endContainer, cursor.endOffset)
                afterRange.setEnd(el, el.childNodes.length)
                const afterTmp = document.createElement('div')
                afterTmp.appendChild(afterRange.cloneContents())
                const afterNodes = domToInlines(afterTmp)

                onSmartPaste(beforeNodes, afterNodes, normalized)
                return
              } catch { /* fall through */ }
            }
          }

          // Paste simple — insérer le texte normalisé à la position du curseur
          const sel = window.getSelection()
          if (sel?.rangeCount) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(document.createTextNode(normalized))
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
            syncEmpty(divRef.current!)
            savedRef.current = false
          }
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
          onUnderline={toggleUnderline}
          onLink={(url) => document.execCommand('createLink', false, url)}
          onUnlink={()  => document.execCommand('unlink')}
        />
      )}
    </>
  )
})
