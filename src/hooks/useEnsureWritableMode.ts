import { useCallback } from 'react'

interface UseEnsureWritableModeParams {
  readOnlyMode: boolean
}

export function useEnsureWritableMode({
  readOnlyMode,
}: UseEnsureWritableModeParams) {
  const ensureWritableMode = useCallback(() => {
    if (!readOnlyMode) {
      return true
    }

    window.alert('Le mode lecture seule est activé. Désactive-le pour modifier ce contenu.')
    return false
  }, [readOnlyMode])

  return {
    ensureWritableMode,
  }
}
