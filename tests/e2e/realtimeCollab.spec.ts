/**
 * realtimeCollab.spec.ts — Édition en temps réel via le relais Codenotch
 *
 * Nécessite un runtime Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`). Ignoré sinon.
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')
const execFileAsync = promisify(execFile)
const RELAY_URL = process.env.HOLO_REALTIME_URL ?? 'http://127.0.0.1:5005/holo-realtime'

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return stdout.trim()
}

/** Le relais local (projet holo-realtime déployé) répond-il ? */
async function relayAvailable(): Promise<boolean> {
  try {
    return (await fetch(`${RELAY_URL}/openapi`)).ok
  } catch {
    return false
  }
}

type Launched = { app: ElectronApplication; page: Page; configHome: string }

async function launchHolo(rootPath: string, filePath: string, author: string, email: string): Promise<Launched> {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-rt-config-'))
  await fs.mkdir(path.join(configHome, 'holo'), { recursive: true })
  await fs.writeFile(path.join(configHome, 'holo', 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'realtime-prompt-dismissed': true,
    'app-author': author,
    'git-email': email,
    'realtime-enabled': true,
    // Aucun jeton : le relais est public, le contenu chiffré avec la clé du dépôt.
    'realtime-server-url': RELAY_URL,
  }), 'utf8')
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

/** Dépôt « docs » cloné deux fois ; l'origine pointe vers une URL https unique (identité du document). */
async function setupClones(initial: string) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-rt-')))
  const seed = path.join(base, 'seed')
  await fs.mkdir(seed)
  await git(seed, 'init')
  await git(seed, 'config', 'user.name', 'Seed')
  await git(seed, 'config', 'user.email', 'seed@example.com')
  await fs.writeFile(path.join(seed, 'doc.md'), initial, 'utf8')
  await git(seed, 'add', '-A')
  await git(seed, 'commit', '-m', 'init')
  const workspaceUrl = `https://git.holo-e2e.invalid/equipe/docs-${crypto.randomUUID()}.git`
  const clones: string[] = []
  for (const name of ['alice', 'bob']) {
    const dir = path.join(base, name)
    await git(base, 'clone', seed, dir)
    await git(dir, 'remote', 'set-url', 'origin', workspaceUrl)
    clones.push(dir)
  }
  return { base, alice: clones[0], bob: clones[1] }
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

function presence(page: Page) {
  return page.getByTestId('realtime-presence').first()
}

async function appendTo(page: Page, text: string, suffix: string) {
  const target = paragraph(page, text)
  await target.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
}

test.describe('Édition en temps réel (relais Codenotch)', () => {
  test.setTimeout(150_000)

  test('deux personnes éditent le même document et voient les modifications de l autre', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const initial = ['# Réunion', '', 'Point Alice.', '', 'Paragraphe tampon.', '', 'Point Bob.', ''].join('\n')
    const repos = await setupClones(initial)
    let alice: Launched | null = null
    let bob: Launched | null = null
    try {
      alice = await launchHolo(repos.alice, path.join(repos.alice, 'doc.md'), 'Alice Martin', 'alice@example.com')
      await expect(presence(alice.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })

      bob = await launchHolo(repos.bob, path.join(repos.bob, 'doc.md'), 'Bob Keller', 'bob@example.com')
      await expect(presence(bob.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })

      // Chacun voit l'autre.
      await expect(presence(alice.page).getByLabel('Bob Keller')).toBeVisible({ timeout: 15_000 })
      await expect(presence(bob.page).getByLabel('Alice Martin')).toBeVisible({ timeout: 15_000 })

      // Modifications simultanées dans deux paragraphes différents.
      await appendTo(alice.page, 'Point Alice.', ' Validé par Alice.')
      await appendTo(bob.page, 'Point Bob.', ' Relu par Bob.')

      await expect(paragraph(bob.page, 'Point Alice. Validé par Alice.')).toBeVisible({ timeout: 15_000 })
      await expect(paragraph(alice.page, 'Point Bob. Relu par Bob.')).toBeVisible({ timeout: 15_000 })

      // Même paragraphe : les deux saisies sont fusionnées, aucune n'est perdue.
      await appendTo(alice.page, 'Paragraphe tampon.', ' A1')
      await appendTo(bob.page, 'Paragraphe tampon.', ' B1')
      for (const page of [alice.page, bob.page]) {
        await expect.poll(async () => (await paragraph(page, 'Paragraphe tampon.').first().innerText()), { timeout: 15_000 })
          .toMatch(/^(?=.*A1)(?=.*B1)/)
      }

      // Alice tape dans un paragraphe pendant que Bob insère au début du même
      // paragraphe : le curseur d'Alice suit, sa frappe continue au bon endroit.
      await appendTo(alice.page, 'Point Bob. Relu par Bob.', ' Alice')
      await expect(paragraph(bob.page, 'Relu par Bob. Alice')).toBeVisible({ timeout: 15_000 })
      const bobTarget = paragraph(bob.page, 'Relu par Bob. Alice')
      await bobTarget.click()
      await bob.page.keyboard.press('Home')
      await bob.page.keyboard.type('Note : ')
      await expect(paragraph(alice.page, 'Note : Point Bob.')).toBeVisible({ timeout: 15_000 })
      await alice.page.keyboard.type(' continue')
      await expect.poll(async () => paragraph(bob.page, 'Note : Point Bob.').first().innerText(), { timeout: 15_000 })
        .toBe('Note : Point Bob. Relu par Bob. Alice continue')

      // Les deux fichiers sur disque convergent.
      await expect.poll(async () => {
        const [a, b] = await Promise.all([
          fs.readFile(path.join(repos.alice, 'doc.md'), 'utf8'),
          fs.readFile(path.join(repos.bob, 'doc.md'), 'utf8'),
        ])
        return a === b && a.includes('Validé par Alice.') && a.includes('Relu par Bob.') && a.includes('A1') && a.includes('B1')
      }, { timeout: 20_000 }).toBe(true)

      // Bob part : Alice ne le voit plus.
      await bob.app.close()
      bob = null
      await expect(presence(alice.page).getByLabel('Bob Keller')).toBeHidden({ timeout: 40_000 })
    } finally {
      if (alice) await alice.app.close().catch(() => {})
      if (bob) await bob.app.close().catch(() => {})
      await fs.rm(repos.base, { recursive: true, force: true }).catch(() => {})
      for (const launched of [alice, bob]) if (launched) await fs.rm(launched.configHome, { recursive: true, force: true }).catch(() => {})
    }
  })
})
