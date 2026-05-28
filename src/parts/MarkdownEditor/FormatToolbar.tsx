/**
 * FormatToolbar.tsx — Barre de formatage inline flottante
 *
 * Apparaît au-dessus de la sélection de texte dans un InlineEditor.
 * - Bold / Italic / Barré / Code inline / Lien
 * - Toutes les actions utilisent onMouseDown + e.preventDefault() pour ne pas
 *   déplacer le focus hors du contentEditable.
 * - Attribut data-format-toolbar sur le conteneur racine : permet à InlineEditor
 *   de détecter que le focus reste « dans la toolbar » et de ne pas la masquer.
 */

import { useEffect, useRef, useState } from 'react'
import { Bold, Code2, Italic, Link2, Link2Off, Strikethrough, Underline } from 'lucide-react'
import { cn } from '../../utils/global'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormatToolbarState {
  rect: DOMRect
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  underline: boolean
  link: string | null
}

interface FormatToolbarProps {
  state: FormatToolbarState
  onBold: () => void
  onItalic: () => void
  onStrike: () => void
  onCode: () => void
  onUnderline: () => void
  onLink: (url: string) => void
  onUnlink: () => void
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function FormatToolbar({
  state,
  onBold, onItalic, onStrike, onCode, onUnderline, onLink, onUnlink,
}: FormatToolbarProps) {
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Range sauvegardée avant de passer en link mode (le focus quitte le contentEditable)
  const savedRangeRef = useRef<Range | null>(null)

  // Quand linkMode s'active, pré-remplir l'URL et focus l'input
  useEffect(() => {
    if (!linkMode) return
    setLinkUrl(state.link ?? '')
    // Après le rendu, focus programmatique (le mousedown a été prevented)
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [linkMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const enterLinkMode = (e: React.MouseEvent) => {
    e.preventDefault()
    // Sauvegarder la sélection avant que le focus parte vers l'input
    savedRangeRef.current = window.getSelection()?.getRangeAt(0)?.cloneRange() ?? null
    setLinkMode(true)
  }

  const applyLink = () => {
    // Restaurer la sélection dans le contentEditable avant d'appliquer le lien
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedRangeRef.current)
      }
    }
    savedRangeRef.current = null

    const url = linkUrl.trim()
    if (url) {
      onLink(url)
    } else {
      onUnlink()
    }
    setLinkMode(false)
  }

  const cancelLink = (e?: React.SyntheticEvent) => {
    e?.preventDefault()
    // Restaurer la sélection pour que la toolbar reste visible
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedRangeRef.current)
      }
    }
    savedRangeRef.current = null
    setLinkMode(false)
  }

  // Repositionnement quand la sélection change (rect mis à jour par InlineEditor)
  const { rect } = state
  const top = rect.top - 8
  const left = rect.left + rect.width / 2

  return (
    <div
      data-format-toolbar="true"
      style={{ top, left, transform: 'translate(-50%, -100%)' }}
      className="fixed z-50 flex items-center overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 shadow-[0_12px_48px_rgba(0,0,0,.38)] backdrop-blur-2xl"
    >
      {linkMode ? (
        /* ── Mode saisie de lien ── */
        <div className="flex items-center gap-1.5 px-2.5 py-1.5">
          <Link2 size={13} className="shrink-0 text-holo-text-faint" />
          <input
            ref={inputRef}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); applyLink() }
              if (e.key === 'Escape') { e.preventDefault(); cancelLink(e) }
            }}
            placeholder="https://…"
            className="w-52 bg-transparent text-sm text-holo-text outline-none placeholder:text-holo-text-faint"
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); applyLink() }}
            className="rounded-holo-md px-2 py-1 text-xs text-holo-primary-soft transition hover:bg-holo-primary-surface"
          >
            OK
          </button>
          <button
            onMouseDown={cancelLink}
            className="rounded-holo-md px-2 py-1 text-xs text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
          >
            ✕
          </button>
        </div>
      ) : (
        /* ── Boutons de formatage ── */
        <div className="flex items-center gap-0.5 px-1.5 py-1.5">
          <Btn
            active={state.bold}
            onMouseDown={(e) => { e.preventDefault(); onBold() }}
            label="Gras (Ctrl+B)"
          >
            <Bold size={14} strokeWidth={2.2} />
          </Btn>
          <Btn
            active={state.italic}
            onMouseDown={(e) => { e.preventDefault(); onItalic() }}
            label="Italique (Ctrl+I)"
          >
            <Italic size={14} />
          </Btn>
          <Btn
            active={state.strike}
            onMouseDown={(e) => { e.preventDefault(); onStrike() }}
            label="Barré (Ctrl+Shift+S)"
          >
            <Strikethrough size={14} />
          </Btn>
          <Btn
            active={state.code}
            onMouseDown={(e) => { e.preventDefault(); onCode() }}
            label="Code inline (Ctrl+E)"
          >
            <Code2 size={14} />
          </Btn>
          <Btn
            active={state.underline}
            onMouseDown={(e) => { e.preventDefault(); onUnderline() }}
            label="Souligné (Ctrl+U)"
          >
            <Underline size={14} />
          </Btn>

          <div className="mx-1 h-4 w-px shrink-0 bg-holo-border-soft" />

          {state.link !== null ? (
            <Btn
              active
              onMouseDown={(e) => { e.preventDefault(); onUnlink() }}
              label="Supprimer le lien"
            >
              <Link2Off size={14} />
            </Btn>
          ) : (
            <Btn
              active={false}
              onMouseDown={enterLinkMode}
              label="Ajouter un lien (Ctrl+K)"
            >
              <Link2 size={14} />
            </Btn>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Bouton interne ──────────────────────────────────────────────────────────

function Btn({
  active,
  onMouseDown,
  label,
  children,
}: {
  active: boolean
  onMouseDown: (e: React.MouseEvent<HTMLButtonElement>) => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={onMouseDown}
      title={label}
      aria-label={label}
      className={cn(
        'flex size-8 items-center justify-center rounded-holo-md transition',
        active
          ? 'bg-holo-primary-surface text-holo-primary-soft'
          : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
      )}
    >
      {children}
    </button>
  )
}
