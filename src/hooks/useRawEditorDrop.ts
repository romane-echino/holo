import { useCallback } from 'react'
import { useEditor } from '../contexts/EditorContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

interface UseRawEditorDropParams {
  isEditorReadOnly: boolean
  isImageFile: (file: File) => boolean
  handleImageFiles: (files: File[], callback: (mdImage: string) => void) => void
  updateActiveTabBody: (nextBody: string) => void
}

export function useRawEditorDrop({
  isEditorReadOnly,
  isImageFile,
  handleImageFiles,
  updateActiveTabBody,
}: UseRawEditorDropParams) {
  const { setIsImageDragOverEditor } = useEditor()
  const { imageDragDepthRef } = useEditorOverlay()

  const onRawDrop = useCallback(
    (event: React.DragEvent<HTMLTextAreaElement>) => {
      if (isEditorReadOnly) {
        return
      }

      imageDragDepthRef.current = 0
      setIsImageDragOverEditor(false)
      const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile)
      if (imageFiles.length === 0) return
      event.preventDefault()
      const target = event.currentTarget
      const cursor = target.selectionStart ?? target.value.length
      void handleImageFiles(imageFiles, (mdImage) => {
        const next = target.value.slice(0, cursor) + mdImage + '\n' + target.value.slice(cursor)
        updateActiveTabBody(next)
      })
    },
    [handleImageFiles, isEditorReadOnly, isImageFile, updateActiveTabBody, imageDragDepthRef, setIsImageDragOverEditor],
  )

  return {
    onRawDrop,
  }
}
