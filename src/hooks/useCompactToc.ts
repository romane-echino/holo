import { useEffect } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type UseCompactTocParams = {
  isCompactLayout: boolean
  tocItemsCount: number
}

export function useCompactToc({ isCompactLayout, tocItemsCount }: UseCompactTocParams) {
  const { showCompactToc, setShowCompactToc, compactTocRef } = useEditorOverlay()

  useEffect(() => {
    if (!showCompactToc) {
      return
    }

    const onPointerDown = (event: MouseEvent) => {
      if (compactTocRef.current?.contains(event.target as Node)) {
        return
      }
      setShowCompactToc(false)
    }

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCompactToc(false)
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onEscape)

    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onEscape)
    }
  }, [compactTocRef, setShowCompactToc, showCompactToc])

  useEffect(() => {
    if (!isCompactLayout || tocItemsCount === 0) {
      setShowCompactToc(false)
    }
  }, [isCompactLayout, setShowCompactToc, tocItemsCount])
}
