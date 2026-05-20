import { useCallback, type RefObject } from 'react'
import { applyMarkdownListTabBehavior } from '../lib/appUtils'

interface UseRawEditorKeyDownParams {
  isEditorReadOnly: boolean
  rawEditorRef: RefObject<HTMLTextAreaElement | null>
  updateActiveTabBody: (nextBody: string) => void
}

export function useRawEditorKeyDown({
  isEditorReadOnly,
  rawEditorRef,
  updateActiveTabBody,
}: UseRawEditorKeyDownParams) {
  const onRawKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Tab' || isEditorReadOnly) {
        return
      }

      const target = event.currentTarget
      const result = applyMarkdownListTabBehavior(
        target.value,
        target.selectionStart ?? 0,
        target.selectionEnd ?? 0,
        event.shiftKey,
      )

      if (!result.handled) {
        return
      }

      event.preventDefault()

      if (result.nextText !== target.value) {
        updateActiveTabBody(result.nextText)
      }

      requestAnimationFrame(() => {
        const textarea = rawEditorRef.current
        if (!textarea) return
        textarea.focus()
        textarea.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd)
      })
    },
    [isEditorReadOnly, updateActiveTabBody, rawEditorRef],
  )

  return {
    onRawKeyDown,
  }
}
