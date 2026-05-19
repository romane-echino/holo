import { useCallback, type KeyboardEvent } from 'react'

type UseWysiwygKeyGuardsParams = {
  isEditorReadOnly: boolean
}

export function useWysiwygKeyGuards({ isEditorReadOnly }: UseWysiwygKeyGuardsParams) {
  const handleWysiwygKeyGuards = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement): boolean => {
      if (isEditorReadOnly) {
        const allowedShortcut = (event.ctrlKey || event.metaKey) && ['a', 'c'].includes(event.key.toLowerCase())

        if (!allowedShortcut) {
          event.preventDefault()
        }

        return true
      }

      if (event.currentTarget !== editor || !editor.contains(event.target as Node)) {
        return true
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        const selection = window.getSelection()
        const anchorNode = selection?.anchorNode
        const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
        const anchorPre = anchorElement?.closest('pre')

        if (anchorPre && editor.contains(anchorPre)) {
          event.preventDefault()
          const range = document.createRange()
          range.selectNodeContents(anchorPre)
          selection?.removeAllRanges()
          selection?.addRange(range)
          return true
        }
      }

      return false
    },
    [isEditorReadOnly],
  )

  return { handleWysiwygKeyGuards }
}
