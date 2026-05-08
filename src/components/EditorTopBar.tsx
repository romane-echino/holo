import React from 'react'

type TocItem = {
  level: number
  text: string
  headingIndex: number
}

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
  onToggleCompactToc: () => void
  onCompactTocItemClick: (headingIndex: number) => void
  onSwitchRaw: () => void
  onSwitchWysiwyg: () => void
  onExportPdf: () => void
  onCopyLink: () => void
  onSave: () => void
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
  onToggleCompactToc,
  onCompactTocItemClick,
  onSwitchRaw,
  onSwitchWysiwyg,
  onExportPdf,
  onCopyLink,
  onSave,
}) => {
  return (
    <div className={`flex shrink-0 items-center border-b border-white/5 ${isCompactLayout ? 'flex-wrap gap-2 px-3 py-2' : 'justify-between px-6 py-2'}`}>
      <span className={`text-[10px] text-white/25 ${isCompactLayout ? 'w-full' : ''}`}>
        {activeTabIsDirty ? '● non sauvegardé' : ''}
      </span>
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
                  {tocItems.map((item) => (
                    <button
                      key={`compact-${item.headingIndex}-${item.text}`}
                      className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-white/60 transition-colors hover:bg-white/8 hover:text-white/95"
                      style={{ paddingLeft: `${Math.min((item.level - 1) * 10 + 8, 36)}px` }}
                      onClick={() => onCompactTocItemClick(item.headingIndex)}
                      title={item.text}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </div>
        )}
        <button
          className="rounded border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-white"
          onClick={onExportPdf}
          title="Exporter le fichier actif en PDF"
        >
          <i className="fa-solid fa-file-pdf mr-1" />Exporter en PDF
        </button>
        <button
          className="rounded border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/85 hover:bg-white/10 hover:text-white"
          onClick={onCopyLink}
          title="Copier le lien holo:// du fichier"
        >
          <i className="fa-solid fa-link mr-1" />Copier le lien
        </button>
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
