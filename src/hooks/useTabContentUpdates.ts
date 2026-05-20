import { useCallback } from 'react'
import { updateMarkdownHeaderField, updateTagsInMarkdown } from '../lib/markdown'
import type { EditableMarkdownHeader } from '../types/editor'
import { useEditor } from '../contexts/EditorContext'
import { useConfig } from '../contexts/ConfigContext'

export function useTabContentUpdates() {
  const { activeTab, setActiveTab, readOnlyMode } = useEditor()
  const { remoteEditBlock } = useConfig()
  const isEditorReadOnly = readOnlyMode || remoteEditBlock.isBlocked
  const updateActiveTabContent = useCallback(
    (nextContent: string) => {
      if (isEditorReadOnly) {
        return
      }

      setActiveTab((prev) => (prev ? { ...prev, content: nextContent, isDirty: true } : prev))
    },
    [isEditorReadOnly, setActiveTab],
  )

  const updateEditableHeader = useCallback(
    (field: keyof EditableMarkdownHeader, value: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownHeaderField(activeTab.content, field, value)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  const updateTags = useCallback(
    (tags: string[]) => {
      if (!activeTab) return
      const nextMarkdown = updateTagsInMarkdown(activeTab.content, tags)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  return {
    updateActiveTabContent,
    updateEditableHeader,
    updateTags,
  }
}
