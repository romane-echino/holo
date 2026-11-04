// Journal de diagnostic : erreurs du processus principal (mises à jour,
// temps réel, git…), plantages ou blocages de fenêtre, erreurs et états
// remontés par l'interface. Écrit dans <données de l'app>/logs/holo.log
// (rotation à 1 Mo) et gardé en mémoire pour « Copier le diagnostic ».
// Jamais de contenu de document ni de jeton.
import { promises as fs, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_FILE_BYTES = 1024 * 1024
const MEMORY_ENTRIES = 400
const REPEAT_WINDOW_MS = 10_000

const recent = []
const lastSeen = new Map()
let logsDir = null
let writeChain = Promise.resolve()

function stringify(value) {
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function append(line) {
  if (!logsDir) return
  const file = path.join(logsDir, 'holo.log')
  writeChain = writeChain.then(async () => {
    try {
      await fs.mkdir(logsDir, { recursive: true })
      const stats = await fs.stat(file).catch(() => null)
      if (stats && stats.size > MAX_FILE_BYTES) await fs.rename(file, path.join(logsDir, 'holo.1.log')).catch(() => {})
      await fs.appendFile(file, `${line}\n`, 'utf8')
    } catch {
      // Le journal ne doit jamais faire échouer l'application.
    }
  })
}

/** Ajoute une entrée (level : error | warn | info ; source : main, renderer, realtime, update…). */
export function logDiagnostic(level, source, ...parts) {
  const message = parts.map(stringify).join(' ').slice(0, 4000)
  // Une même erreur répétée en boucle n'est notée qu'une fois toutes les 10 s.
  const key = `${level}|${source}|${message.slice(0, 200)}`
  const now = Date.now()
  if (now - (lastSeen.get(key) ?? 0) < REPEAT_WINDOW_MS) return
  lastSeen.set(key, now)
  if (lastSeen.size > 500) lastSeen.clear()
  const line = `${new Date(now).toISOString()} ${level.toUpperCase()} [${source}] ${message}`
  recent.push(line)
  if (recent.length > MEMORY_ENTRIES) recent.splice(0, recent.length - MEMORY_ENTRIES)
  append(line)
}

export function getLogsDir() {
  return logsDir
}

export function recentDiagnostics(count = 150) {
  return recent.slice(-count)
}

/** Version de Holo (en développement, app.getVersion() donne celle d'Electron). */
function holoVersion(app) {
  if (app.isPackaged) return app.getVersion()
  try {
    const pkg = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
    return JSON.parse(readFileSync(pkg, 'utf8')).version ?? app.getVersion()
  } catch {
    return app.getVersion()
  }
}

/** En-tête du rapport : versions et système. */
export function systemSummary(app) {
  return [
    `Holo ${holoVersion(app)} (${app.isPackaged ? 'installée' : 'développement'})`,
    `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}, Node ${process.versions.node}`,
    `Système : ${process.platform} ${os.release()} ${process.arch}, langue ${app.getLocale()}`,
  ]
}

/**
 * À appeler au démarrage : dossier du journal, erreurs non rattrapées,
 * console.error / console.warn du processus principal, plantages et
 * blocages de fenêtre.
 */
export function initDiagnostics(app) {
  logsDir = path.join(app.getPath('userData'), 'logs')
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console)
    console[level] = (...args) => {
      original(...args)
      logDiagnostic(level, 'main', ...args)
    }
  }
  process.on('uncaughtException', (error) => logDiagnostic('error', 'main', 'Exception non rattrapée :', error))
  process.on('unhandledRejection', (reason) => logDiagnostic('error', 'main', 'Promesse rejetée non rattrapée :', reason))
  app.on('render-process-gone', (_event, webContents, details) => {
    logDiagnostic('error', 'window', `Fenêtre arrêtée (${details.reason}, code ${details.exitCode}) :`, webContents.getURL().replace(/[?#].*$/, ''))
  })
  app.on('child-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') logDiagnostic('error', 'main', `Processus ${details.type} arrêté (${details.reason}, code ${details.exitCode})`)
  })
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('unresponsive', () => logDiagnostic('warn', 'window', 'Fenêtre bloquée (ne répond plus)'))
    window.webContents.on('responsive', () => logDiagnostic('info', 'window', 'Fenêtre de nouveau réactive'))
  })
  // La langue n'est connue qu'une fois l'application prête.
  void app.whenReady().then(() => logDiagnostic('info', 'main', 'Démarrage —', systemSummary(app).join(' ; ')))
}
