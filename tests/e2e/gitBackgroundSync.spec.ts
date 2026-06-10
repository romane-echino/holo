import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')
const execFileAsync = promisify(execFile)

// ─── Helpers git ───────────────────────────────────────────────────────────
async function git(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout.trim()
}

async function configureIdentity(repoDir: string, name: string, email: string) {
  await git(repoDir, 'config', 'user.name', name)
  await git(repoDir, 'config', 'user.email', email)
  await git(repoDir, 'config', 'commit.gpgsign', 'false')
}

const INITIAL_BODY = 'Corps initial du document.'

function docContent(body: string) {
  return ['---', 'title: Doc Sync', '---', '', body, ''].join('\n')
}

/**
 * Crée un dépôt distant (bare) + un clone "espace Holo" + un clone "collègue".
 * Le fichier doc.md est versionné et poussé sur le distant.
 */
async function setupGitRepos() {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-git-sync-')))
  const remoteDir = path.join(base, 'remote.git')
  const workspaceDir = path.join(base, 'workspace')
  const collabDir = path.join(base, 'collab')
  const filePath = path.join(workspaceDir, 'doc.md')

  await fs.mkdir(workspaceDir, { recursive: true })
  await git(workspaceDir, 'init')
  await configureIdentity(workspaceDir, 'Holo Tester', 'tester@example.com')
  await fs.writeFile(filePath, docContent(INITIAL_BODY), 'utf8')
  await git(workspaceDir, 'add', '-A')
  await git(workspaceDir, 'commit', '-m', 'init')
  const branch = await git(workspaceDir, 'rev-parse', '--abbrev-ref', 'HEAD')

  await git(base, 'init', '--bare', remoteDir)
  await git(workspaceDir, 'remote', 'add', 'origin', remoteDir)
  await git(workspaceDir, 'push', '-u', 'origin', branch)

  await git(base, 'clone', remoteDir, collabDir)
  await configureIdentity(collabDir, 'Collab User', 'collab@example.com')

  return { base, remoteDir, workspaceDir, collabDir, filePath, branch }
}

/** Le "collègue" modifie doc.md et pousse sur le distant. */
async function pushRemoteChange(collabDir: string, body: string) {
  await fs.writeFile(path.join(collabDir, 'doc.md'), docContent(body), 'utf8')
  await git(collabDir, 'add', '-A')
  await git(collabDir, 'commit', '-m', 'collab update')
  await git(collabDir, 'push')
}

// ─── Helpers Electron ────────────────────────────────────────────────────────
async function createTempConfigHome() {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-git-sync-config-'))
  const holoDir = path.join(configHome, 'holo')
  await fs.mkdir(holoDir, { recursive: true })
  await fs.writeFile(path.join(holoDir, 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'app-author': 'Holo Tester',
    'git-email': 'tester@example.com',
  }, null, 2), 'utf8')
  return configHome
}

async function launchHolo(args: string[]) {
  const configHome = await createTempConfigHome()
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [MAIN_PATH, ...args],
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, configHome }
}

function paragraph(page: import('@playwright/test').Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

async function fireWindowFocus(page: import('@playwright/test').Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

// ─── Tests ───────────────────────────────────────────────────────────────────
test.describe('Synchronisation git en arrière-plan (fetch + merge)', () => {
  test.setTimeout(90_000)

  test('gitPullIfSafe renvoie "up-to-date" quand aucun changement distant', async () => {
    const repos = await setupGitRepos()
    const launched = await launchHolo([
      `--holo-root=${repos.workspaceDir}`,
      `--holo-file=${repos.filePath}`,
    ])

    try {
      await expect(paragraph(launched.page, INITIAL_BODY)).toBeVisible({ timeout: 25_000 })

      const result = await launched.page.evaluate(
        () => (window as unknown as { holo: { gitPullIfSafe: () => Promise<unknown> } }).holo.gitPullIfSafe(),
      ) as { pulled: boolean; reason: string }

      expect(result.pulled).toBe(false)
      expect(result.reason).toBe('up-to-date')
    } finally {
      await launched.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('avance rapide silencieuse : le document ouvert se recharge tout seul au refocus', async () => {
    const repos = await setupGitRepos()
    const launched = await launchHolo([
      `--holo-root=${repos.workspaceDir}`,
      `--holo-file=${repos.filePath}`,
    ])

    try {
      await expect(paragraph(launched.page, INITIAL_BODY)).toBeVisible({ timeout: 25_000 })

      // À l'ouverture, l'éditeur normalise le markdown puis l'auto-save de l'app
      // commit + pousse cette version. On attend donc que le distant avance et que
      // l'arbre local redevienne propre : c'est la base "sans risque" requise pour
      // une avance rapide silencieuse.
      const initialRemoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await expect
        .poll(async () => git(repos.remoteDir, 'rev-parse', repos.branch), { timeout: 25_000 })
        .not.toBe(initialRemoteTip)
      await expect
        .poll(async () => git(repos.workspaceDir, 'status', '--porcelain'), { timeout: 10_000 })
        .toBe('')

      // Le collègue récupère cette base normalisée puis pousse une modification par-dessus.
      await git(repos.collabDir, '-c', 'pull.rebase=false', 'pull')
      await pushRemoteChange(repos.collabDir, 'Corps mis a jour par le collegue.')

      // Au retour de focus, l'app doit faire un fetch + ff-merge silencieux.
      await fireWindowFocus(launched.page)

      // Le contenu distant apparaît dans l'éditeur sans intervention.
      await expect(paragraph(launched.page, 'Corps mis a jour par le collegue.')).toBeVisible({ timeout: 20_000 })
      // Et le fichier sur disque a bien été mis à jour.
      await expect
        .poll(async () => fs.readFile(repos.filePath, 'utf8'), { timeout: 10_000 })
        .toContain('Corps mis a jour par le collegue.')
      // Aucune bannière puisque la récupération s'est faite sans risque.
      await expect(launched.page.getByRole('button', { name: 'Récupérer' })).toBeHidden()
    } finally {
      await launched.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('changements locaux non commités : bannière douce au lieu d un pull risqué', async () => {
    const repos = await setupGitRepos()
    const launched = await launchHolo([
      `--holo-root=${repos.workspaceDir}`,
      `--holo-file=${repos.filePath}`,
    ])

    try {
      await expect(paragraph(launched.page, INITIAL_BODY)).toBeVisible({ timeout: 25_000 })

      // Modification locale non commitée (fichier non suivi) → arbre "sale".
      await fs.writeFile(path.join(repos.workspaceDir, 'brouillon.md'), '# wip\n', 'utf8')
      // Et un changement distant sur le document ouvert.
      await pushRemoteChange(repos.collabDir, 'Corps modifie a distance pendant edition.')

      await fireWindowFocus(launched.page)

      // La bannière apparaît, on ne touche pas au travail local.
      await expect(launched.page.getByRole('button', { name: 'Récupérer' })).toBeVisible({ timeout: 20_000 })
      // Le document affiché n'a PAS été remplacé silencieusement.
      await expect(paragraph(launched.page, INITIAL_BODY)).toBeVisible()
      await expect
        .poll(async () => fs.readFile(repos.filePath, 'utf8'), { timeout: 5_000 })
        .toContain(INITIAL_BODY)
    } finally {
      await launched.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('gitPullIfSafe renvoie "diverged" quand commits locaux et distants coexistent', async () => {
    const repos = await setupGitRepos()
    const launched = await launchHolo([
      `--holo-root=${repos.workspaceDir}`,
      `--holo-file=${repos.filePath}`,
    ])

    try {
      await expect(paragraph(launched.page, INITIAL_BODY)).toBeVisible({ timeout: 25_000 })

      // Commit local non poussé (arbre propre, mais en avance).
      await fs.writeFile(repos.filePath, docContent('Corps modifie en local et commite.'), 'utf8')
      await git(repos.workspaceDir, 'add', '-A')
      await git(repos.workspaceDir, 'commit', '-m', 'local non pousse')

      // Le collègue pousse un autre commit → divergence.
      await pushRemoteChange(repos.collabDir, 'Corps modifie a distance.')

      const result = await launched.page.evaluate(
        () => (window as unknown as { holo: { gitPullIfSafe: () => Promise<unknown> } }).holo.gitPullIfSafe(),
      ) as { pulled: boolean; reason: string; incoming: number; outgoing: number }

      expect(result.pulled).toBe(false)
      expect(result.reason).toBe('diverged')
      expect(result.incoming).toBeGreaterThan(0)
      expect(result.outgoing).toBeGreaterThan(0)
    } finally {
      await launched.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })
})
