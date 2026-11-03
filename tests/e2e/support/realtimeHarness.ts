/**
 * Outils des tests d'édition en équipe : dépôt git servi en HTTP (git
 * http-backend), lancement d'instances Holo reliées au relais Codenotch local.
 */
import type { Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { promises as fs } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')
const execFileAsync = promisify(execFile)
export const RELAY_URL = process.env.HOLO_REALTIME_URL ?? 'http://127.0.0.1:5005/holo-realtime'

export async function git(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return stdout.trim()
}

export async function relayAvailable(): Promise<boolean> {
  try {
    return (await fetch(`${RELAY_URL}/openapi`)).ok
  } catch {
    return false
  }
}

/** Serveur git « smart HTTP » minimal (CGI git http-backend), lecture et écriture. */
export async function startGitHttpServer(projectRoot: string) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const child = spawn('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: projectRoot,
        GIT_HTTP_EXPORT_ALL: '1',
        REMOTE_USER: 'e2e',
        REMOTE_ADDR: '127.0.0.1',
        PATH_INFO: decodeURIComponent(url.pathname),
        REQUEST_METHOD: request.method ?? 'GET',
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: request.headers['content-type'] ?? '',
        HTTP_CONTENT_ENCODING: request.headers['content-encoding'] ?? '',
        HTTP_GIT_PROTOCOL: String(request.headers['git-protocol'] ?? ''),
      },
    })
    request.pipe(child.stdin)
    let pending: Buffer = Buffer.alloc(0)
    let headersSent = false
    child.stdout.on('data', (chunk: Buffer) => {
      if (headersSent) {
        response.write(chunk)
        return
      }
      pending = Buffer.concat([pending, chunk])
      const crlf = pending.indexOf('\r\n\r\n')
      const lf = pending.indexOf('\n\n')
      const end = crlf >= 0 ? crlf : lf
      if (end < 0) return
      const head = pending.subarray(0, end).toString('utf8')
      response.statusCode = 200
      for (const line of head.split(/\r?\n/)) {
        const separator = line.indexOf(':')
        if (separator < 0) continue
        const name = line.slice(0, separator).trim()
        const value = line.slice(separator + 1).trim()
        if (name.toLowerCase() === 'status') response.statusCode = Number.parseInt(value, 10)
        else response.setHeader(name, value)
      }
      headersSent = true
      response.write(pending.subarray(end + (crlf >= 0 ? 4 : 2)))
    })
    child.stdout.on('end', () => response.end())
    child.on('error', () => response.destroy())
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export type Launched = { app: ElectronApplication; page: Page; configHome: string }

export async function launchHolo(
  rootPath: string,
  filePath: string,
  author: string,
  email: string,
  options: { configHome?: string } = {},
): Promise<Launched> {
  // configHome : relance de la même personne (après un plantage) avec sa configuration.
  const configHome = options.configHome ?? await fs.mkdtemp(path.join(os.tmpdir(), 'holo-rt-spaces-config-'))
  if (!options.configHome) {
    await fs.mkdir(path.join(configHome, 'holo'), { recursive: true })
    await fs.writeFile(path.join(configHome, 'holo', 'holo-config.json'), JSON.stringify({
      'app-onboarding-done': true,
      'realtime-prompt-dismissed': true,
      'app-author': author,
      'git-email': email,
      'realtime-enabled': true,
      'realtime-server-url': RELAY_URL,
    }), 'utf8')
  }
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [MAIN_PATH, `--holo-root=${rootPath}`, `--holo-file=${filePath}`],
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome, HOLO_APP_DATA_DIR: configHome },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, configHome }
}

/**
 * Dépôt partagé : un dépôt nu servi en HTTP et un clone par personne.
 * `files` : contenu initial (chemins relatifs).
 */
export async function setupSharedRepository(
  people: string[],
  files: Record<string, string>,
  options: {
    /** Options git de clonage par personne, ex. `['-c', 'core.autocrlf=true']` pour simuler Windows */
    cloneArgs?: Record<string, string[]>
  } = {},
) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-team-')))
  const projectRoot = path.join(base, 'server')
  await fs.mkdir(projectRoot)
  const seed = path.join(base, 'seed')
  await fs.mkdir(seed)
  await git(seed, 'init')
  await git(seed, 'config', 'user.name', 'Seed')
  await git(seed, 'config', 'user.email', 'seed@example.com')
  for (const [relativePath, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(seed, relativePath)), { recursive: true })
    await fs.writeFile(path.join(seed, relativePath), content, 'utf8')
  }
  await git(seed, 'add', '-A')
  await git(seed, 'commit', '-m', 'init')
  await git(base, 'clone', '--bare', seed, path.join(projectRoot, 'docs.git'))
  const server = await startGitHttpServer(projectRoot)
  const clones: Record<string, string> = {}
  for (const person of people) {
    const dir = path.join(base, person)
    await git(base, 'clone', ...(options.cloneArgs?.[person] ?? []), `${server.baseUrl}/docs.git`, dir)
    await git(dir, 'config', 'user.name', person)
    await git(dir, 'config', 'user.email', `${person}@example.com`)
    clones[person] = dir
  }
  return {
    base,
    clones,
    async cleanup() {
      await server.close().catch(() => {})
      await fs.rm(base, { recursive: true, force: true }).catch(() => {})
    },
  }
}

/**
 * Coupe (ou rétablit) l'accès réseau d'une instance au relais : les requêtes
 * passent par un proxy mort et les connexions ouvertes (flux SSE) sont fermées.
 * git (processus séparé) n'est pas concerné.
 */
export async function setRelayReachable(launched: Launched, reachable: boolean) {
  await launched.app.evaluate(async ({ session }, isReachable) => {
    if (isReachable) {
      await session.defaultSession.setProxy({ mode: 'direct' })
    } else {
      await session.defaultSession.setProxy({ proxyRules: 'http=127.0.0.1:9;https=127.0.0.1:9', proxyBypassRules: '<-loopback>' })
    }
    await session.defaultSession.closeAllConnections()
  }, reachable)
}
