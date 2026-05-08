import React from 'react'

type AiDialogState = {
  mode: 'generate' | 'transform'
  prompt: string
  isLoading: boolean
  selectedText: string
  error?: string
}

type AiDialogModalProps = {
  aiDialog: AiDialogState | null
  aiTextareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSetAiDialog: React.Dispatch<React.SetStateAction<AiDialogState | null>>
  onSubmitAiDialog: () => void
  onClose: () => void
}

export const AiDialogModal: React.FC<AiDialogModalProps> = ({
  aiDialog,
  aiTextareaRef,
  onSetAiDialog,
  onSubmitAiDialog,
  onClose,
}) => {
  if (!aiDialog) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-wand-magic-sparkles text-[#9d8bff]" />
            <span className="text-sm font-semibold text-white">
              {aiDialog.mode === 'transform' ? 'Transformer avec l\'IA' : 'Générer avec l\'IA'}
            </span>
          </div>
          <button
            className="rounded p-1 text-white/40 hover:text-white/80 hover:bg-white/8"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {aiDialog.mode === 'transform' && aiDialog.selectedText && (
            <div className="rounded-lg bg-white/5 border border-white/8 px-3 py-2 text-xs text-white/50 max-h-24 overflow-y-auto italic">
              «&nbsp;{aiDialog.selectedText.slice(0, 300)}{aiDialog.selectedText.length > 300 ? '…' : ''}&nbsp;»
            </div>
          )}
          <textarea
            ref={aiTextareaRef}
            className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#7B61FF]/50"
            rows={3}
            placeholder={aiDialog.mode === 'transform' ? 'Ex : Résume ce texte en 3 points clés' : 'Ex : Explique les avantages de Docker'}
            value={aiDialog.prompt}
            onChange={(e) => onSetAiDialog((prev) => prev ? { ...prev, prompt: e.target.value, error: undefined } : null)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmitAiDialog() }
              if (e.key === 'Escape') { onClose() }
            }}
          />
          {aiDialog.error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <i className="fa-solid fa-triangle-exclamation" />
              {aiDialog.error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              className="rounded px-3 py-1.5 text-xs text-white/50 hover:text-white/80 hover:bg-white/8"
              onClick={onClose}
            >
              Annuler
            </button>
            <button
              className="flex items-center gap-2 rounded-lg bg-[#7B61FF] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#6D4FD8] disabled:opacity-50"
              disabled={!aiDialog.prompt.trim() || aiDialog.isLoading}
              onClick={onSubmitAiDialog}
            >
              {aiDialog.isLoading ? (
                <><i className="fa-solid fa-spinner fa-spin" />Génération…</>
              ) : (
                <><i className="fa-solid fa-wand-magic-sparkles" />{aiDialog.mode === 'transform' ? 'Transformer' : 'Générer'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
