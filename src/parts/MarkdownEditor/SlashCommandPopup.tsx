/**
 * SlashCommandPopup.tsx — Menu de commandes déclenché par "/"
 *
 * Filtrage en temps réel : les caractères tapés après "/" alimentent
 * un champ de recherche interne qui filtre la liste de commandes.
 * Backspace réduit la query ; Backspace sur query vide ferme le popup.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

export interface SlashCommand {
  id: string
  label: string
  description: string
  icon: string
  blockType: string
  keywords: string[]
}

const COMMANDS: SlashCommand[] = [
  { id: 'paragraph',    label: 'Paragraphe',      description: 'Texte simple',             icon: '¶',  blockType: 'paragraph',    keywords: ['para', 'texte', 'text'] },
  { id: 'heading-1',   label: 'Titre 1',         description: 'Grand titre de section',   icon: 'H1', blockType: 'heading-1',    keywords: ['h1', 'titre', 'grand', 'heading'] },
  { id: 'heading-2',   label: 'Titre 2',         description: 'Titre de sous-section',    icon: 'H2', blockType: 'heading-2',    keywords: ['h2', 'titre', 'sous', 'heading'] },
  { id: 'heading-3',   label: 'Titre 3',         description: 'Petit titre',              icon: 'H3', blockType: 'heading-3',    keywords: ['h3', 'titre', 'petit', 'heading'] },
  { id: 'heading-4',   label: 'Titre 4',         description: 'Titre de niveau 4',        icon: 'H4', blockType: 'heading-4',    keywords: ['h4', 'titre', 'heading'] },
  { id: 'list-bullet',  label: 'Liste à puces',   description: 'Liste non ordonnée',       icon: '•',  blockType: 'list-bullet',  keywords: ['bullet', 'ul', 'puce', 'liste', 'unordered'] },
  { id: 'list-ordered', label: 'Liste numérotée', description: 'Liste ordonnée',           icon: '1.', blockType: 'list-ordered', keywords: ['numbered', 'ol', 'numero', 'liste', 'ordered'] },
  { id: 'checklist',    label: 'Checklist',       description: 'Liste de tâches à cocher',  icon: '☑',  blockType: 'checklist',    keywords: ['todo', 'task', 'tâche', 'checkbox', 'check', 'cocher'] },
  { id: 'table',        label: 'Tableau',         description: 'Tableau avec colonnes',    icon: '⊞',  blockType: 'table',        keywords: ['grid', 'grille', 'colonnes', 'rows'] },
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
  anchorRect: DOMRect
  onSelect: (blockType: string) => void
  onClose: () => void
}

export function SlashCommandPopup({ anchorRect, onSelect, onClose }: SlashCommandPopupProps) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const popupRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(
    () => (query ? COMMANDS.filter((cmd) => matchesQuery(cmd, query)) : COMMANDS),
    [query],
  )

  // Remettre l'index à 0 quand le filtre change
  useEffect(() => { setActiveIdx(0) }, [query])

  // Clamp l'index si la liste filtrée est plus courte
  const safeIdx = Math.min(activeIdx, Math.max(0, filtered.length - 1))

  const top  = anchorRect.bottom + 8
  const left = anchorRect.left

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (i + 1) % Math.max(1, filtered.length))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (i - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (filtered[safeIdx]) onSelect(filtered[safeIdx].blockType)
      } else if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'Backspace') {
        if (query.length > 0) {
          // Réduire la query (le backspace supprime aussi le char dans le bloc)
          setQuery((q) => q.slice(0, -1))
        } else {
          // Query vide + Backspace → fermer (le '/' sera supprimé par le bloc)
          onClose()
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Caractère tapé → ajouter à la query de filtrage
        setQuery((q) => q + e.key)
      }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => document.removeEventListener('keydown', handleKey, true)
  }, [filtered, safeIdx, query, onSelect, onClose])

  // Fermer si scroll
  useEffect(() => {
    const handleScroll = () => onClose()
    window.addEventListener('scroll', handleScroll, true)
    return () => window.removeEventListener('scroll', handleScroll, true)
  }, [onClose])

  // Clic en dehors → fermer
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  return (
    <div
      ref={popupRef}
      style={{ top, left }}
      className="fixed z-50 min-w-[240px] overflow-hidden rounded-holo-lg border border-holo-border-soft bg-holo-bg-elevated shadow-holo-md"
    >
      {/* En-tête avec query visible */}
      <div className="flex items-center gap-2 border-b border-holo-border-soft px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
          Blocs
        </span>
        {query && (
          <span className="ml-auto rounded px-1.5 py-0.5 font-mono text-[11px] text-holo-primary-soft">
            /{query}
          </span>
        )}
      </div>

      {/* Liste filtrée */}
      {filtered.length > 0 ? (
        filtered.map((cmd, i) => (
          <button
            key={cmd.id}
            onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.blockType) }}
            onMouseEnter={() => setActiveIdx(i)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
              i === safeIdx
                ? 'bg-holo-primary-surface text-holo-text'
                : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text'
            }`}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-holo-sm border border-holo-border-soft bg-holo-glass font-mono text-[11px] font-semibold text-holo-primary-soft">
              {cmd.icon}
            </span>
            <span className="min-w-0">
              <div className="text-sm font-medium leading-tight">{cmd.label}</div>
              <div className="text-[11px] text-holo-text-faint">{cmd.description}</div>
            </span>
          </button>
        ))
      ) : (
        <div className="px-3 py-4 text-center text-sm text-holo-text-faint">
          Aucun résultat pour «{query}»
        </div>
      )}
    </div>
  )
}
