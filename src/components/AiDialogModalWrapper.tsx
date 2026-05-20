import React from 'react'
import { AiDialogModal } from './AiDialogModal'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type AiDialogModalWrapperProps = {
  onSubmitAiDialog: () => void
}

export const AiDialogModalWrapper: React.FC<AiDialogModalWrapperProps> = ({ onSubmitAiDialog }) => {
  const { aiDialog, setAiDialog, aiTextareaRef, aiSavedRangeRef } = useEditorOverlay()

  return (
    <AiDialogModal
      aiDialog={aiDialog}
      aiTextareaRef={aiTextareaRef}
      onSetAiDialog={setAiDialog}
      onSubmitAiDialog={onSubmitAiDialog}
      onClose={() => {
        setAiDialog(null)
        aiSavedRangeRef.current = null
      }}
    />
  )
}
