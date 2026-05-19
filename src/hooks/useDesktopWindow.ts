import { useCallback, useEffect, useState } from 'react'

type GetHoloApi = () => Window['holo'] | null

export function useDesktopWindow(getHoloApi: GetHoloApi) {
  const [windowIsMaximized, setWindowIsMaximized] = useState(false)
  const [windowPlatform, setWindowPlatform] = useState('')

  useEffect(() => {
    const loadWindowState = async () => {
      const holo = window.holo
      if (!holo) {
        return
      }

      try {
        const state = await holo.getWindowState()
        setWindowIsMaximized(Boolean(state?.isMaximized))
        setWindowPlatform(typeof state?.platform === 'string' ? state.platform : '')
      } catch {
        // ignore state loading errors
      }
    }

    void loadWindowState()
  }, [])

  const minimizeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.minimizeWindow()
  }, [getHoloApi])

  const toggleDevTools = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.toggleDevTools()
  }, [getHoloApi])

  const toggleMaximizeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    const result = await holo.toggleMaximizeWindow()
    setWindowIsMaximized(Boolean(result?.isMaximized))
  }, [getHoloApi])

  const closeWindow = useCallback(async () => {
    const holo = getHoloApi()

    if (!holo) {
      return
    }

    await holo.closeWindow()
  }, [getHoloApi])

  return {
    windowIsMaximized,
    windowPlatform,
    setWindowIsMaximized,
    setWindowPlatform,
    minimizeWindow,
    toggleDevTools,
    toggleMaximizeWindow,
    closeWindow,
  }
}