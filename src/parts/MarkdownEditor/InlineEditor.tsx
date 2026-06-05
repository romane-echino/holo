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
import { useWorkspace } from '../../contexts/WorkspaceContext'

interface MentionSuggestion {
  mention: string
  displayName: string
  email: string
  commitCount: number
}

interface RepoContributor {
  commitCount: number
  authorName: string
  authorEmail: string
}

interface MentionPopupState {
  rect: DOMRect
  query: string
  start: number
  end: number
  activeIndex: number
  suggestions: MentionSuggestion[]
}

const mentionCache = new Map<string, MentionSuggestion[]>()
const mentionPromiseCache = new Map<string, Promise<MentionSuggestion[]>>()

function slugifyMentionCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function extractGithubLikeHandle(email: string): string | null {
  const githubNoreply = email.match(/\+([^@]+)@users\.noreply\.github\.com$/i)
  if (githubNoreply?.[1]) return slugifyMentionCandidate(githubNoreply[1])

  const localPart = email.split('@')[0] ?? ''
  const normalized = slugifyMentionCandidate(localPart.replace(/^\d+\+/, ''))
  return normalized || null
}

function buildMentionSuggestions(contributors: RepoContributor[]): MentionSuggestion[] {
  const seen = new Set<string>()
  const suggestions: MentionSuggestion[] = []

  contributors
    .slice()
    .sort((left, right) => right.commitCount - left.commitCount || left.authorName.localeCompare(right.authorName))
    .forEach((contributor) => {
      const candidates = [
        extractGithubLikeHandle(contributor.authorEmail),
        slugifyMentionCandidate(contributor.authorName),
      ].filter(Boolean) as string[]

      const mention = candidates.find((candidate) => !seen.has(candidate))
      if (!mention) return

      seen.add(mention)
      suggestions.push({
        mention,
        displayName: contributor.authorName || mention,
        email: contributor.authorEmail,
        commitCount: contributor.commitCount,
      })
    })

  return suggestions
}

async function loadMentionSuggestions(rootPath: string): Promise<MentionSuggestion[]> {
  const cached = mentionCache.get(rootPath)
  if (cached) return cached

  const pending = mentionPromiseCache.get(rootPath)
  if (pending) return pending

  const request = window.holo?.gitGetContributors()
    .then((contributors) => {
      const suggestions = buildMentionSuggestions(contributors ?? [])
      mentionCache.set(rootPath, suggestions)
      mentionPromiseCache.delete(rootPath)
      return suggestions
    })
    .catch(() => {
      mentionPromiseCache.delete(rootPath)
      return []
    }) ?? Promise.resolve([])

  mentionPromiseCache.set(rootPath, request)
  return request
}

function getTextOffsetPosition(root: HTMLElement, offset: number): { container: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, offset)
  let lastTextNode: Text | null = null

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text
    lastTextNode = textNode
    if (remaining <= textNode.data.length) {
      return { container: textNode, offset: remaining }
    }
    remaining -= textNode.data.length
  }

  if (lastTextNode) {
    return { container: lastTextNode, offset: lastTextNode.data.length }
  }

  return { container: root, offset: root.childNodes.length }
}

function getTextOffsetWithin(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(container, offset)
  return range.toString().length
}

function getMentionQueryAtCaret(root: HTMLElement, range: Range): Omit<MentionPopupState, 'activeIndex' | 'suggestions'> | null {
  if (!range.collapsed) return null

  const caretOffset = getTextOffsetWithin(root, range.startContainer, range.startOffset)
  const textBefore = root.textContent?.slice(0, caretOffset) ?? ''
  const match = textBefore.match(/(?:^|\s)@([a-z0-9._-]*)$/i)
  if (!match) return null

  const query = match[1] ?? ''
  const start = caretOffset - query.length - 1
  const end = caretOffset
  const rect = range.getBoundingClientRect()
  const fallbackRect = root.getBoundingClientRect()

  return {
    query,
    start,
    end,
    rect: rect.width || rect.height ? rect : fallbackRect,
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

function isMarkdownTable(text: string): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) return false

  const header = lines[0]
  const separator = lines[1]
  return /\|/.test(header)
    && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(separator)
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
  /** Force la remontée immédiate du contenu courant vers le parent */
  flush: () => void
  /** Retourne le contenu courant du DOM sans attendre un blur/save. */
  getContent: () => InlineNode[]
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
  /** Crée une note de bas de page depuis la sélection courante et retourne son identifiant. */
  onCreateFootnote?: (selectedText: string) => string | null
  /** Au focus/clic, sélectionne tout le contenu du bloc. Utile pour les cellules de tableau. */
  selectAllOnFocus?: boolean
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
  onCreateFootnote,
  selectAllOnFocus,
  className,
}, ref) {
  const { rootPath } = useWorkspace()
  const divRef = useRef<HTMLDivElement>(null)
  const savedRef = useRef(false)
  const slashRangeRef = useRef<Range | null>(null)
  const selectionRangeRef = useRef<Range | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // État de la toolbar de formatage inline
  const [toolbar, setToolbar] = useState<FormatToolbarState | null>(null)
  const [repoMentions, setRepoMentions] = useState<MentionSuggestion[]>([])
  const [mentionPopup, setMentionPopup] = useState<MentionPopupState | null>(null)

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
    range.setStart(el, el.childNodes.length)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const save = useCallback(() => {
    if (savedRef.current) return
    const el = divRef.current
    // Ne pas sauvegarder si l'élément a été retiré du DOM (ex : conversion de type)
    if (!el || !document.contains(el)) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    savedRef.current = true
    onSave(domToInlines(el))
  }, [onSave])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      save()
    }, 400)
  }, [save])

  useEffect(() => {
    if (!rootPath || !window.holo?.gitGetContributors) {
      setRepoMentions([])
      return
    }

    let cancelled = false
    void loadMentionSuggestions(rootPath).then((suggestions) => {
      if (!cancelled) {
        setRepoMentions(suggestions)
      }
    })

    return () => {
      cancelled = true
    }
  }, [rootPath])

  const refreshMentionPopup = useCallback(() => {
    const el = divRef.current
    const sel = window.getSelection()
    if (!el || !sel?.rangeCount || repoMentions.length === 0) {
      setMentionPopup(null)
      return
    }

    const range = sel.getRangeAt(0)
    if (!el.contains(range.commonAncestorContainer)) {
      setMentionPopup(null)
      return
    }

    const mention = getMentionQueryAtCaret(el, range)
    if (!mention) {
      setMentionPopup(null)
      return
    }

    const needle = mention.query.trim().toLowerCase()
    const suggestions = repoMentions.filter((candidate) => {
      if (!needle) return true
      return candidate.mention.includes(needle)
        || candidate.displayName.toLowerCase().includes(needle)
        || candidate.email.toLowerCase().includes(needle)
    }).slice(0, 6)

    if (suggestions.length === 0) {
      setMentionPopup(null)
      return
    }

    setMentionPopup((previous) => ({
      ...mention,
      suggestions,
      activeIndex: previous && previous.query === mention.query
        ? Math.min(previous.activeIndex, suggestions.length - 1)
        : 0,
    }))
  }, [repoMentions])

  const insertMention = useCallback((suggestion: MentionSuggestion) => {
    const el = divRef.current
    const popup = mentionPopup
    const sel = window.getSelection()
    if (!el || !popup || !sel) return

    const mentionRange = document.createRange()
    const startPos = getTextOffsetPosition(el, popup.start)
    const endPos = getTextOffsetPosition(el, popup.end)
    mentionRange.setStart(startPos.container, startPos.offset)
    mentionRange.setEnd(endPos.container, endPos.offset)
    mentionRange.deleteContents()

    const textNode = document.createTextNode(`@${suggestion.mention} `)
    mentionRange.insertNode(textNode)

    const after = document.createRange()
    after.setStart(textNode, textNode.data.length)
    after.collapse(true)
    sel.removeAllRanges()
    sel.addRange(after)

    syncEmpty(el)
    savedRef.current = false
    scheduleSave()
    setMentionPopup(null)
  }, [mentionPopup, scheduleSave, syncEmpty])

  // Toolbar : suit la sélection active dans ce bloc
  useEffect(() => {
    const handleSelectionChange = () => {
      // Conserver la toolbar si le focus est dedans (ex. input URL du lien)
      if (document.activeElement?.closest('[data-format-toolbar]')) return
      const sel = window.getSelection()
      const el = divRef.current
      if (!sel || sel.isCollapsed || !sel.rangeCount || !el) {
        selectionRangeRef.current = null
        setToolbar(null)
        if (sel?.rangeCount && el) {
          refreshMentionPopup()
        } else {
          setMentionPopup(null)
        }
        return
      }
      const range = sel.getRangeAt(0)
      if (!el.contains(range.commonAncestorContainer)) {
        selectionRangeRef.current = null
        setToolbar(null)
        setMentionPopup(null)
        return
      }
      selectionRangeRef.current = range.cloneRange()
      setMentionPopup(null)
      const rect = range.getBoundingClientRect()
      if (!rect.width && !rect.height) { setToolbar(null); return }
      setToolbar({
        rect,
        bold:   document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        strike: document.queryCommandState('strikeThrough'),
        code:   isInsideTag(range, el, 'code'),
        underline: isInsideTag(range, el, 'u'),
        superscript: isInsideTag(range, el, 'sup'),
        subscript: isInsideTag(range, el, 'sub'),
        link:   getLinkHref(range, el),
      })
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [refreshMentionPopup])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  const selectAllContents = useCallback((el: HTMLElement) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
  }, [])

  // Handle impératif : appelé par BlockEditor pour la navigation inter-blocs
  useImperativeHandle(ref, () => ({
    focus(cursor?: InitialCursor) {
      const el = divRef.current
      if (!el) return
      el.focus({ preventScroll: true })
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
    flush() {
      save()
    },
    getContent() {
      const el = divRef.current
      return el ? domToInlines(el) : []
    },
  }), [save, syncEmpty])

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
        syncEmpty(el); savedRef.current = false
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
    } catch { /* ignore */ }
    syncEmpty(el); savedRef.current = false
  }, [syncEmpty])

  const toggleSuperscript = useCallback(() => toggleInlineTag('sup'), [toggleInlineTag])
  const toggleSubscript = useCallback(() => toggleInlineTag('sub'), [toggleInlineTag])

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

    syncEmpty(el)
    savedRef.current = false
    save()
  }, [onCreateFootnote, save, syncEmpty])

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mentionPopup) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionPopup((previous) => previous ? { ...previous, activeIndex: (previous.activeIndex + 1) % previous.suggestions.length } : previous)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionPopup((previous) => previous ? { ...previous, activeIndex: (previous.activeIndex - 1 + previous.suggestions.length) % previous.suggestions.length } : previous)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && mentionPopup.suggestions[mentionPopup.activeIndex]) {
        e.preventDefault()
        insertMention(mentionPopup.suggestions[mentionPopup.activeIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionPopup(null)
        return
      }
    }

    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || e.key === 'Z')) {
      e.preventDefault()
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
      const hadVisibleContent = domToInlines(el).length > 0
      const needsTrailingBreak = isAtEnd()
      const range = sel.getRangeAt(0)
      range.deleteContents()
      const br = document.createElement('br')
      range.insertNode(br)
      if (!hadVisibleContent || needsTrailingBreak) {
        const extraBr = document.createElement('br')
        br.parentNode?.insertBefore(extraBr, br.nextSibling)
        const after = document.createRange()
        after.setStartBefore(extraBr)
        after.collapse(true)
        sel.removeAllRanges()
        sel.addRange(after)
      } else {
        const after = document.createRange()
        after.setStartAfter(br)
        after.collapse(true)
        sel.removeAllRanges()
        sel.addRange(after)
      }
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
      if (e.key === '.') { e.preventDefault(); toggleSuperscript();                       return }
      if (e.key === ',') { e.preventDefault(); toggleSubscript();                         return }
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
        onFocus={(e) => {
          savedRef.current = false
          if (selectAllOnFocus) {
            requestAnimationFrame(() => selectAllContents(e.currentTarget))
          }
        }}
        onMouseDown={(e) => {
          if (!selectAllOnFocus || e.button !== 0) return
          e.preventDefault()
          e.currentTarget.focus({ preventScroll: true })
          requestAnimationFrame(() => selectAllContents(e.currentTarget))
        }}
        onClick={(e) => {
          if (!selectAllOnFocus) return
          selectAllContents(e.currentTarget)
        }}
        onBlur={() => {
          save()
          setMentionPopup(null)
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

          const html = tmp.innerHTML
          const markdown = inlinesToMarkdown(domToInlines(tmp))

          e.preventDefault()
          e.clipboardData.setData('text/plain', markdown)
          e.clipboardData.setData('text/html', html)
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
            || isMarkdownTable(normalized)
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
        onInput={(e) => {
          syncEmpty(e.currentTarget)
          savedRef.current = false
          scheduleSave()
          requestAnimationFrame(() => refreshMentionPopup())
        }}
        className={cn('outline-none', className)}
      />
      {mentionPopup && (
        <div
          data-testid="mention-popup"
          className="fixed z-50 w-[280px] overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg-elevated shadow-holo-md"
          style={{
            left: Math.min(mentionPopup.rect.left, window.innerWidth - 304),
            top: Math.min(mentionPopup.rect.bottom + 10, window.innerHeight - 240),
          }}
        >
          <div className="border-b border-holo-border-soft/60 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-holo-text-faint">
            Mentions du repo
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {mentionPopup.suggestions.map((suggestion, index) => (
              <button
                key={`${suggestion.mention}-${suggestion.email}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  insertMention(suggestion)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition',
                  index === mentionPopup.activeIndex ? 'bg-holo-primary/12 text-holo-text' : 'text-holo-text-faint hover:bg-white/[0.04] hover:text-holo-text',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-inherit">@{suggestion.mention}</span>
                  <span className="block truncate text-[11px] text-holo-text-faint">{suggestion.displayName}{suggestion.email ? ` · ${suggestion.email}` : ''}</span>
                </span>
                <span className="shrink-0 rounded-full border border-holo-border-soft px-2 py-0.5 text-[10px] text-holo-text-faint">
                  {suggestion.commitCount}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {toolbar && (
        <FormatToolbar
          state={toolbar}
          onBold={()   => document.execCommand('bold')}
          onItalic={()  => document.execCommand('italic')}
          onStrike={()  => document.execCommand('strikeThrough')}
          onCode={toggleCode}
          onUnderline={toggleUnderline}
          onSuperscript={toggleSuperscript}
          onSubscript={toggleSubscript}
          onFootnote={insertFootnoteReference}
          onLink={(url) => document.execCommand('createLink', false, url)}
          onUnlink={()  => document.execCommand('unlink')}
        />
      )}
    </>
  )
})
