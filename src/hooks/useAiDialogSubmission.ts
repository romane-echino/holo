import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type UseAiDialogSubmissionParams = {
  askAi: (userMessage: string) => Promise<string>
  markdownToHtml: (markdown: string) => string
  turndownService: { turndown: (html: string) => string }
  updateActiveTabBody: (value: string) => void
}

export function useAiDialogSubmission({
  askAi,
  markdownToHtml,
  turndownService,
  updateActiveTabBody,
}: UseAiDialogSubmissionParams) {
  const { aiDialog, setAiDialog, wysiwygEditorRef, aiSavedRangeRef } = useEditorOverlay()
  return useCallback(async () => {
    if (!aiDialog) return

    setAiDialog((prev) => (prev ? { ...prev, isLoading: true } : null))
    const userMessage =
      aiDialog.mode === 'transform' && aiDialog.selectedText
        ? `Texte selectionne :\n${aiDialog.selectedText}\n\nInstruction : ${aiDialog.prompt}`
        : aiDialog.prompt

    try {
      const result = await askAi(userMessage)
      const html = markdownToHtml(result)
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const savedRange = aiSavedRangeRef.current
      if (savedRange) {
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(savedRange)
        if (aiDialog.mode === 'transform') savedRange.deleteContents()
      } else {
        editor.focus()
      }

      document.execCommand('insertHTML', false, html)
      const md = turndownService.turndown(editor.innerHTML)
      updateActiveTabBody(md)
      setAiDialog(null)
      aiSavedRangeRef.current = null
    } catch (err) {
      console.error('AI error', err)
      const normalizedError = err instanceof Error ? err.message : String(err)
      if (normalizedError === 'NO_PROVIDER') {
        setAiDialog((prev) =>
          prev ? { ...prev, isLoading: false, error: 'Ajoute une cle OpenAI ou Gemini dans les Parametres.' } : null,
        )
        return
      }
      if (normalizedError === 'OPENAI_KEY_MISSING') {
        setAiDialog((prev) =>
          prev ? { ...prev, isLoading: false, error: 'Le provider selectionne est OpenAI mais la cle est vide.' } : null,
        )
        return
      }
      if (normalizedError === 'GEMINI_KEY_MISSING') {
        setAiDialog((prev) =>
          prev ? { ...prev, isLoading: false, error: 'Le provider selectionne est Gemini mais la cle est vide.' } : null,
        )
        return
      }
      const status = err instanceof Error ? (err.message.match(/\d+/)?.[0] ?? '') : ''
      const msg =
        status === '429'
          ? 'Quota d\'API depasse (429). Verifie ta limite OpenAI/Gemini.'
          : status === '401'
            ? 'Cle API invalide (401). Verifie les Parametres IA.'
            : `Erreur IA${status ? ` (${status})` : ''}`
      setAiDialog((prev) => (prev ? { ...prev, isLoading: false, error: msg } : null))
    }
  }, [aiDialog, aiSavedRangeRef, askAi, markdownToHtml, setAiDialog, turndownService, updateActiveTabBody, wysiwygEditorRef])
}
