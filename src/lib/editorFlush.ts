import { flushSync } from 'react-dom'
import type { BlockState } from '../parts/MarkdownEditor/lib/types'
import type { SharedSnapshot } from './realtime/sharedModel'
import type { CaretAnchor } from './realtime/caretAnchor'

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

/**
 * Annuler / rétablir pendant une session temps réel : l'historique de Yjs
 * n'annule que nos propres modifications, jamais celles des autres. Quand il
 * est défini, il remplace l'historique local de l'éditeur.
 */
type HistoryOverride = { undo: () => void; redo: () => void }
let historyOverride: HistoryOverride | null = null

export function setHistoryOverride(next: HistoryOverride | null): void {
  historyOverride = next
}

export function getHistoryOverride(): HistoryOverride | null {
  return historyOverride
}

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

/**
 * Tâches à terminer avant la fermeture de la fenêtre, comme annoncer son
 * départ aux collègues (sinon on reste affiché « présent » une trentaine de
 * secondes).
 */
type CloseTask = () => Promise<void>
const closeTasks = new Set<CloseTask>()

export function registerCloseTask(task: CloseTask): () => void {
  closeTasks.add(task)
  return () => {
    closeTasks.delete(task)
  }
}

export async function runCloseTasks(timeoutMs = 1500): Promise<void> {
  if (closeTasks.size === 0) return
  await Promise.race([
    Promise.allSettled([...closeTasks].map((task) => task())),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

/**
 * Pont entre l'éditeur de blocs et l'édition en temps réel : l'éditeur donne
 * ses blocs avec leurs identifiants (photo locale sans réalignement), et
 * applique une photo reçue bloc par bloc, par identifiant.
 */
type SharedBlocksBridge = {
  getBlocks: () => BlockState[]
  applySnapshot: (snapshot: SharedSnapshot, caret?: CaretAnchor | null) => void
}
let sharedBlocksBridge: SharedBlocksBridge | null = null

export function registerSharedBlocksBridge(next: SharedBlocksBridge): () => void {
  sharedBlocksBridge = next
  return () => {
    if (sharedBlocksBridge === next) sharedBlocksBridge = null
  }
}

export function getSharedBlocksBridge(): SharedBlocksBridge | null {
  return sharedBlocksBridge
}

/**
 * Nouvelle place du curseur local dans le texte partagé, après une
 * modification reçue : l'éditeur (paragraphe, cellule, élément de liste) qui
 * replace le curseur la lit au lieu d'estimer la position.
 */
let caretHint: CaretAnchor | null = null

export function setCaretHint(next: CaretAnchor | null): void {
  caretHint = next
}

export function getCaretHint(): CaretAnchor | null {
  return caretHint
}
