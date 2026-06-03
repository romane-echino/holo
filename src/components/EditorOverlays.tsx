import React from 'react'
import { TableControlsOverlay } from './table/TableControlsOverlay'
import { COLUMN_TYPES, TYPE_EMOJIS } from './table/tableEngine'
import type { EditorMode, SlashCommand, WysiwygCommand } from '../types/editor'

type EditorOverlaysProps = {
  editorMode: EditorMode
  selectionPopup: { x: number; y: number } | null
  runWysiwygCommand: (command: WysiwygCommand, value?: string) => void
  onOpenLinkFromSelection: () => void
  hasAiProviderConfigured: boolean
  onOpenAiTransformFromSelection: () => void
  tablePopup: { x: number; y: number } | null
  columnTypePopup: { x: number; y: number; thEl: HTMLElement } | null
  insertTableRow: () => void
  insertTableColumn: () => void
  sortTableByCurrentColumn: (direction: 'asc' | 'desc') => void
  openCurrentColumnTypePicker: () => void
  deleteTableRow: () => void
  deleteTableColumn: () => void
  setCurrentColumnType: (type: string) => void
  onCloseColumnTypePopup: () => void
  hoveredCodeBlock: { x: number; y: number; codeEl: HTMLElement } | null
  codeBlockPopup: { x: number; y: number; codeEl: HTMLElement } | null
  codeBlockLeaveTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>
  setHoveredCodeBlock: React.Dispatch<React.SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
  setCodeBlockPopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
  formatCodeBlock: (codeEl: HTMLElement) => Promise<void>
  onApplyCodeLanguage: (lang: string, codeEl: HTMLElement) => void
  slashMenu: { x: number; y: number; query: string } | null
  slashMenuListRef: React.RefObject<HTMLDivElement | null>
  slashMenuIndex: number
  slashCommands: SlashCommand[]
  matchesSlashQuery: (cmd: SlashCommand, query: string) => boolean
  executeSlashCommand: (command: SlashCommand) => void
}

export const EditorOverlays: React.FC<EditorOverlaysProps> = ({
  editorMode,
  selectionPopup,
  runWysiwygCommand,
  onOpenLinkFromSelection,
  hasAiProviderConfigured,
  onOpenAiTransformFromSelection,
  tablePopup,
  columnTypePopup,
  insertTableRow,
  insertTableColumn,
  sortTableByCurrentColumn,
  openCurrentColumnTypePicker,
  deleteTableRow,
  deleteTableColumn,
  setCurrentColumnType,
  onCloseColumnTypePopup,
  hoveredCodeBlock,
  codeBlockPopup,
  codeBlockLeaveTimerRef,
  setHoveredCodeBlock,
  setCodeBlockPopup,
  formatCodeBlock,
  onApplyCodeLanguage,
  slashMenu,
  slashMenuListRef,
  slashMenuIndex,
  slashCommands,
  matchesSlashQuery,
  executeSlashCommand,
}) => {
  return (
    <>
      {selectionPopup && editorMode === 'wysiwyg' && (
        <div
          className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-white/15 bg-[#18191a] shadow-2xl px-1 py-1"
          style={{ left: selectionPopup.x, top: selectionPopup.y, transform: 'translate(-50%, -100%)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="rounded px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('bold')} title="Gras">B</button>
          <button className="rounded px-2 py-1 text-xs italic text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('italic')} title="Italique">I</button>
          <button className="rounded px-2 py-1 text-xs underline text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('underline')} title="Souligné">U</button>
          <button className="rounded px-2 py-1 text-xs line-through text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('strikeThrough')} title="Barré">S</button>
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button className="rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('formatBlock', '<h1>')} title="H1">H1</button>
          <button className="rounded px-2 py-1 text-xs text-white/80 hover:bg-white/10" onClick={() => runWysiwygCommand('formatBlock', '<h2>')} title="H2">H2</button>
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button
            className="rounded px-2 py-1 text-xs text-[#9d8bff] hover:bg-[#7B61FF]/20"
            onClick={onOpenLinkFromSelection}
            title="Lien"
          >
            <i className="fa-solid fa-link text-[10px]" />
          </button>
          {hasAiProviderConfigured && (
            <>
              <div className="w-px h-4 bg-white/15 mx-0.5" />
              <button
                className="rounded px-2 py-1 text-xs text-[#9d8bff] hover:bg-[#7B61FF]/20"
                onMouseDown={(e) => { e.preventDefault() }}
                onClick={onOpenAiTransformFromSelection}
                title="Transformer avec l'IA"
              >
                <i className="fa-solid fa-wand-magic-sparkles text-[10px]" />
              </button>
            </>
          )}
        </div>
      )}

      <TableControlsOverlay
        editorMode={editorMode}
        tablePopup={tablePopup}
        columnTypePopup={columnTypePopup}
        columnTypes={COLUMN_TYPES}
        typeEmojis={TYPE_EMOJIS}
        onInsertTableRow={insertTableRow}
        onInsertTableColumn={insertTableColumn}
        onSortAsc={() => sortTableByCurrentColumn('asc')}
        onSortDesc={() => sortTableByCurrentColumn('desc')}
        onOpenCurrentColumnTypePicker={openCurrentColumnTypePicker}
        onDeleteTableRow={deleteTableRow}
        onDeleteTableColumn={deleteTableColumn}
        onSetCurrentColumnType={setCurrentColumnType}
        onCloseColumnTypePopup={onCloseColumnTypePopup}
      />

      {hoveredCodeBlock && editorMode === 'wysiwyg' && !codeBlockPopup && (
        <div
          className="code-block-popup fixed z-50 flex items-center gap-1"
          style={{ left: hoveredCodeBlock.x, top: hoveredCodeBlock.y, transform: 'translate(-100%, 8px)' }}
          onMouseEnter={() => {
            if (codeBlockLeaveTimerRef.current) {
              clearTimeout(codeBlockLeaveTimerRef.current)
              codeBlockLeaveTimerRef.current = null
            }
          }}
          onMouseLeave={() => {
            codeBlockLeaveTimerRef.current = setTimeout(() => setHoveredCodeBlock(null), 200)
          }}
        >
          <button
            className="font-mono text-[10px] text-white/30 hover:text-white/70 transition-colors px-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const text = (hoveredCodeBlock.codeEl.textContent ?? '').replace(/\u200B/g, '').trim()
              void window.holo?.writeClipboardText?.(text)
            }}
            title="Copier"
          >
            <i className="fa-regular fa-copy text-[9px]" />
          </button>
          <button
            className="font-mono text-[10px] text-white/30 hover:text-white/70 transition-colors px-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              void formatCodeBlock(hoveredCodeBlock.codeEl)
            }}
            title="Formater le code"
          >
            <i className="fa-solid fa-wand-magic-sparkles text-[9px]" />
          </button>
          <button
            className="font-mono text-[10px] text-[#7B61FF]/70 hover:text-[#9d8bff] transition-colors px-1"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              const rect = hoveredCodeBlock.codeEl.closest('pre')?.getBoundingClientRect()
              if (rect) {
                setCodeBlockPopup({ x: rect.left, y: rect.bottom, codeEl: hoveredCodeBlock.codeEl })
              }
            }}
          >
            {(() => {
              const lang = Array.from(hoveredCodeBlock.codeEl.classList)
                .find((c) => c.startsWith('language-'))
                ?.replace('language-', '') ?? 'plaintext'
              return lang === 'plaintext' ? 'texte ▾' : `${lang} ▾`
            })()}
          </button>
        </div>
      )}

      {codeBlockPopup && editorMode === 'wysiwyg' && (() => {
        const LANGUAGES = ['plaintext', 'javascript', 'typescript', 'python', 'sql', 'bash', 'html', 'css', 'json', 'markdown', 'rust', 'java', 'go', 'csharp', 'cpp']
        const activeLang = Array.from(codeBlockPopup.codeEl.classList)
          .find((c) => c.startsWith('language-'))
          ?.replace('language-', '') ?? 'plaintext'
        return (
          <div
            className="code-block-popup fixed z-[100] flex flex-wrap gap-1 rounded-lg border border-white/25 bg-[#111] px-2 py-2 shadow-2xl ring-1 ring-[#7B61FF]/20"
            style={{ left: codeBlockPopup.x, top: codeBlockPopup.y, transform: 'translate(0, 4px)', maxWidth: 320 }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                className={`rounded px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  activeLang === lang
                    ? 'bg-[#7B61FF] text-white'
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => onApplyCodeLanguage(lang, codeBlockPopup.codeEl)}
              >
                {lang}
              </button>
            ))}
          </div>
        )
      })()}

      {slashMenu && editorMode === 'wysiwyg' && (() => {
        const filtered = slashCommands.filter((c) => (!c.requiresApiKey || hasAiProviderConfigured) && matchesSlashQuery(c, slashMenu.query))
        return filtered.length > 0 ? (
          <div
            className="fixed z-50 min-w-[200px] rounded-lg border border-white/15 bg-[#18191a] shadow-2xl p-1"
            style={{ left: slashMenu.x, top: slashMenu.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {slashMenu.query === '' && (
              <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/35">Insérer un bloc</p>
            )}
            <div ref={slashMenuListRef} className="max-h-[102px] overflow-y-auto pr-0.5">
              {filtered.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  data-slash-index={idx}
                  className={`flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-xs ${idx === slashMenuIndex ? 'bg-[#7B61FF]/25 text-white' : 'text-white/70 hover:bg-white/8 hover:text-white'}`}
                  onClick={() => executeSlashCommand(cmd)}
                >
                  <span className="w-5 text-center text-[11px] text-[#9d8bff]">
                    <i className={cmd.icon} />
                  </span>
                  <span className="flex-1 font-medium">{cmd.label}</span>
                  <span className="text-[10px] text-white/30">{cmd.hint}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null
      })()}
    </>
  )
}
