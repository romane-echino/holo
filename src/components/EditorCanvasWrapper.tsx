import React, { useMemo } from 'react'
import { EditorCanvas } from './EditorCanvas'
import { useEditor } from '../contexts/EditorContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useUI } from '../contexts/UIContext'
import { useConfig } from '../contexts/ConfigContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { splitMarkdownFrontMatter, getEditableMarkdownHeader } from '../lib/markdown'
import type { EditableMarkdownHeader } from '../types/editor'
import type { EditorDocumentHeaderProps } from './EditorDocumentHeader'

type EditorCanvasWrapperProps = {
  isCompactLayout: boolean
  formatReadonlyDate: (value?: string | null) => string
  updateEditableHeader: (field: keyof EditableMarkdownHeader, value: string) => void
  updateTags: (tags: string[]) => void
  onRawChange: (value: string) => void
  onRawKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>
  onRawDrop: React.DragEventHandler<HTMLTextAreaElement>
  onEditorDragEnter: React.DragEventHandler<HTMLElement>
  onEditorDragOver: React.DragEventHandler<HTMLElement>
  onEditorDragLeave: React.DragEventHandler<HTMLElement>
  onWysiwygInput: React.FormEventHandler<HTMLDivElement>
  onWysiwygKeyDown: React.KeyboardEventHandler<HTMLDivElement>
  onWysiwygDrop: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragStart: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragEnd: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragOver: React.DragEventHandler<HTMLDivElement>
  openEditorLink: (href: string) => Promise<void>
  updateActiveTabBody: (nextBody: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
  markdownToHtml: (markdown: string) => string
  refreshTableSummaries: () => void
  onPullNow: () => void
}

export const EditorCanvasWrapper: React.FC<EditorCanvasWrapperProps> = ({
  isCompactLayout,
  formatReadonlyDate,
  updateEditableHeader,
  updateTags,
  onRawChange,
  onRawKeyDown,
  onRawDrop,
  onEditorDragEnter,
  onEditorDragOver,
  onEditorDragLeave,
  onWysiwygInput,
  onWysiwygKeyDown,
  onWysiwygDrop,
  onWysiwygDragStart,
  onWysiwygDragEnd,
  onWysiwygDragOver,
  openEditorLink,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
  markdownToHtml,
  refreshTableSummaries,
  onPullNow,
}) => {
  const { activeTab, activeTabPath, editorMode, readOnlyMode, isImageDragOverEditor } = useEditor()
  const { pathStatsByPath } = useWorkspace()
  const { showTagInput, setShowTagInput, tagInput, setTagInput } = useUI()
  const { remoteEditBlock } = useConfig()
  const {
    rawEditorRef, wysiwygEditorRef, codeBlockLeaveTimerRef,
    setHoveredCodeBlock, setColumnTypePopup, showEmojiPicker, setShowEmojiPicker, titleInputRef,
  } = useEditorOverlay()

  const effectiveEditorMode = readOnlyMode ? 'wysiwyg' : editorMode
  const isEditorReadOnly = readOnlyMode || remoteEditBlock.isBlocked

  const activeTabBody = useMemo(
    () => splitMarkdownFrontMatter(activeTab?.content ?? '').body,
    [activeTab?.content],
  )

  const editableHeader = useMemo(
    () => getEditableMarkdownHeader(activeTab?.content ?? ''),
    [activeTab?.content],
  )

  const activePathStats = activeTabPath ? pathStatsByPath[activeTabPath] ?? null : null

  const documentHeaderProps: EditorDocumentHeaderProps = {
    isCompactLayout,
    editableHeader,
    isEditorReadOnly,
    showEmojiPicker,
    setShowEmojiPicker,
    titleInputRef,
    activePathStats,
    formatReadonlyDate,
    updateEditableHeader,
    updateTags,
    showTagInput,
    setShowTagInput,
    tagInput,
    setTagInput,
  }

  return (
    <EditorCanvas
      isCompactLayout={isCompactLayout}
      effectiveEditorMode={effectiveEditorMode}
      isEditorReadOnly={isEditorReadOnly}
      activeTabBody={activeTabBody}
      rawEditorRef={rawEditorRef}
      wysiwygEditorRef={wysiwygEditorRef}
      onRawChange={onRawChange}
      onRawKeyDown={onRawKeyDown}
      onRawDrop={onRawDrop}
      onEditorDragEnter={onEditorDragEnter}
      onEditorDragOver={onEditorDragOver}
      onEditorDragLeave={onEditorDragLeave}
      onWysiwygInput={onWysiwygInput}
      onWysiwygKeyDown={onWysiwygKeyDown}
      onWysiwygDrop={onWysiwygDrop}
      onWysiwygDragStart={onWysiwygDragStart}
      onWysiwygDragEnd={onWysiwygDragEnd}
      onWysiwygDragOver={onWysiwygDragOver}
      openEditorLink={openEditorLink}
      updateActiveTabBody={updateActiveTabBody}
      syncWysiwygFromMarkdown={syncWysiwygFromMarkdown}
      markdownToHtml={markdownToHtml}
      refreshTableSummaries={refreshTableSummaries}
      setColumnTypePopup={setColumnTypePopup}
      isImageDragOverEditor={isImageDragOverEditor}
      remoteEditBlock={remoteEditBlock}
      onPullNow={onPullNow}
      codeBlockLeaveTimerRef={codeBlockLeaveTimerRef}
      setHoveredCodeBlock={setHoveredCodeBlock}
      documentHeaderProps={documentHeaderProps}
    />
  )
}
