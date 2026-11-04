/**
 * Diagnostic côté interface : erreurs et événements envoyés au journal du
 * processus principal, et « sections » d'état (temps réel, présence…) que
 * chaque partie de l'application déclare pour « Copier le diagnostic ».
 * Jamais de contenu de document ni de jeton.
 */

type Level = 'error' | 'warn' | 'info'
type SectionProvider = () => string[] | null

const sections = new Map<string, SectionProvider>()

function stringify(value: unknown): string {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const REPEAT_WINDOW_MS = 10_000
const MAX_PER_MINUTE = 60
const lastSent = new Map<string, number>()
let minuteStart = 0
let sentThisMinute = 0

/** Note un événement dans le journal (une même entrée au plus toutes les 10 s, 60 par minute). */
export function reportDiagnostic(level: Level, source: string, ...parts: unknown[]): void {
  const message = parts.map(stringify).join(' ')
  const now = Date.now()
  const key = `${level}|${source}|${message.slice(0, 200)}`
  if (now - (lastSent.get(key) ?? 0) < REPEAT_WINDOW_MS) return
  if (now - minuteStart > 60_000) {
    minuteStart = now
    sentThisMinute = 0
  }
  if (sentThisMinute >= MAX_PER_MINUTE) return
  sentThisMinute += 1
  lastSent.set(key, now)
  if (lastSent.size > 300) lastSent.clear()
  void window.holo?.logDiagnostic?.(level, source, message).catch(() => {})
}

/** Déclare une section du rapport ; renvoie de quoi la retirer. */
export function registerDiagnosticSection(title: string, provider: SectionProvider): () => void {
  sections.set(title, provider)
  return () => {
    if (sections.get(title) === provider) sections.delete(title)
  }
}

/** Rapport complet, prêt à copier. */
export async function buildDiagnosticReport(): Promise<string> {
  const holo = window.holo
  const lines: string[] = []
  const [enabled, serverUrl] = await Promise.all([
    holo?.getHoloConfigValue?.('realtime-enabled').catch(() => null),
    holo?.getHoloConfigValue?.('realtime-server-url').catch(() => null),
  ])
  lines.push('## Configuration du temps réel', `Activé : ${enabled === false ? 'non' : 'oui'} ; serveur : ${serverUrl || '(par défaut)'}`)
  for (const [title, provider] of sections) {
    let content: string[] | null = null
    try {
      content = provider()
    } catch (error) {
      content = [`(section indisponible : ${stringify(error)})`]
    }
    if (!content) continue
    lines.push('', `## ${title}`, ...content)
  }
  const rendererSections = lines.join('\n')
  return (await holo?.getDiagnosticReport?.(rendererSections).catch(() => null)) ?? rendererSections
}

let installed = false

/** Erreurs non rattrapées et console.error / console.warn de l'interface, envoyées au journal. */
export function installRendererDiagnostics(): void {
  if (installed || typeof window === 'undefined' || !window.holo?.logDiagnostic) return
  installed = true
  window.addEventListener('error', (event) => {
    reportDiagnostic('error', 'window', event.error ?? event.message, event.filename ? `(${event.filename}:${event.lineno})` : '')
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic('error', 'window', 'Promesse rejetée non rattrapée :', event.reason)
  })
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      reportDiagnostic(level, 'console', ...args)
    }
  }
}
