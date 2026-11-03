import { useEffect, useRef } from 'react'

function readStartupPayload(): HoloLaunchPayload | null {
  const params = new URLSearchParams(window.location.search)
  const rootPath = params.get('rootPath')?.trim() ?? ''
  const filePath = params.get('filePath')?.trim() ?? ''
  const startupError = params.get('startupError')?.trim() || undefined
  const cloneRemote = params.get('cloneRemote')?.trim()
  const cloneRequest = cloneRemote
    ? {
        remoteUrl: cloneRemote,
        repoName: params.get('cloneRepoName')?.trim() ?? '',
        relativeFilePath: params.get('cloneFilePath')?.trim() ?? '',
      }
    : undefined
  if (!rootPath && !filePath && !startupError && !cloneRequest) return null
  return { rootPath, filePath, startupError, cloneRequest }
}

/**
 * Lien Holo, fichier ou dossier transmis à l'app : au démarrage (paramètres
 * de l'URL) puis à chaque nouveau lien reçu pendant que l'app est ouverte.
 */
export function useLaunchPayloads(handle: (payload: HoloLaunchPayload) => void | Promise<void>) {
  const handleRef = useRef(handle)
  useEffect(() => {
    handleRef.current = handle
  }, [handle])

  useEffect(() => {
    const startupPayload = readStartupPayload()
    if (startupPayload) void handleRef.current(startupPayload)
    return window.holo?.onLaunchPayload?.((payload) => { void handleRef.current(payload) })
  }, [])
}
