import React from 'react'
import { EditorTopBar } from './EditorTopBar'
import type { BreadcrumbSegment } from './EditorTopBar'
import { useEditor } from '../contexts/EditorContext'
import { useUI } from '../contexts/UIContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import type { TocItem } from '../hooks/useTocItems'

function computeBreadcrumb(
  filePath: string | null,
  rootPath: string | null,
): BreadcrumbSegment[] {
  if (!filePath || !rootPath) return []
  const spaceName = rootPath.split('/').pop() || rootPath
  const segments: BreadcrumbSegment[] = [{ label: spaceName, path: rootPath, isDir: true }]
  if (!filePath.startsWith(rootPath + '/')) return segments
  const relative = filePath.slice(rootPath.length + 1)
  const parts = relative.split('/').filter(Boolean)
  let accumulated = rootPath
  for (let i = 0; i < parts.length; i++) {
    accumulated += '/' + parts[i]
    const isLast = i === parts.length - 1
    segments.push({
      label: isLast ? parts[i].replace(/\.md$/, '') : parts[i],
      path: accumulated,
      isDir: !isLast,
    })
  }
  return segments
}

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
  const { rootPath, setSelectedPath, setExpandedDirectories } = useWorkspace()
  const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode

  const breadcrumbSegments = computeBreadcrumb(activeTab?.path ?? null, rootPath)

  const handleBreadcrumbClick = (path: string) => {
    setSelectedPath(path)
    setExpandedDirectories((prev) => {
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }

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
      breadcrumbSegments={breadcrumbSegments}
      onBreadcrumbClick={handleBreadcrumbClick}
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
