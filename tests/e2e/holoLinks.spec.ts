/**
 * holoLinks.spec.ts — Ouverture des liens holo://
 *
 * Retour utilisateur : « Si on n'a pas ouvert le projet et qu'on clique sur
 * un lien qui vient d'être créé, on a un message d'erreur. Est-ce qu'on
 * pourrait au moins essayer de cloner le repo avant de dire page introuvable ? »
 */
import { test, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')
const execFileAsync = promisify(execFile)

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  return stdout.trim()
}

type Launched = { app: ElectronApplication; page: Page; configHome: string }

async function launchHolo(args: string[], recentFolders: string[] = []): Promise<Launched> {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-links-config-'))
  const holoDir = path.join(configHome, 'holo')
  await fs.mkdir(holoDir, { recursive: true })
  await fs.writeFile(path.join(holoDir, 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'realtime-prompt-dismissed': true,
    'app-author': 'Playwright',
    'git-email': 'playwright@example.com',
  }), 'utf8')
  await fs.writeFile(path.join(holoDir, 'recent-folders.json'), JSON.stringify(recentFolders), 'utf8')
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [MAIN_PATH, ...args],
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome, HOLO_APP_DATA_DIR: configHome },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, configHome }
}

/** Dépôt distant + clone local « docs » + clone d'un collègue. */
async function setupRepos(localFolderName = 'docs') {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-links-')))
  const remoteDir = path.join(base, 'remote', 'docs.git')
  const seedDir = path.join(base, 'seed')
  await fs.mkdir(seedDir, { recursive: true })
  await git(seedDir, 'init')
  await git(seedDir, 'config', 'user.name', 'Seed')
  await git(seedDir, 'config', 'user.email', 'seed@example.com')
  await fs.writeFile(path.join(seedDir, 'accueil.md'), '# Accueil\n\nPage existante.\n', 'utf8')
  await git(seedDir, 'add', '-A')
  await git(seedDir, 'commit', '-m', 'init')
  const branch = await git(seedDir, 'rev-parse', '--abbrev-ref', 'HEAD')
  await fs.mkdir(path.dirname(remoteDir), { recursive: true })
  await git(base, 'init', '--bare', remoteDir)
  await git(seedDir, 'remote', 'add', 'origin', remoteDir)
  await git(seedDir, 'push', '-u', 'origin', branch)

  const localDir = path.join(base, localFolderName)
  await git(base, 'clone', remoteDir, localDir)
  await git(localDir, 'config', 'user.name', 'Moi')
  await git(localDir, 'config', 'user.email', 'moi@example.com')
  return { base, remoteDir, seedDir, localDir, branch }
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

async function cleanup(launched: Launched | null, ...dirs: string[]) {
  if (launched) await launched.app.close().catch(() => {})
  for (const dir of [...dirs, launched?.configHome].filter(Boolean) as string[]) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

test.describe('Liens holo://', () => {
  test.setTimeout(90_000)

  test('un lien vers un espace connu ouvre le document', async () => {
    const repos = await setupRepos()
    let launched: Launched | null = null
    try {
      launched = await launchHolo(['holo://docs/accueil.md'], [repos.localDir])
      await expect(paragraph(launched.page, 'Page existante.')).toBeVisible({ timeout: 25_000 })
    } finally {
      await cleanup(launched, repos.base)
    }
  })

  test('un document tout juste créé par un collègue est récupéré avant ouverture', async () => {
    const repos = await setupRepos()
    // Le collègue crée et pousse une nouvelle page, que l'on n'a pas encore localement.
    await fs.writeFile(path.join(repos.seedDir, 'nouvelle-page.md'), '# Nouvelle\n\nCréée à l instant.\n', 'utf8')
    await git(repos.seedDir, 'add', '-A')
    await git(repos.seedDir, 'commit', '-m', 'nouvelle page')
    await git(repos.seedDir, 'push')
    let launched: Launched | null = null
    try {
      launched = await launchHolo(['holo://docs/nouvelle-page.md'], [repos.localDir])
      await expect(paragraph(launched.page, 'Créée à l instant.')).toBeVisible({ timeout: 25_000 })
      expect(await fs.readFile(path.join(repos.localDir, 'nouvelle-page.md'), 'utf8')).toContain('Créée')
    } finally {
      await cleanup(launched, repos.base)
    }
  })

  test('l URL du dépôt dans le lien retrouve l espace même si le dossier local a un autre nom', async () => {
    const repos = await setupRepos('mes-docs-perso')
    let launched: Launched | null = null
    try {
      // L'origine du clone est une URL https (comme sur GitHub / Azure DevOps).
      await git(repos.localDir, 'remote', 'set-url', 'origin', 'https://git.example.com/equipe/docs.git')
      launched = await launchHolo([`holo://docs/accueil.md?remote=${encodeURIComponent('https://git.example.com/equipe/docs')}`], [repos.localDir])
      await expect(paragraph(launched.page, 'Page existante.')).toBeVisible({ timeout: 25_000 })
    } finally {
      await cleanup(launched, repos.base)
    }
  })

  test('un lien vers un dépôt absent propose de le cloner, URL préremplie', async () => {
    let launched: Launched | null = null
    try {
      launched = await launchHolo([`holo://projet-inconnu/guide.md?remote=${encodeURIComponent('https://git.example.com/equipe/projet-inconnu')}`])
      await expect(launched.page.getByText('un dépôt qui n\'est pas encore sur cet ordinateur', { exact: false })).toBeVisible({ timeout: 20_000 })
      await expect(launched.page.locator('input[value="https://git.example.com/equipe/projet-inconnu"]')).toBeVisible()
    } finally {
      await cleanup(launched)
    }
  })

  test('un lien reçu pendant que l app est ouverte ouvre le document sans recharger la fenêtre', async () => {
    const repos = await setupRepos()
    await fs.writeFile(path.join(repos.localDir, 'autre.md'), '# Autre\n\nDeuxième document.\n', 'utf8')
    let launched: Launched | null = null
    try {
      launched = await launchHolo([`--holo-root=${repos.localDir}`, `--holo-file=${path.join(repos.localDir, 'accueil.md')}`], [repos.localDir])
      await expect(paragraph(launched.page, 'Page existante.')).toBeVisible({ timeout: 25_000 })
      await launched.page.evaluate(() => { (window as unknown as { __marker: string }).__marker = 'avant-lien' })

      await launched.page.evaluate(() => (window as unknown as { holo: { openHoloLink: (u: string) => Promise<unknown> } }).holo.openHoloLink('holo://docs/autre.md'))

      await expect(paragraph(launched.page, 'Deuxième document.')).toBeVisible({ timeout: 15_000 })
      expect(await launched.page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('avant-lien')
    } finally {
      await cleanup(launched, repos.base)
    }
  })
})
