import { useCallback, useEffect, useState } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'

// Version statique de fallback — mise à jour à chaque release
const FALLBACK_VERSION = '0.3.2'

export function useAppUpdates() {
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)

  useEffect(() => {
    const loadAppVersion = async () => {
      if (!window.holo) {
        return
      }

      const version = await window.holo.getAppVersion().catch(() => '')
      if (version) {
        setAppVersion(normalizeVersionLabel(version))
      }
    }

    void loadAppVersion()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const holo = window.holo

    if (!holo) {
      return
    }

    let unsubUpdateAvailable: (() => void) | undefined
    let unsubUpdateReady: (() => void) | undefined
    let unsubUpdateProgress: (() => void) | undefined

    try {
      unsubUpdateAvailable = holo.onUpdateAvailable?.(() => {
        setUpdateAvailable(true)
      })

      unsubUpdateReady = holo.onUpdateReady?.(() => {
        setUpdateReady(true)
        setUpdateProgress(100)
      })

      unsubUpdateProgress = holo.onUpdateProgress?.((data: { percent: number }) => {
        setUpdateProgress(Math.round(data.percent))
      })
    } catch (error) {
      console.error('Failed to setup update listeners:', error)
    }

    return () => {
      unsubUpdateAvailable?.()
      unsubUpdateReady?.()
      unsubUpdateProgress?.()
    }
  }, [])

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false)
  }, [])

  return {
    appVersion,
    updateAvailable,
    updateReady,
    updateProgress,
    dismissUpdate,
  }
}