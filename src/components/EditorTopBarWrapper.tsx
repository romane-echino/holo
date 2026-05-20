import React from 'react'
import { EditorTopBar } from './EditorTopBar'
import { useEditor } from '../contexts/EditorContext'
import { useUI } from '../contexts/UIContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import type { TocItem } from '../hooks/useTocItems'

type EditorTopBarWrapperProps = {
  isCompactLayout: boolean
  tocItems: TocItem[]
  onToggleCompactToc: () => void
  onCompactTocItemClick: (headingIndex: number) => void
  onSwitchRaw: () => void
  onSwitchWysiwyg: () => void
  onExportPdf: () => void
  onCopyLink: () => void
  onSave: () => void
}

export const EditorTopBarWrapper: React.FC<EditorTopBarWrapperProps> = ({
  isCompactLayout,
  tocItems,
  onToggleCompactToc,
  onCompactTocItemClick,
  onSwitchRaw,
  onSwitchWysiwyg,
  onExportPdf,
  onCopyLink,
  onSave,
}) => {
  const { activeTab, readOnlyMode, editorMode } = useEditor()
  const { saveStatus, copyLinkStatus } = useUI()
  const { showCompactToc, compactTocRef } = useEditorOverlay()
  const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode

  return (
    <EditorTopBar
      isCompactLayout={isCompactLayout}
      activeTabIsDirty={activeTab?.isDirty ?? false}
      readOnlyMode={readOnlyMode}
      effectiveEditorMode={effectiveEditorMode}
      saveStatus={saveStatus}
      copyLinkStatus={copyLinkStatus}
      tocItems={tocItems}
      showCompactToc={showCompactToc}
      compactTocRef={compactTocRef}
      onToggleCompactToc={onToggleCompactToc}
      onCompactTocItemClick={onCompactTocItemClick}
      onSwitchRaw={onSwitchRaw}
      onSwitchWysiwyg={onSwitchWysiwyg}
      onExportPdf={onExportPdf}
      onCopyLink={onCopyLink}
      onSave={onSave}
    />
  )
}
