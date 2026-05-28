/**
 * SlashCommandPopup.tsx — Palette de commandes centrée
 *
 * Déclenchée par "/" ou Ctrl+Espace.
 * Rendu en overlay centré avec backdrop blur, input de recherche autofocusé.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: string
  blockType: string
  keywords: string[]
}

const COMMANDS: SlashCommand[] = [
  { id: 'paragraph',    label: 'Paragraphe',      description: 'Texte simple',              icon: '¶',  blockType: 'paragraph',    keywords: ['para', 'texte', 'text'] },
  { id: 'heading-1',   label: 'Titre 1',         description: 'Grand titre de section',    icon: 'H1', blockType: 'heading-1',    keywords: ['h1', 'titre', 'grand', 'heading'] },
  { id: 'heading-2',   label: 'Titre 2',         description: 'Titre de sous-section',     icon: 'H2', blockType: 'heading-2',    keywords: ['h2', 'titre', 'sous', 'heading'] },
  { id: 'heading-3',   label: 'Titre 3',         description: 'Petit titre',               icon: 'H3', blockType: 'heading-3',    keywords: ['h3', 'titre', 'petit', 'heading'] },
  { id: 'heading-4',   label: 'Titre 4',         description: 'Titre de niveau 4',         icon: 'H4', blockType: 'heading-4',    keywords: ['h4', 'titre', 'heading'] },
  { id: 'list-bullet',  label: 'Liste à puces',       description: 'Liste non ordonnée',        icon: '•',  blockType: 'list-bullet',  keywords: ['bullet', 'ul', 'puce', 'liste', 'unordered'] },
  { id: 'list-ordered', label: 'Liste numérotée',      description: 'Liste ordonnée 1. 2. 3.',   icon: '1.', blockType: 'list-ordered', keywords: ['numbered', 'ol', 'numero', 'liste', 'ordered'] },
  { id: 'list-alpha',   label: 'Liste alphabétique',   description: 'Liste ordonnée a. b. c.',   icon: 'a.', blockType: 'list-alpha',   keywords: ['alpha', 'alphabetique', 'lettre', 'abc', 'liste'] },
  { id: 'checklist',    label: 'Checklist',            description: 'Liste de tâches à cocher',  icon: '☑',  blockType: 'checklist',    keywords: ['todo', 'task', 'tâche', 'checkbox', 'check', 'cocher'] },
  { id: 'table',        label: 'Tableau',         description: 'Tableau avec colonnes',     icon: '⊞',  blockType: 'table',        keywords: ['grid', 'grille', 'colonnes', 'rows'] },
  { id: 'math',         label: 'LaTeX / Formule', description: 'Formule mathématique $$…$$', icon: '∑',  blockType: 'math',         keywords: ['latex', 'math', 'formule', 'equation', 'katex', 'tex'] },
  { id: 'blockquote',   label: 'Citation',         description: 'Bloc de citation (> …)',     icon: '❝',  blockType: 'blockquote',   keywords: ['quote', 'citation', 'blockquote', 'indent', 'remarque'] },
  { id: 'footnote',     label: 'Note de bas de page', description: 'Note référencée [^id]',   icon: '†',  blockType: 'footnote',     keywords: ['note', 'footnote', 'reference', 'bas', 'page'] },
  { id: 'separator',    label: 'Séparateur',       description: 'Ligne de séparation (---)',  icon: '—',  blockType: 'separator',    keywords: ['hr', 'separateur', 'divider', 'ligne', 'horizontal', 'rule'] },
]

function matchesQuery(cmd: SlashCommand, query: string): boolean {
  const q = query.toLowerCase()
  return (
    cmd.label.toLowerCase().includes(q) ||
    cmd.id.toLowerCase().includes(q) ||
    cmd.description.toLowerCase().includes(q) ||
    cmd.keywords.some((k) => k.includes(q))
  )
}

interface SlashCommandPopupProps {
  onSelect: (blockType: string) => void
  onClose: () => void
}

export function SlashCommandPopup({ onSelect, onClose }: SlashCommandPopupProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => (query ? COMMANDS.filter((cmd) => matchesQuery(cmd, query)) : COMMANDS),
    [query],
  )

  // Remettre l'index à 0 quand le filtre change
  useEffect(() => { setActiveIdx(0) }, [query])

  // Clamp l'index si la liste filtrée est plus courte
  const safeIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1))

  // Autofocus à l'ouverture
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  // Scroll l'item actif dans la vue
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLButtonElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [safeIdx])

  // Fermeture globale par Escape même si le focus n'est plus sur l'input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => (i + 1) % Math.max(1, filtered.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[safeIdx]) onSelect(filtered[safeIdx].blockType)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Palette */}
        <div data-testid="slash-popup" className="relative w-[480px] max-w-[90vw] overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg-elevated shadow-holo-md">
        {/* Champ de recherche */}
        <div className="flex items-center gap-3 border-b border-holo-border-soft px-4 py-3">
          <Search size={15} className="shrink-0 text-holo-text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Rechercher une commande…"
            className="flex-1 bg-transparent text-sm text-holo-text placeholder:text-holo-text-faint focus:outline-none"
          />
          <kbd className="rounded border border-holo-border-soft bg-holo-glass px-1.5 py-0.5 font-mono text-[10px] text-holo-text-faint">
            Esc
          </kbd>
        </div>

        {/* Liste filtrée */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1.5 holo-scrollbar">
          {filtered.length > 0 ? (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                data-active={i === safeIdx ? 'true' : undefined}
                onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.blockType) }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === safeIdx
                    ? 'bg-holo-primary-surface text-holo-text'
                    : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text'
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-holo-md border border-holo-border-soft bg-holo-glass font-mono text-[11px] font-semibold text-holo-primary-soft">
                  {cmd.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-tight">{cmd.label}</div>
                  <div className="text-[11px] text-holo-text-faint">{cmd.description}</div>
                </span>
                {i === safeIdx && (
                  <kbd className="rounded border border-holo-border-soft bg-holo-glass px-1.5 py-0.5 font-mono text-[10px] text-holo-text-faint">
                    ↵
                  </kbd>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-sm text-holo-text-faint">
              Aucun résultat pour «&nbsp;{query}&nbsp;»
            </div>
          )}
        </div>

        {/* Pied : raccourcis */}
        <div className="flex items-center gap-4 border-t border-holo-border-soft px-4 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-holo-text-faint">
            <kbd className="rounded border border-holo-border-soft bg-holo-glass px-1 font-mono text-[10px]">↑↓</kbd>
            Naviguer
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-holo-text-faint">
            <kbd className="rounded border border-holo-border-soft bg-holo-glass px-1 font-mono text-[10px]">↵</kbd>
            Insérer
          </span>
        </div>
      </div>
    </div>
  )
}
