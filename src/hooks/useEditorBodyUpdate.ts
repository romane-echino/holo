import { useCallback } from 'react'
import { updateMarkdownBody } from '../lib/markdown'

interface ActiveTab {
  path: string
  name: string
  content: string
  isDirty: boolean
}

interface UseEditorBodyUpdateParams {
  activeTab: ActiveTab | null
  updateActiveTabContent: (content: string) => void
}

export function useEditorBodyUpdate({
  activeTab,
  updateActiveTabContent,
}: UseEditorBodyUpdateParams) {
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
