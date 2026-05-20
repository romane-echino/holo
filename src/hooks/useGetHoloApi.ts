import { useCallback } from 'react'

export function useGetHoloApi() {
  const getHoloApi = useCallback(() => {
    if (!window.holo) {
      window.alert(
        "L'API Electron n'est pas disponible. Lance l'application avec `npm run dev` (Electron), pas uniquement Vite dans le navigateur.",
      )
      return null
    }

    return window.holo
  }, [])

  return {
    getHoloApi,
  }
}
