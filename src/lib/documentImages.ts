import { notify, notifyError } from './notify'

/** Image stockée dans l'espace (chemin relatif à sa racine, ex. `images/photo-1a2b3c4d.png`). */
export function isLocalImagePath(url: string): boolean {
  return url !== ''
    && !url.startsWith('http://')
    && !url.startsWith('https://')
    && !url.startsWith('data:')
    && !url.startsWith('file://')
    && !url.startsWith('blob:')
}

const resolvedImageCache = new Map<string, Promise<string | null>>()

/**
 * Source affichable d'une image de document : les images locales sont lues
 * par le processus principal (data URL), les autres sont utilisées telles quelles.
 * Les liens locaux sont relatifs au document `documentPath`.
 */
export function resolveImageSrc(url: string, documentPath?: string | null): Promise<string | null> {
  if (!isLocalImagePath(url)) return Promise.resolve(url)
  const cacheKey = `${documentPath ?? ''}\n${url}`
  const cached = resolvedImageCache.get(cacheKey)
  if (cached) return cached
  const pending = (window.holo?.loadImage(url, documentPath ?? null) ?? Promise.resolve(null))
    .then((result) => (result?.ok ? result.dataUrl : null))
    .catch(() => null)
  resolvedImageCache.set(cacheKey, pending)
  // Une image introuvable peut apparaître plus tard (pull) : ne pas mémoriser l'échec.
  void pending.then((value) => { if (value === null) resolvedImageCache.delete(cacheKey) })
  return pending
}

/**
 * Prévient quand des fichiers de l'espace ont pu arriver (pull, synchro…) :
 * une image introuvable est alors recherchée à nouveau.
 */
export function onSpaceFilesChanged(callback: () => void): () => void {
  window.addEventListener('holo:refresh-tree', callback)
  return () => window.removeEventListener('holo:refresh-tree', callback)
}

export async function copyImageToClipboard(url: string, documentPath?: string | null): Promise<void> {
  try {
    await window.holo?.writeClipboardImage(url, documentPath ?? null)
    notify({ kind: 'success', title: 'Image copiée', durationMs: 2000 })
  } catch (error) {
    notifyError('Impossible de copier l\'image', error)
  }
}
