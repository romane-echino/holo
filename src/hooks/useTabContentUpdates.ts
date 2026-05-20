import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { updateMarkdownHeaderField, updateTagsInMarkdown } from '../lib/markdown'
import type { EditableMarkdownHeader } from '../types/editor'

type OpenTab = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseTabContentUpdatesParams = {
  activeTab: OpenTab | null
  isEditorReadOnly: boolean
  setActiveTab: Dispatch<SetStateAction<OpenTab | null>>
}

export function useTabContentUpdates({
  activeTab,
  isEditorReadOnly,
  setActiveTab,
}: UseTabContentUpdatesParams) {
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
