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

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bold, Code2, FileText, Italic, Link2, Link2Off, Quote, Strikethrough, Subscript, Superscript, Underline } from 'lucide-react'
import { cn } from '../../utils/global'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { useEditorFilePath } from './EditorFileContext'
import { flatTreeFiles, getRelativeLinkPath, getBaseName } from '../../lib/appUtils'
import type { SearchIndexEntry } from '../../types/app'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FormatToolbarState {
  rect: DOMRect
  bold: boolean
  italic: boolean
  strike: boolean
  code: boolean
  underline: boolean
  superscript: boolean
  subscript: boolean
  link: string | null
  footnote: string | null  // footnote identifier when cursor is on a footnote
}

interface FormatToolbarProps {
  state: FormatToolbarState
  onBold: () => void
  onItalic: () => void
  onStrike: () => void
  onCode: () => void
  onUnderline: () => void
  onSuperscript: () => void
  onSubscript: () => void
  onFootnote: () => void
  onLink: (url: string) => void
  onUnlink: () => void
  onUnlinkFootnote?: () => void
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function FormatToolbar({
  state,
  onBold, onItalic, onStrike, onCode, onUnderline, onSuperscript, onSubscript, onFootnote, onLink, onUnlink, onUnlinkFootnote = () => {},
}: FormatToolbarProps) {
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Range sauvegardée avant de passer en link mode (le focus quitte le contentEditable)
  const savedRangeRef = useRef<Range | null>(null)

  // Recherche de pages : d'abord l'espace courant, puis tous les espaces via l'index
  const { tree, rootPath, fileMetaByPath, recentFolders } = useWorkspace()
  const currentFilePath = useEditorFilePath()
  
  // Charger l'index pour les suggestions inter-espace
  const [indexEntries, setIndexEntries] = useState<Map<string, SearchIndexEntry>>(new Map())
  
  useEffect(() => {
    const loadAllSpaceFiles = async () => {
      const allFiles = new Map<string, SearchIndexEntry>()
      
      // Scanner tous les espaces récents pour trouver les fichiers .md
      if (recentFolders && recentFolders.length > 0) {
        for (const folder of recentFolders) {
          try {
            const mdFiles = await window.holo?.scanMdFiles(folder)
            if (Array.isArray(mdFiles)) {
              for (const filePath of mdFiles) {
                if (!allFiles.has(filePath)) {
                  // Créer une entrée minimale avec le path et spaceRoot
                  // Les métadonnées complètes (title, etc.) seront chargées au besoin
                  const stats = await window.holo?.getPathStats(filePath).catch(() => ({ modifiedAt: new Date().toISOString() }))
                  allFiles.set(filePath, {
                    path: filePath,
                    name: getBaseName(filePath),
                    title: '',
                    description: '',
                    tags: [],
                    headings: [],
                    content: '',
                    linkedPaths: [],
                    spaceRoot: folder,
                    mtime: stats?.modifiedAt ?? new Date().toISOString(),
                  })
                }
              }
            }
          } catch (err) {
            console.error(`[FormatToolbar] Error scanning space ${folder}:`, err)
          }
        }
      }

      setIndexEntries(allFiles)
    }

    loadAllSpaceFiles()
  }, [recentFolders])

  const allMdFiles = useMemo(() => {
    if (tree) return flatTreeFiles(tree).filter((p) => p.toLowerCase().endsWith('.md'))
    // Fallback : si le tree n'est pas encore chargé, utiliser les clés de fileMetaByPath
    return Object.keys(fileMetaByPath).filter((p) => p.toLowerCase().endsWith('.md'))
  }, [tree, fileMetaByPath])

  // Type pour une suggestion avec l'espace d'origine
  type FileSuggestion = { path: string; label: string; spaceName?: string; spaceRoot?: string }

  const pageSuggestions = useMemo((): FileSuggestion[] => {
    if (!linkMode) return []
    const q = linkUrl.trim().toLowerCase()
    // N'afficher les suggestions que si l'URL n'est pas déjà une URL externe
    if (q.startsWith('http://') || q.startsWith('https://') || q.startsWith('mailto:')) return []

    const results: FileSuggestion[] = []
    const seen = new Set<string>()

    // Phase 1: fichiers de l'espace courant (priorité haute)
    const currentSpaceFiles = allMdFiles.filter((p) => p !== currentFilePath)
    for (const filePath of currentSpaceFiles) {
      const baseName = getBaseName(filePath).replace(/\.md$/i, '')
      if (!q || baseName.toLowerCase().includes(q) || filePath.toLowerCase().includes(q)) {
        results.push({ path: filePath, label: baseName })
        seen.add(filePath)
        if (results.length >= 8) return results
      }
    }

    // Phase 2: fichiers d'autres espaces (via index de tous les espaces)
    if (indexEntries.size > 0 && results.length < 8) {
      const entries = Array.from(indexEntries.values())
        .filter((entry) => !seen.has(entry.path) && entry.path !== currentFilePath && entry.path.toLowerCase().endsWith('.md'))
        .filter((entry) => {
          const baseName = getBaseName(entry.path)
          const fileNameLower = baseName.toLowerCase()
          const titleLower = entry.title?.toLowerCase() ?? ''
          return !q || fileNameLower.includes(q) || titleLower.includes(q) || entry.path.toLowerCase().includes(q)
        })
        .slice(0, 8 - results.length)
        .map((entry) => ({
          path: entry.path,
          label: entry.title || getBaseName(entry.path).replace(/\.md$/i, ''),
          spaceName: entry.spaceRoot ? getBaseName(entry.spaceRoot) : undefined,
          spaceRoot: entry.spaceRoot,
        }))
      results.push(...entries)
    }

    return results.slice(0, 8)
  }, [linkMode, linkUrl, allMdFiles, currentFilePath, indexEntries, rootPath, recentFolders])

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

  const pickPageSuggestion = (suggestion: FileSuggestion) => {
    const relativePath = getRelativeLinkPath(currentFilePath, suggestion.path, rootPath ?? null)
    setLinkUrl(relativePath)
    setTimeout(() => inputRef.current?.focus(), 0)
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
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5">
            <Link2 size={13} className="shrink-0 text-holo-text-faint" />
            <input
              ref={inputRef}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (pageSuggestions.length === 1) {
                    const onlySuggestion = pageSuggestions[0]
                    const relativePath = getRelativeLinkPath(currentFilePath, onlySuggestion.path, rootPath ?? null)
                    if (linkUrl.trim() !== relativePath) {
                      pickPageSuggestion(onlySuggestion)
                      return
                    }
                  }
                  applyLink()
                }
                if (e.key === 'Escape') { e.preventDefault(); cancelLink(e) }
              }}
              placeholder="https://… ou nom de page"
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
          {pageSuggestions.length > 0 && (
            <div className="border-t border-holo-border-soft pb-1">
              {pageSuggestions.map((suggestion) => {
                const rel = getRelativeLinkPath(currentFilePath, suggestion.path, rootPath ?? null)
                const title = fileMetaByPath[suggestion.path]?.title?.trim()
                const secondaryLabel = title && title !== suggestion.label ? title : null
                return (
                  <button
                    key={suggestion.path}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickPageSuggestion(suggestion)
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-holo-glass-hover"
                  >
                    <FileText size={11} className="shrink-0 text-holo-text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-holo-text">{suggestion.label}</span>
                        {secondaryLabel && (
                          <span className="truncate text-[10px] text-holo-text-faint/80">{secondaryLabel}</span>
                        )}
                        {suggestion.spaceName && (
                          <span className="shrink-0 rounded-full bg-holo-primary/15 px-1.5 py-px text-[9px] font-medium text-holo-primary-soft">{suggestion.spaceName}</span>
                        )}
                      </div>
                      <div className="truncate text-[10px] text-holo-text-faint">{rel}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
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
            active={false}
            onMouseDown={(e) => { e.preventDefault(); onFootnote() }}
            label="Créer une note de bas de page"
          >
            <Quote size={14} />
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
          <Btn
            active={state.superscript}
            onMouseDown={(e) => { e.preventDefault(); onSuperscript() }}
            label="Exposant (Ctrl+.)"
          >
            <Superscript size={14} />
          </Btn>
          <Btn
            active={state.subscript}
            onMouseDown={(e) => { e.preventDefault(); onSubscript() }}
            label="Indice (Ctrl+,)"
          >
            <Subscript size={14} />
          </Btn>

          <div className="mx-1 h-4 w-px shrink-0 bg-holo-border-soft" />

          {state.link !== null ? (
            <Btn
              active
              onMouseDown={(e) => { e.preventDefault(); onUnlink() }}
              label="Supprimer le lien (Ctrl+Shift+K)"
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

          {state.footnote !== null && (
            <Btn
              active
              onMouseDown={(e) => { e.preventDefault(); onUnlinkFootnote() }}
              label="Supprimer la note"
            >
              <Link2Off size={14} />
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
