import { useCallback, type DragEvent, type MutableRefObject } from 'react'

type UseEditorImageDragParams = {
  isEditorReadOnly: boolean
  imageDragDepthRef: MutableRefObject<number>
  setIsImageDragOverEditor: (value: boolean) => void
}

export function useEditorImageDrag({
  isEditorReadOnly,
  imageDragDepthRef,
  setIsImageDragOverEditor,
}: UseEditorImageDragParams) {
  const isImageFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      return true
    }

    return /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(file.name)
  }, [])

  const hasImageInDragEvent = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (Array.from(event.dataTransfer.files).some(isImageFile)) {
        return true
      }

      return Array.from(event.dataTransfer.items).some(
        (item) => item.kind === 'file' && (item.type.startsWith('image/') || item.type === ''),
      )
    },
    [isImageFile],
  )

  const onEditorDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (isEditorReadOnly) return
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent, isEditorReadOnly, setIsImageDragOverEditor],
  )

  const onEditorDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (isEditorReadOnly) return
      if (!hasImageInDragEvent(event)) return

      event.preventDefault()
      imageDragDepthRef.current += 1
      setIsImageDragOverEditor(true)
    },
    [hasImageInDragEvent, imageDragDepthRef, isEditorReadOnly, setIsImageDragOverEditor],
  )

  const onEditorDragLeave = useCallback(() => {
    imageDragDepthRef.current = Math.max(0, imageDragDepthRef.current - 1)
    if (imageDragDepthRef.current === 0) {
      setIsImageDragOverEditor(false)
    }
  }, [imageDragDepthRef, setIsImageDragOverEditor])

  return {
    isImageFile,
    onEditorDragOver,
    onEditorDragEnter,
    onEditorDragLeave,
  }
}
