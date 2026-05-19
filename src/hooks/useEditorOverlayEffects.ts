import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'

type AiDialogState = {
  mode: 'generate' | 'transform'
  prompt: string
  isLoading: boolean
  selectedText: string
  error?: string
} | null

type UseEditorOverlayEffectsParams = {
  aiDialog: AiDialogState
  aiTextareaRef: RefObject<HTMLTextAreaElement | null>
  setCodeBlockPopup: Dispatch<SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
}

export function useEditorOverlayEffects({
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
