import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
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

// Document seed contenant un tableau Markdown GFM (2 colonnes, une ligne de
// données). Les trois utilisateurs ajouteront chacun leur ligne à ce tableau.
function tableDocContent() {
  return [
    '---', 'title: Tableau Collab', '---', '',
    '# Suivi des tâches', '',
    '| Nom | Tâche |',
    '| --- | --- |',
    '| Init | Départ |', '',
    'Fin du document.', '',
  ].join('\n')
}

/** Crée un dépôt distant (bare) avec le document tableau déjà poussé. */
async function setupRemote() {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-table-')))
  const remoteDir = path.join(base, 'remote.git')
  const seedDir = path.join(base, 'seed')

  await fs.mkdir(seedDir, { recursive: true })
  await git(seedDir, 'init')
  await configureIdentity(seedDir, 'Seed', 'seed@example.com')
  await fs.writeFile(path.join(seedDir, 'doc.md'), tableDocContent(), 'utf8')
  await git(seedDir, 'add', '-A')
  await git(seedDir, 'commit', '-m', 'init')
  const branch = await git(seedDir, 'rev-parse', '--abbrev-ref', 'HEAD')

  await git(base, 'init', '--bare', remoteDir)
  await git(seedDir, 'remote', 'add', 'origin', remoteDir)
  await git(seedDir, 'push', '-u', 'origin', branch)

  return { base, remoteDir, branch }
}

/** Clone le distant dans un nouveau dossier pour un utilisateur donné. */
async function cloneFor(base: string, remoteDir: string, dirName: string, name: string, email: string) {
  const cloneDir = path.join(base, dirName)
  await git(base, 'clone', remoteDir, cloneDir)
  await configureIdentity(cloneDir, name, email)
  return { cloneDir, file: path.join(cloneDir, 'doc.md') }
}

// ─── Helpers Electron ────────────────────────────────────────────────────────
async function createTempConfigHome(author: string, email: string) {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-table-config-'))
  const holoDir = path.join(configHome, 'holo')
  await fs.mkdir(holoDir, { recursive: true })
  await fs.writeFile(path.join(holoDir, 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'app-author': author,
    'git-email': email,
  }, null, 2), 'utf8')
  return configHome
}

async function launchHolo(args: string[], author: string, email: string) {
  const configHome = await createTempConfigHome(author, email)
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

/** Cellules de données du tableau (hors en-tête), dans l'ordre ligne par ligne. */
function tableCells(page: Page) {
  return page.locator('[data-block-type="table-cell"][contenteditable]')
}

/**
 * Ajoute une ligne au tableau via le bouton « Ajouter une ligne », puis saisit
 * `name` dans la première colonne et `task` dans la seconde. Sort de l'éditeur
 * pour déclencher l'écriture disque + l'auto-save git.
 */
async function addTableRow(page: Page, name: string, task: string) {
  const cells = tableCells(page)
  const before = await cells.count()
  await page.getByRole('button', { name: 'Ajouter une ligne', exact: true }).click()
  await expect(cells).toHaveCount(before + 2, { timeout: 15_000 })

  const nameCell = cells.nth(before)
  await nameCell.click()
  await page.keyboard.type(name)

  const taskCell = cells.nth(before + 1)
  await taskCell.click()
  await page.keyboard.type(task)

  // Sortir de l'éditeur (clic dans le titre) pour persister la cellule.
  await page.locator('textarea[placeholder="Untitled"]').first().click()
}

/** Attend que le document distant contienne toutes les chaînes fournies. */
async function waitRemoteContains(remoteDir: string, branch: string, ...needles: string[]) {
  await expect
    .poll(async () => {
      const doc = await git(remoteDir, 'show', `${branch}:doc.md`).catch(() => '')
      return needles.every((needle) => doc.includes(needle))
    }, { timeout: 30_000 })
    .toBe(true)
}

// ─── Helpers conflit ──────────────────────────────────────────────────────────
async function fireWindowFocus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** Attend qu un nouveau commit local soit produit (auto-save). */
async function waitForNewLocalCommit(repoDir: string, previousHead: string) {
  await expect
    .poll(() => git(repoDir, 'rev-parse', 'HEAD'), { timeout: 20_000 })
    .not.toBe(previousHead)
}

/** Attend que le distant avance (push réussi). */
async function waitForRemoteAdvance(remoteDir: string, branch: string, previousTip: string) {
  await expect
    .poll(() => git(remoteDir, 'rev-parse', branch), { timeout: 20_000 })
    .not.toBe(previousTip)
}

/** Attend que l instance ait poussé sa base normalisée : arbre propre + HEAD == distant. */
async function waitForBaselineSynced(repoDir: string, remoteDir: string, branch: string) {
  await expect
    .poll(async () => {
      const status = await git(repoDir, 'status', '--porcelain')
      const head = await git(repoDir, 'rev-parse', 'HEAD')
      const tip = await git(remoteDir, 'rev-parse', branch)
      return status === '' && head === tip
    }, { timeout: 25_000 })
    .toBe(true)
}

// ─── Test ────────────────────────────────────────────────────────────────────
test.describe('Collaboration sur un tableau (trois utilisateurs, même dépôt)', () => {
  test.setTimeout(180_000)

  test('trois utilisateurs ajoutent chacun une ligne de données : le tableau final les réunit', async () => {
    const repo = await setupRemote()
    const instances: Array<{ app: ElectronApplication; configHome: string }> = []
    const tempConfigs: string[] = []

    try {
      // ── Utilisateur 1 : Alice ───────────────────────────────────────────────
      const aliceClone = await cloneFor(repo.base, repo.remoteDir, 'alice', 'Alice', 'alice@example.com')
      const alice = await launchHolo(
        [`--holo-root=${aliceClone.cloneDir}`, `--holo-file=${aliceClone.file}`],
        'Alice', 'alice@example.com',
      )
      tempConfigs.push(alice.configHome)
      // La ligne initiale doit être visible (tableau bien monté).
      await expect(tableCells(alice.page).first()).toBeVisible({ timeout: 30_000 })
      await expect.poll(() => tableCells(alice.page).count(), { timeout: 20_000 }).toBe(2)

      await addTableRow(alice.page, 'Alice', 'Rédaction')
      await waitRemoteContains(repo.remoteDir, repo.branch, 'Alice', 'Rédaction')
      await alice.app.close()

      // ── Utilisateur 2 : Bob (clone après le push d'Alice) ───────────────────
      const bobClone = await cloneFor(repo.base, repo.remoteDir, 'bob', 'Bob', 'bob@example.com')
      const bob = await launchHolo(
        [`--holo-root=${bobClone.cloneDir}`, `--holo-file=${bobClone.file}`],
        'Bob', 'bob@example.com',
      )
      tempConfigs.push(bob.configHome)
      // Bob voit déjà la ligne d'Alice (3 cellules de données = init + Alice… non,
      // 2 colonnes × 2 lignes = 4 cellules).
      await expect.poll(() => tableCells(bob.page).count(), { timeout: 30_000 }).toBe(4)

      await addTableRow(bob.page, 'Bob', 'Relecture')
      await waitRemoteContains(repo.remoteDir, repo.branch, 'Alice', 'Rédaction', 'Bob', 'Relecture')
      await bob.app.close()

      // ── Utilisateur 3 : Charlie (clone après le push de Bob) ────────────────
      const charlieClone = await cloneFor(repo.base, repo.remoteDir, 'charlie', 'Charlie', 'charlie@example.com')
      const charlie = await launchHolo(
        [`--holo-root=${charlieClone.cloneDir}`, `--holo-file=${charlieClone.file}`],
        'Charlie', 'charlie@example.com',
      )
      tempConfigs.push(charlie.configHome)
      await expect.poll(() => tableCells(charlie.page).count(), { timeout: 30_000 }).toBe(6)

      await addTableRow(charlie.page, 'Charlie', 'Validation')
      await waitRemoteContains(
        repo.remoteDir, repo.branch,
        'Alice', 'Rédaction', 'Bob', 'Relecture', 'Charlie', 'Validation',
      )
      await charlie.app.close()

      // ── Vérification finale : le tableau distant réunit les trois lignes ────
      const finalDoc = await git(repo.remoteDir, 'show', `${repo.branch}:doc.md`)
      expect(finalDoc).toContain('| Nom | Tâche |')
      for (const value of ['Init', 'Départ', 'Alice', 'Rédaction', 'Bob', 'Relecture', 'Charlie', 'Validation']) {
        expect(finalDoc).toContain(value)
      }
      // Le tableau contient 4 lignes de données (init + 3 contributions) :
      // une ligne par valeur de la première colonne.
      for (const name of ['Init', 'Alice', 'Bob', 'Charlie']) {
        const rowLine = finalDoc.split('\n').find((line) => line.includes('|') && line.includes(name))
        expect(rowLine, `ligne du tableau pour ${name}`).toBeTruthy()
      }
      // Aucun marqueur de conflit ne doit subsister.
      expect(finalDoc).not.toContain('<<<<<<<')
      expect(finalDoc).not.toContain('>>>>>>>')
    } finally {
      for (const inst of instances) await inst.app.close().catch(() => {})
      await fs.rm(repo.base, { recursive: true, force: true }).catch(() => {})
      for (const cfg of tempConfigs) await fs.rm(cfg, { recursive: true, force: true }).catch(() => {})
    }
  })
})

// ─── Test conflit structuré sur un tableau ────────────────────────────────────
test.describe('Conflit structuré sur un tableau (deux utilisateurs, même tableau)', () => {
  test.setTimeout(180_000)

  test('deux utilisateurs ajoutent une ligne en même temps : la résolution produit un tableau valide', async () => {
    const repo = await setupRemote()
    let alice: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let bob: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let bobDir = ''
    let bobFile = ''

    try {
      // 1. Alice ouvre le dépôt et pousse sa base normalisée.
      const aliceClone = await cloneFor(repo.base, repo.remoteDir, 'alice', 'Alice', 'alice@example.com')
      alice = await launchHolo(
        [`--holo-root=${aliceClone.cloneDir}`, `--holo-file=${aliceClone.file}`],
        'Alice', 'alice@example.com',
      )
      await expect(tableCells(alice.page).first()).toBeVisible({ timeout: 30_000 })
      await waitForBaselineSynced(aliceClone.cloneDir, repo.remoteDir, repo.branch)

      // 2. Bob clone la même base et l ouvre.
      const bobClone = await cloneFor(repo.base, repo.remoteDir, 'bob', 'Bob', 'bob@example.com')
      bobDir = bobClone.cloneDir
      bobFile = bobClone.file
      bob = await launchHolo(
        [`--holo-root=${bobDir}`, `--holo-file=${bobFile}`],
        'Bob', 'bob@example.com',
      )
      await expect.poll(() => tableCells(bob.page).count(), { timeout: 30_000 }).toBe(2)
      await expect.poll(() => git(bobDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice ajoute une ligne au tableau et pousse.
      const remoteTip = await git(repo.remoteDir, 'rev-parse', repo.branch)
      await addTableRow(alice.page, 'Alice', 'Redaction')
      await waitForRemoteAdvance(repo.remoteDir, repo.branch, remoteTip)

      // 4. Bob ajoute SA ligne au MÊME tableau → commit local, en retard → divergence.
      const bobBaseHead = await git(bobDir, 'rev-parse', 'HEAD')
      await addTableRow(bob.page, 'Bob', 'Relecture')
      await waitForNewLocalCommit(bobDir, bobBaseHead)

      // 5. Bannière douce chez Bob → conflit détecté lors de la récupération.
      await fireWindowFocus(bob.page)
      const recuperer = bob.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })
      await recuperer.click()
      await expect(bob.page.getByText('Conflit détecté', { exact: false })).toBeVisible({ timeout: 25_000 })

      // 6. Ouvrir la résolution et garder MA version (celle de Bob).
      const resoudre = bob.page.getByRole('button', { name: 'Résoudre le conflit', exact: true })
      await expect(resoudre).toBeVisible({ timeout: 20_000 })
      await resoudre.click({ force: true })
      await expect(bob.page.getByText('Conflit de fusion', { exact: false })).toBeVisible({ timeout: 10_000 })
      await bob.page.getByRole('button', { name: 'Garder ma version', exact: true }).click({ force: true })

      // 7. Le rebase se termine et l arbre redevient propre.
      await expect
        .poll(() => git(bobDir, 'status', '--porcelain'), { timeout: 30_000 })
        .toBe('')

      // 8. Le fichier résolu est un tableau Markdown VALIDE, sans marqueurs.
      const resolved = await fs.readFile(bobFile, 'utf8')
      expect(resolved).not.toContain('<<<<<<<')
      expect(resolved).not.toContain('=======')
      expect(resolved).not.toContain('>>>>>>>')
      expect(resolved).toContain('Bob')
      expect(resolved).toContain('Relecture')

      // En-tête de tableau présent une seule fois, suivi d une ligne de séparation.
      const lines = resolved.split('\n')
      const headerLines = lines.filter((l) => l.includes('Nom') && l.includes('Tâche') && l.trim().startsWith('|'))
      expect(headerLines).toHaveLength(1)
      const headerIndex = lines.findIndex((l) => l === headerLines[0])
      const separator = lines[headerIndex + 1] ?? ''
      expect(separator).toMatch(/^\|[\s:|-]+\|$/)

      // Chaque ligne de données reste bien formée (commence et finit par « | »).
      const dataRows = lines.filter((l) => l.trim().startsWith('|') && /\| (Init|Bob) /.test(l))
      expect(dataRows.length).toBeGreaterThanOrEqual(2)
      for (const row of dataRows) {
        expect(row.trim().startsWith('|')).toBe(true)
        expect(row.trim().endsWith('|')).toBe(true)
      }

      // 9. La version de Bob a bien été poussée sur le distant.
      await waitRemoteContains(repo.remoteDir, repo.branch, 'Bob', 'Relecture')

      // 10. L éditeur affiche toujours un tableau cohérent (≥ 2 lignes de données).
      await expect.poll(() => tableCells(bob.page).count(), { timeout: 20_000 }).toBeGreaterThanOrEqual(4)
      await expect(bob.page.getByText('conflits de fusion non résolus', { exact: false })).toHaveCount(0)
    } finally {
      if (alice) {
        await alice.app.close()
        await fs.rm(alice.configHome, { recursive: true, force: true }).catch(() => {})
      }
      if (bob) {
        await bob.app.close()
        await fs.rm(bob.configHome, { recursive: true, force: true }).catch(() => {})
      }
      await fs.rm(repo.base, { recursive: true, force: true }).catch(() => {})
    }
  })
})
