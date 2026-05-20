import { useCallback } from 'react'
import type { WysiwygCommand } from '../types/editor'

type UseEditorUIHelpersParams = {
  editorMode: 'raw' | 'wysiwyg'
  onWysiwygInput: () => void
  setEditorMode: (mode: 'raw' | 'wysiwyg') => void
  wysiwygEditorRef: React.RefObject<HTMLDivElement | null>
}

export function useEditorUIHelpers({
  editorMode,
  onWysiwygInput,
  setEditorMode,
  wysiwygEditorRef,
}: UseEditorUIHelpersParams) {
  const runWysiwygCommand = useCallback(
    (command: WysiwygCommand, value?: string) => {
      const editor = wysiwygEditorRef.current

      if (!editor) {
        return
      }

      editor.focus()
      document.execCommand(command, false, value)
      onWysiwygInput()
    },
    [onWysiwygInput, wysiwygEditorRef],
  )

  const scrollToHeading = useCallback((headingIndex: number) => {
    const editor = wysiwygEditorRef.current
    if (!editor) {
      return
    }

    const headings = Array.from(editor.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    const target = headings[headingIndex] as HTMLElement | undefined

    if (!target) {
      return
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [wysiwygEditorRef])

  const onTocItemClick = useCallback(
    (headingIndex: number) => {
      if (editorMode === 'wysiwyg') {
        scrollToHeading(headingIndex)
        return
      }

      setEditorMode('wysiwyg')
      window.setTimeout(() => {
        scrollToHeading(headingIndex)
      }, 60)
    },
    [editorMode, scrollToHeading, setEditorMode],
  )

  return {
    runWysiwygCommand,
    onTocItemClick,
  }
}
