import React from 'react'
import { EditorOverlays } from './EditorOverlays'
import { useEditor } from '../contexts/EditorContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { useConfig } from '../contexts/ConfigContext'
import { SLASH_COMMANDS, matchesSlashQuery } from '../lib/editorSlash'
import type { WysiwygCommand, SlashCommand } from '../types/editor'

type EditorOverlaysWrapperProps = {
  runWysiwygCommand: (command: WysiwygCommand, value?: string) => void
  onOpenLinkFromSelection: () => void
  onOpenAiTransformFromSelection: () => void
  insertTableRow: () => void
  insertTableColumn: () => void
  sortTableByCurrentColumn: (direction: 'asc' | 'desc') => void
  openCurrentColumnTypePicker: () => void
  deleteTableRow: () => void
  deleteTableColumn: () => void
  setCurrentColumnType: (type: string) => void
  onCloseColumnTypePopup: () => void
  formatCodeBlock: (codeEl: HTMLElement) => Promise<void>
  onApplyCodeLanguage: (lang: string, codeEl: HTMLElement) => void
  executeSlashCommand: (command: SlashCommand) => void
}

export const EditorOverlaysWrapper: React.FC<EditorOverlaysWrapperProps> = (props) => {
  const { editorMode } = useEditor()
  const { openaiApiKey, geminiApiKey } = useConfig()
  const hasAiProviderConfigured = openaiApiKey.trim().length > 0 || geminiApiKey.trim().length > 0
  const {
    selectionPopup, tablePopup, columnTypePopup, hoveredCodeBlock,
    codeBlockPopup, codeBlockLeaveTimerRef, setHoveredCodeBlock, setCodeBlockPopup,
    slashMenu, slashMenuListRef, slashMenuIndex,
  } = useEditorOverlay()

  return (
    <EditorOverlays
      editorMode={editorMode}
      selectionPopup={selectionPopup}
      tablePopup={tablePopup}
      columnTypePopup={columnTypePopup}
      hoveredCodeBlock={hoveredCodeBlock}
      codeBlockPopup={codeBlockPopup}
      codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
      setHoveredCodeBlock={setHoveredCodeBlock}
      setCodeBlockPopup={setCodeBlockPopup}
      slashMenu={slashMenu}
      slashMenuListRef={slashMenuListRef}
      slashMenuIndex={slashMenuIndex}
      slashCommands={SLASH_COMMANDS}
      matchesSlashQuery={matchesSlashQuery}
      hasAiProviderConfigured={hasAiProviderConfigured}
      {...props}
    />
  )
}
