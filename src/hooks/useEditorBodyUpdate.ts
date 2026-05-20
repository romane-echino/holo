import { useCallback } from 'react'
import { updateMarkdownBody } from '../lib/markdown'
import { useEditor } from '../contexts/EditorContext'

export function useEditorBodyUpdate({
  updateActiveTabContent,
}: {
  updateActiveTabContent: (content: string) => void
}) {
  const { activeTab } = useEditor()
  const updateActiveTabBody = useCallback(
    (nextBody: string) => {
      if (!activeTab) {
        return
      }

      const nextMarkdown = updateMarkdownBody(activeTab.content, nextBody)
      updateActiveTabContent(nextMarkdown)
    },
    [activeTab, updateActiveTabContent],
  )

  return {
    updateActiveTabBody,
  }
}
