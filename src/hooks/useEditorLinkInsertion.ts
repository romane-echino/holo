import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type TurndownLike = {
  turndown: (input: string) => string
}

type UseEditorLinkInsertionParams = {
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
}

export function useEditorLinkInsertion({
  turndownService,
  updateActiveTabBody,
}: UseEditorLinkInsertionParams) {
  const { wysiwygEditorRef, linkSavedRangeRef } = useEditorOverlay()

  const clearLinkSavedRange = useCallback(() => {
    linkSavedRangeRef.current = null
  }, [linkSavedRangeRef])

  const insertLinkIntoEditor = useCallback(
    (text: string, url: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      const trimmedUrl = url.trim()

      if (!trimmedUrl) {
        linkSavedRangeRef.current = null
        return
      }

      const trimmedText = text.trim() || trimmedUrl
      const selection = window.getSelection()
      const savedRange = linkSavedRangeRef.current

      editor.focus()

      if (savedRange && selection) {
        selection.removeAllRanges()
        selection.addRange(savedRange)
      }

      const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null

      if (activeRange) {
        activeRange.deleteContents()
        const anchor = document.createElement('a')
        anchor.setAttribute('href', trimmedUrl)
        anchor.textContent = trimmedText
        activeRange.insertNode(anchor)
        activeRange.setStartAfter(anchor)
        activeRange.collapse(true)
        selection?.removeAllRanges()
        selection?.addRange(activeRange)
      } else {
        document.execCommand('insertHTML', false, `<a href="${trimmedUrl}">${trimmedText}</a>`)
      }

      const markdown = turndownService.turndown(editor.innerHTML)
      updateActiveTabBody(markdown)
      linkSavedRangeRef.current = null
    },
    [linkSavedRangeRef, turndownService, updateActiveTabBody, wysiwygEditorRef],
  )

  return {
    insertLinkIntoEditor,
    clearLinkSavedRange,
  }
}
