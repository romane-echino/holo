import { useCallback, useRef } from 'react'

type UseWindowHeaderDragParams = {
  headerRef: React.RefObject<HTMLElement | null>
  windowIsMaximized: boolean
  windowPlatform: string
  setWindowIsMaximized: React.Dispatch<React.SetStateAction<boolean>>
  setWindowPlatform: React.Dispatch<React.SetStateAction<string>>
}

type HeaderDragState = {
  startClientX: number
  startClientY: number
  pointerOffsetRatioX: number
  restored: boolean
}

export function useWindowHeaderDrag({
  headerRef,
  windowIsMaximized,
  windowPlatform,
  setWindowIsMaximized,
  setWindowPlatform,
}: UseWindowHeaderDragParams) {
  const headerDragStateRef = useRef<HeaderDragState | null>(null)

  const onHeaderMouseDown = useCallback(
    async (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0) {
        return
      }

      if ((event.target as HTMLElement | null)?.closest('.no-drag')) {
        return
      }

      const holo = window.holo
      if (!holo) {
        return
      }

      let isWindows = windowPlatform === 'win32'
      let isMaximized = windowIsMaximized

      if (!isWindows || !isMaximized) {
        try {
          const state = await holo.getWindowState()
          isWindows = state?.platform === 'win32'
          isMaximized = Boolean(state?.isMaximized)
          setWindowPlatform(typeof state?.platform === 'string' ? state.platform : '')
          setWindowIsMaximized(Boolean(state?.isMaximized))
        } catch {
          return
        }
      }

      if (!isWindows || !isMaximized) {
        return
      }

      headerDragStateRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        pointerOffsetRatioX: window.innerWidth > 0 ? event.clientX / window.innerWidth : 0.5,
        restored: false,
      }

      const handleMouseMove = async (moveEvent: MouseEvent) => {
        const dragState = headerDragStateRef.current
        if (!dragState) {
          return
        }

        const deltaX = Math.abs(moveEvent.clientX - dragState.startClientX)
        const deltaY = Math.abs(moveEvent.clientY - dragState.startClientY)

        if (!dragState.restored) {
          if (deltaX < 6 && deltaY < 6) {
            return
          }

          dragState.restored = true

          try {
            await holo.dragWindowFromMaximized({
              pointerScreenX: moveEvent.screenX,
              pointerScreenY: moveEvent.screenY,
              pointerOffsetRatioX: dragState.pointerOffsetRatioX,
              headerHeight: headerRef.current?.offsetHeight ?? 64,
            })
            setWindowIsMaximized(false)
          } catch {
            cleanup()
          }

          return
        }

        try {
          const headerHeight = headerRef.current?.offsetHeight ?? 64
          await holo.setWindowPosition({
            x: Math.round(moveEvent.screenX - window.innerWidth * dragState.pointerOffsetRatioX),
            y: Math.max(0, Math.round(moveEvent.screenY - Math.min(headerHeight / 2, 24))),
          })
        } catch {
          cleanup()
        }
      }

      const cleanup = () => {
        headerDragStateRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', cleanup)
      }

      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', cleanup)
    },
    [headerRef, setWindowIsMaximized, setWindowPlatform, windowIsMaximized, windowPlatform],
  )

  return { onHeaderMouseDown }
}
