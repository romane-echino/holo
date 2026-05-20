import { useEffect } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useEditorOverlayEffects() {
  const { aiDialog, aiTextareaRef, setCodeBlockPopup } = useEditorOverlay()

  useEffect(() => {
    if (aiDialog && !aiDialog.isLoading) {
      requestAnimationFrame(() => aiTextareaRef.current?.focus())
    }
  }, [aiDialog, aiTextareaRef])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.wysiwyg-editor') && !target.closest('.code-block-popup')) {
        setCodeBlockPopup(null)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [setCodeBlockPopup])
}

  aiDialog,
  aiTextareaRef,
  setCodeBlockPopup,
}: UseEditorOverlayEffectsParams) {
  useEffect(() => {
    if (aiDialog && !aiDialog.isLoading) {
      requestAnimationFrame(() => aiTextareaRef.current?.focus())
    }
  }, [aiDialog, aiTextareaRef])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.wysiwyg-editor') && !target.closest('.code-block-popup')) {
        setCodeBlockPopup(null)
      }
    }

    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [setCodeBlockPopup])
}
