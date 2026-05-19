import { useEffect } from 'react'

type UseCompactTocParams = {
  showCompactToc: boolean
  setShowCompactToc: React.Dispatch<React.SetStateAction<boolean>>
  compactTocRef: React.RefObject<HTMLDivElement | null>
  isCompactLayout: boolean
  tocItemsCount: number
}

export function useCompactToc({
  showCompactToc,
  setShowCompactToc,
  compactTocRef,
  isCompactLayout,
  tocItemsCount,
}: UseCompactTocParams) {
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
