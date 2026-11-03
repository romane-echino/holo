import { flushSync } from 'react-dom'

/**
 * Registre des éditeurs ayant une saisie pas encore remontée au document
 * (InlineEditor attend 400 ms après la dernière frappe avant d'enregistrer).
 * `flushPendingEdits()` force cette remontée immédiatement — avant un pull,
 * une fermeture, un rechargement ou un Ctrl+S — pour ne perdre aucune frappe.
 */
type Flusher = () => void

const flushers = new Set<Flusher>()

export function registerPendingEditFlusher(flusher: Flusher): () => void {
  flushers.add(flusher)
  return () => {
    flushers.delete(flusher)
  }
}

export function flushPendingEdits(): void {
  if (flushers.size === 0) return
  // flushSync : le rendu et les effets qui émettent le markdown s'exécutent
  // avant le retour, de sorte que l'écriture disque est déjà en file.
  flushSync(() => {
    for (const flusher of [...flushers]) {
      try {
        flusher()
      } catch (error) {
        console.error('[editorFlush] échec du flush', error)
      }
    }
  })
}

/**
 * Session du document ouvert, enregistrée par l'application. Permet à
 * n'importe quel composant (panneau d'espace, mises à jour…) d'enregistrer
 * ou de recharger le document sans dépendre de l'arbre React.
 */
type DocumentSession = {
  /** Remonte les frappes en attente et attend la fin des écritures disque. */
  flush: () => Promise<void>
  /** Relit le document depuis le disque (après un pull, une résolution…). */
  reload: () => Promise<void>
  /** flush + commit/push git du document ouvert. */
  save: () => Promise<void>
}

let session: DocumentSession | null = null

export function registerDocumentSession(next: DocumentSession): () => void {
  session = next
  return () => {
    if (session === next) session = null
  }
}

export async function flushOpenDocument(): Promise<void> {
  if (session) await session.flush()
  else flushPendingEdits()
}

export async function reloadOpenDocument(): Promise<void> {
  await session?.reload()
}

export async function saveOpenDocument(): Promise<void> {
  if (session) await session.save()
  else flushPendingEdits()
}
