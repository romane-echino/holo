import { useCallback, useEffect, useState } from 'react'
import { normalizeVersionLabel } from '../lib/appUtils'

// Version statique de fallback — mise à jour à chaque release
const FALLBACK_VERSION = '0.3.2'

export function useAppUpdates() {
  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateError, setUpdateError] = useState<{ message: string; releaseUrl: string } | null>(null)

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
    let unsubUpdateError: (() => void) | undefined

    try {
      unsubUpdateAvailable = holo.onUpdateAvailable?.(() => {
        setUpdateAvailable(true)
        setUpdateError(null)
      })

      unsubUpdateReady = holo.onUpdateReady?.(() => {
        setUpdateAvailable(true)
        setUpdateReady(true)
        setUpdateProgress(100)
      })

      unsubUpdateProgress = holo.onUpdateProgress?.((data: { percent: number }) => {
        setUpdateProgress(Math.round(data.percent))
      })

      unsubUpdateError = holo.onUpdateError?.((data) => {
        console.error('[holo-update] mise à jour impossible :', data.message)
        setUpdateAvailable(true)
        setUpdateError(data)
      })
    } catch (error) {
      console.error('Failed to setup update listeners:', error)
    }

    // Les événements envoyés avant que cette page écoute (la vérification part
    // dès la création de la fenêtre) seraient perdus : on relit l'état actuel.
    void holo.getUpdateState?.().then((state) => {
      if (!state?.available) return
      setUpdateAvailable(true)
      if (state.ready) {
        setUpdateReady(true)
        setUpdateProgress(100)
      }
      if (state.error) setUpdateError(state.error)
    }).catch(() => {})

    return () => {
      unsubUpdateAvailable?.()
      unsubUpdateReady?.()
      unsubUpdateProgress?.()
      unsubUpdateError?.()
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
    updateError,
    dismissUpdate,
  }
}