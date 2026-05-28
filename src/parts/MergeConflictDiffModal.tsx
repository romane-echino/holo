/**
 * MergeConflictDiffModal.tsx
 *
 * Modal affichée quand le fichier ouvert contient des marqueurs de conflit git.
 * Parse les blocs <<<<< / ======= / >>>>> et affiche notre version vs la leur.
 * Propose "Garder notre version", "Prendre leur version" ou "Résoudre manuellement".
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitMerge, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { cn } from '../utils/global'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConflictBlock {
  before: string    // lignes avant le conflit (contexte)
  ours: string      // notre version (HEAD)
  theirs: string    // leur version
  after: string     // lignes après (contexte)
}

interface ParsedConflicts {
  blocks: ConflictBlock[]
  hasConflicts: boolean
}

// ─── Parser de marqueurs de conflits ─────────────────────────────────────────

function parseConflicts(content: string): ParsedConflicts {
  const lines = content.split('\n')
  const blocks: ConflictBlock[] = []

  let i = 0
  let contextBefore: string[] = []

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('<<<<<<<')) {
      // Début d'un bloc conflictuel
      const ours: string[] = []
      const theirs: string[] = []
      let section: 'ours' | 'separator' | 'theirs' = 'ours'
      i++

      while (i < lines.length) {
        if (lines[i].startsWith('=======')) {
          section = 'theirs'
          i++
          continue
        }
        if (lines[i].startsWith('>>>>>>>')) {
          i++
          break
        }
        if (section === 'ours') ours.push(lines[i])
        else theirs.push(lines[i])
        i++
      }

      // Contexte après : on peek jusqu'au prochain conflit ou fin
      const afterLines: string[] = []
      let j = i
      while (j < lines.length && !lines[j].startsWith('<<<<<<<') && afterLines.length < 4) {
        afterLines.push(lines[j])
        j++
      }

      blocks.push({
        before: contextBefore.slice(-4).join('\n'),
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
        after: afterLines.join('\n'),
      })
      contextBefore = []
    } else {
      contextBefore.push(line)
      i++
    }
  }

  return { blocks, hasConflicts: blocks.length > 0 }
}

// ─── Composant ────────────────────────────────────────────────────────────────

export interface MergeConflictDiffModalProps {
  filePath: string
  onResolve: (strategy: 'ours' | 'theirs') => Promise<void>
  onDismiss: () => void
}

export function MergeConflictDiffModal({ filePath, onResolve, onDismiss }: MergeConflictDiffModalProps) {
  const [parsed, setParsed] = useState<ParsedConflicts | null>(null)
  const [activeBlock, setActiveBlock] = useState(0)
  const [resolving, setResolving] = useState<'ours' | 'theirs' | null>(null)

  const fileName = filePath.replace(/\\/g, '/').split('/').at(-1) ?? filePath

  useEffect(() => {
    window.holo?.readFile(filePath)
      .then((content) => setParsed(parseConflicts(content)))
      .catch(() => setParsed({ blocks: [], hasConflicts: false }))
  }, [filePath])

  const block = parsed?.blocks[activeBlock]
  const total = parsed?.blocks.length ?? 0

  async function handleResolve(strategy: 'ours' | 'theirs') {
    setResolving(strategy)
    try {
      await onResolve(strategy)
      onDismiss()
    } finally {
      setResolving(null)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/62 backdrop-blur-xl" onClick={onDismiss} />

      <div className="relative z-10 flex w-full max-w-3xl flex-col overflow-hidden rounded-[1.4rem] border border-holo-border-soft bg-holo-bg/95 shadow-[0_30px_110px_rgba(0,0,0,.58),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-holo-border-soft px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-holo-lg bg-amber-500/10 text-amber-400">
            <GitMerge size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-holo-text">Conflit de fusion</p>
            <p className="truncate font-mono text-[11px] text-holo-text-faint">{fileName}</p>
          </div>
          {total > 1 && (
            <div className="flex items-center gap-1.5 text-xs text-holo-text-faint">
              <button
                onClick={() => setActiveBlock((n) => Math.max(0, n - 1))}
                disabled={activeBlock === 0}
                className="rounded p-0.5 hover:bg-holo-glass disabled:opacity-30"
              >
                <ChevronLeft size={14} />
              </button>
              <span>{activeBlock + 1} / {total}</span>
              <button
                onClick={() => setActiveBlock((n) => Math.min(total - 1, n + 1))}
                disabled={activeBlock === total - 1}
                className="rounded p-0.5 hover:bg-holo-glass disabled:opacity-30"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <button onClick={onDismiss} className="rounded-holo-md p-1.5 text-holo-text-faint hover:bg-holo-glass hover:text-holo-text">
            <X size={15} />
          </button>
        </div>

        {/* Contenu */}
        {!parsed ? (
          <div className="flex items-center justify-center py-12 text-sm text-holo-text-faint">Chargement…</div>
        ) : !parsed.hasConflicts ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-holo-text-faint">
            <AlertTriangle size={16} className="text-amber-400" />
            Aucun marqueur de conflit détecté dans ce fichier.
          </div>
        ) : block ? (
          <div className="overflow-auto">
            {/* Contexte avant */}
            {block.before.trim() && (
              <pre className="border-b border-holo-border-soft/40 bg-holo-glass/10 px-4 py-2 font-mono text-[11px] text-holo-text-faint">{block.before}</pre>
            )}

            {/* Diff deux colonnes */}
            <div className="grid grid-cols-2 divide-x divide-holo-border-soft">
              {/* NOTRE VERSION */}
              <div>
                <div className="flex items-center gap-2 border-b border-holo-border-soft bg-emerald-500/5 px-4 py-2">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-400">HEAD</span>
                  <span className="text-xs font-medium text-emerald-400">Notre version</span>
                </div>
                <pre className={cn('min-h-[80px] whitespace-pre-wrap px-4 py-3 font-mono text-[12px] text-holo-text', !block.ours.trim() && 'text-holo-text-faint italic')}>{block.ours.trim() || '(vide)'}</pre>
              </div>

              {/* LEUR VERSION */}
              <div>
                <div className="flex items-center gap-2 border-b border-holo-border-soft bg-sky-500/5 px-4 py-2">
                  <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-400">THEIRS</span>
                  <span className="text-xs font-medium text-sky-400">Leur version</span>
                </div>
                <pre className={cn('min-h-[80px] whitespace-pre-wrap px-4 py-3 font-mono text-[12px] text-holo-text', !block.theirs.trim() && 'text-holo-text-faint italic')}>{block.theirs.trim() || '(vide)'}</pre>
              </div>
            </div>

            {/* Contexte après */}
            {block.after.trim() && (
              <pre className="border-t border-holo-border-soft/40 bg-holo-glass/10 px-4 py-2 font-mono text-[11px] text-holo-text-faint">{block.after}</pre>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-holo-border-soft px-5 py-4">
          <p className="text-[11px] text-holo-text-faint">
            Cette action résoudra <strong className="text-holo-text">tous les conflits</strong> du fichier avec la stratégie choisie.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onDismiss}
              className="rounded-holo-lg border border-holo-border-soft bg-transparent px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass"
            >
              Résoudre manuellement
            </button>
            <button
              onClick={() => handleResolve('ours')}
              disabled={!!resolving}
              className="rounded-holo-lg border border-emerald-600/40 bg-emerald-900/20 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-800/30 disabled:opacity-50"
            >
              {resolving === 'ours' ? '…' : 'Garder notre version'}
            </button>
            <button
              onClick={() => handleResolve('theirs')}
              disabled={!!resolving}
              className="rounded-holo-lg border border-sky-600/40 bg-sky-900/20 px-3 py-2 text-sm font-medium text-sky-300 transition hover:bg-sky-800/30 disabled:opacity-50"
            >
              {resolving === 'theirs' ? '…' : 'Prendre leur version'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
