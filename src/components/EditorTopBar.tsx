import React, { useState } from 'react'
import { FileDown, Link, MoreHorizontal, LayoutTemplate } from 'lucide-react'
import { ContextMenu } from './ContextMenu'
import type { ContextMenuAction } from './ContextMenu'

type TocItem = {
  level: number
  text: string
  headingIndex: number
}

export type BreadcrumbSegment = { label: string; path: string; isDir: boolean }

type EditorTopBarProps = {
  isCompactLayout: boolean
  activeTabIsDirty: boolean
  readOnlyMode: boolean
  effectiveEditorMode: 'raw' | 'wysiwyg'
  saveStatus: 'idle' | 'saving' | 'synced' | 'local'
  copyLinkStatus: 'idle' | 'copied'
  tocItems: TocItem[]
  showCompactToc: boolean
  compactTocRef: React.RefObject<HTMLDivElement | null>
  breadcrumbSegments?: BreadcrumbSegment[]
  onBreadcrumbClick?: (path: string) => void
  onToggleCompactToc: () => void
  onCompactTocItemClick: (headingIndex: number) => void
  onSwitchRaw: () => void
  onSwitchWysiwyg: () => void
  onExportPdf: () => void
  onCopyLink: () => void
  onSave: () => void
  isTemplate?: boolean
  onToggleTemplate?: () => void
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  isCompactLayout,
  activeTabIsDirty,
  readOnlyMode,
  effectiveEditorMode,
  saveStatus,
  copyLinkStatus,
  tocItems,
  showCompactToc,
  compactTocRef,
  breadcrumbSegments,
  onBreadcrumbClick,
  onToggleCompactToc,
  onCompactTocItemClick,
  onSwitchRaw,
  onSwitchWysiwyg,
  onExportPdf,
  onCopyLink,
  onSave,
  isTemplate,
  onToggleTemplate,
}) => {
  const [moreMenuAnchor, setMoreMenuAnchor] = useState<HTMLElement | null>(null)

  const moreItems: ContextMenuAction[] = [
    { type: 'item', label: 'Exporter en PDF', icon: FileDown, onClick: onExportPdf },
    { type: 'item', label: 'Copier le lien', icon: Link, onClick: onCopyLink },
  ]

  return (
    <div className={`flex shrink-0 items-center border-b border-white/5 ${isCompactLayout ? 'flex-wrap gap-2 px-3 py-2' : 'justify-between px-6 py-2'}`}>
      {/* Breadcrumb */}
      <div className={`flex min-w-0 items-center gap-0.5 ${isCompactLayout ? 'w-full' : 'flex-1 overflow-hidden'}`}>
        {breadcrumbSegments && breadcrumbSegments.length > 0 ? (
          breadcrumbSegments.map((seg, i) => (
            <React.Fragment key={seg.path}>
              {i > 0 && <span className="mx-0.5 shrink-0 text-[10px] text-white/15">/</span>}
              {i < breadcrumbSegments.length - 1 ? (
                <button
                  className="max-w-[130px] truncate rounded px-1 py-0.5 text-[11px] text-white/30 transition-colors hover:bg-white/5 hover:text-white/60"
                  onClick={() => onBreadcrumbClick?.(seg.path)}
                  title={seg.path}
                >
                  {seg.label}
                </button>
              ) : (
                <span className="max-w-[200px] truncate px-1 py-0.5 text-[11px] text-white/55" title={seg.path}>
                  {seg.label}
                </span>
              )}
            </React.Fragment>
          ))
        ) : (
          <span className={`text-[10px] text-white/25 ${isCompactLayout ? 'w-full' : ''}`}>
            {activeTabIsDirty ? '\u25cf non sauvegard\u00e9' : ''}
          </span>
        )}
        {breadcrumbSegments && breadcrumbSegments.length > 0 && activeTabIsDirty && (
          <span className="ml-1 shrink-0 text-[10px] text-amber-400/70" title="Non sauvegard\u00e9">\u25cf</span>
        )}
      </div>
      <div className={`flex items-center gap-2 ${isCompactLayout ? 'w-full flex-wrap' : ''}`}>
        {readOnlyMode && (
          <span className="rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
            Lecture seule
          </span>
        )}
        <div className="flex items-center rounded border border-white/10 bg-[#1f2021] p-0.5">
          <button
            className={`rounded px-2 py-1 text-[10px] font-medium ${effectiveEditorMode === 'raw' ? 'bg-[#7B61FF] text-white' : 'text-white/70 hover:text-white'} ${readOnlyMode ? 'cursor-not-allowed opacity-40' : ''}`}
            onClick={onSwitchRaw}
            disabled={readOnlyMode}
            title="Mode RAW"
          >
            RAW
          </button>
          <button
            className={`rounded px-2 py-1 text-[10px] font-medium ${effectiveEditorMode === 'wysiwyg' ? 'bg-[#7B61FF] text-white' : 'text-white/70 hover:text-white'}`}
            onClick={onSwitchWysiwyg}
            title="Mode WYSIWYG"
          >
            WYSIWYG
          </button>
        </div>
        {saveStatus === 'synced' && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
            <i className="fa-solid fa-cloud-arrow-up" />
            Synchronisé
          </span>
        )}
        {saveStatus === 'local' && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400">
            <i className="fa-solid fa-floppy-disk" />
            Sauvegardé
          </span>
        )}
        {copyLinkStatus === 'copied' && (
          <span className="flex items-center gap-1 text-[10px] text-sky-400">
            <i className="fa-solid fa-link" />
            Lien copié
          </span>
        )}
        {isCompactLayout && tocItems.length > 0 && (
          <div ref={compactTocRef} className="relative">
            <button
              className="rounded border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-white"
              onClick={onToggleCompactToc}
              title="Afficher la table des matières"
            >
              <i className="fa-solid fa-list-ul mr-1" />Plan
            </button>
            {showCompactToc && (
              <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(280px,calc(100vw-24px))] rounded-xl border border-white/10 bg-[#1a1b1c] p-2 shadow-2xl backdrop-blur-sm">
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                  Table des matières
                </p>
                <nav className="max-h-72 space-y-0.5 overflow-y-auto">
                  {(() => {
                    const counters: Record<number, number> = {}
                    const numbers = tocItems.map(item => {
                      counters[item.level] = (counters[item.level] ?? 0) + 1
                      Object.keys(counters).forEach(k => { if (Number(k) > item.level) delete counters[Number(k)] })
                      const min = Math.min(...Object.keys(counters).map(Number))
                      const parts: number[] = []
                      for (let l = min; l <= item.level; l++) parts.push(counters[l] ?? 0)
                      return parts.join('.')
                    })
                    return tocItems.map((item, i) => (
                      <button
                        key={`compact-${item.headingIndex}-${item.text}`}
                        className="flex w-full items-baseline gap-1.5 rounded px-2 py-1 text-left text-[11px] text-white/60 transition-colors hover:bg-white/8 hover:text-white/95"
                        style={{ paddingLeft: `${Math.min((item.level - 1) * 10 + 8, 36)}px` }}
                        onClick={() => onCompactTocItemClick(item.headingIndex)}
                        title={item.text}
                      >
                        <span className="shrink-0 font-mono text-white/40">{numbers[i]}</span>
                        <span className="truncate">{item.text}</span>
                      </button>
                    ))
                  })()}
                </nav>
              </div>
            )}
          </div>
        )}
        <button
          className="flex size-7 items-center justify-center rounded border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 hover:text-white"
          onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
          title="Plus d'options"
          aria-label="Plus d'options"
        >
          <MoreHorizontal size={14} />
        </button>
        {onToggleTemplate && (
          <button
            className={`flex size-7 items-center justify-center rounded border transition ${
              isTemplate
                ? 'border-violet-400/50 bg-violet-500/20 text-violet-300 hover:bg-violet-500/30'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
            onClick={onToggleTemplate}
            title={isTemplate ? 'Retirer du modèle' : 'Établir comme modèle'}
            aria-label={isTemplate ? 'Retirer du modèle' : 'Établir comme modèle'}
          >
            <LayoutTemplate size={14} />
          </button>
        )}
        {moreMenuAnchor && (
          <ContextMenu
            anchorEl={moreMenuAnchor}
            anchorAlign="right"
            items={moreItems}
            onClose={() => setMoreMenuAnchor(null)}
          />
        )}
        <button
          className="rounded bg-[#7B61FF] px-3 py-1 text-xs font-medium text-white hover:bg-[#6D4FD8] disabled:opacity-50"
          onClick={onSave}
          disabled={readOnlyMode || !activeTabIsDirty || saveStatus === 'saving'}
          title="Sauvegarder (Ctrl+S)"
        >
          {saveStatus === 'saving' ? (
            <><i className="fa-solid fa-spinner fa-spin mr-1" />Sync…</>
          ) : (
            <><i className="fa-solid fa-floppy-disk mr-1" />Sauvegarder</>
          )}
        </button>
      </div>
    </div>
  )
}
