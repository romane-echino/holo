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

const LINE_A = 'Ligne Alice initiale.'
const LINE_B = 'Ligne Bob initiale.'

// Des paragraphes tampons séparent les deux lignes éditées de plus de 3 lignes,
// pour que des éditions sur des lignes distinctes fusionnent sans conflit git
// (le contexte de diff par défaut est de 3 lignes).
function docContent(lineA: string, lineB: string) {
  return [
    '---', 'title: Doc Collab', '---', '',
    lineA, '',
    'Paragraphe tampon un.', '',
    'Paragraphe tampon deux.', '',
    'Paragraphe tampon trois.', '',
    'Paragraphe tampon quatre.', '',
    lineB, '',
  ].join('\n')
}

/**
 * Crée un dépôt distant (bare) et un premier clone "instanceA".
 * doc.md contient deux paragraphes distincts (ligne Alice / ligne Bob).
 */
async function setupRemoteAndCloneA() {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-collab-')))
  const remoteDir = path.join(base, 'remote.git')
  const seedDir = path.join(base, 'seed')
  const cloneADir = path.join(base, 'instanceA')

  await fs.mkdir(seedDir, { recursive: true })
  await git(seedDir, 'init')
  await configureIdentity(seedDir, 'Seed', 'seed@example.com')
  await fs.writeFile(path.join(seedDir, 'doc.md'), docContent(LINE_A, LINE_B), 'utf8')
  await git(seedDir, 'add', '-A')
  await git(seedDir, 'commit', '-m', 'init')
  const branch = await git(seedDir, 'rev-parse', '--abbrev-ref', 'HEAD')

  await git(base, 'init', '--bare', remoteDir)
  await git(seedDir, 'remote', 'add', 'origin', remoteDir)
  await git(seedDir, 'push', '-u', 'origin', branch)

  await git(base, 'clone', remoteDir, cloneADir)
  await configureIdentity(cloneADir, 'Alice', 'alice@example.com')

  return { base, remoteDir, branch, cloneADir, fileA: path.join(cloneADir, 'doc.md') }
}

/** Clone le distant (qui contient déjà la base normalisée poussée par A). */
async function cloneB(base: string, remoteDir: string) {
  const cloneBDir = path.join(base, 'instanceB')
  await git(base, 'clone', remoteDir, cloneBDir)
  await configureIdentity(cloneBDir, 'Bob', 'bob@example.com')
  return { cloneBDir, fileB: path.join(cloneBDir, 'doc.md') }
}

// ─── Helpers Electron ────────────────────────────────────────────────────────
async function createTempConfigHome(author: string, email: string) {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-collab-config-'))
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

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

async function fireWindowFocus(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** Édite le paragraphe contenant `target` en lui ajoutant `suffix` à la fin. */
async function appendToParagraph(page: Page, target: string, suffix: string) {
  const block = paragraph(page, target)
  await expect(block).toBeVisible({ timeout: 20_000 })
  await block.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
  // Sortir de l'éditeur pour déclencher l'écriture disque puis l'auto-save git.
  await page.locator('textarea[placeholder="Untitled"]').first().click()
}

/** Attend que l'auto-save de l'instance produise un nouveau commit local. */
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

/** Attend que l'instance ait poussé sa base normalisée : arbre propre + HEAD == distant. */
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

// ─── Tests ───────────────────────────────────────────────────────────────────
test.describe('Édition concurrente d un fichier (deux instances Holo, même dépôt)', () => {
  test.setTimeout(150_000)

  test('chacun édite une ligne différente : la fusion réunit les deux versions sans conflit', async () => {
    const repos = await setupRemoteAndCloneA()
    let instanceA: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let instanceB: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let cloneBDir = ''
    let fileB = ''

    try {
      // 1. Instance A ouvre le doc et pousse sa base normalisée.
      instanceA = await launchHolo(
        [`--holo-root=${repos.cloneADir}`, `--holo-file=${repos.fileA}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instanceA.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await waitForBaselineSynced(repos.cloneADir, repos.remoteDir, repos.branch)

      // 2. Instance B clone APRÈS la base normalisée (donc point de départ identique).
      const cb = await cloneB(repos.base, repos.remoteDir)
      cloneBDir = cb.cloneBDir
      fileB = cb.fileB
      instanceB = await launchHolo(
        [`--holo-root=${cloneBDir}`, `--holo-file=${fileB}`],
        'Bob', 'bob@example.com',
      )
      await expect(paragraph(instanceB.page, LINE_B)).toBeVisible({ timeout: 25_000 })
      await expect.poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice modifie SA ligne et pousse.
      const remoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await appendToParagraph(instanceA.page, LINE_A, ' (modif Alice)')
      await waitForRemoteAdvance(repos.remoteDir, repos.branch, remoteTip)

      // 4. Bob modifie une AUTRE ligne → commit local, push refusé (en retard) → divergence.
      const bobBaseHead = await git(cloneBDir, 'rev-parse', 'HEAD')
      await appendToParagraph(instanceB.page, LINE_B, ' (modif Bob)')
      await waitForNewLocalCommit(cloneBDir, bobBaseHead)

      // 5. La sync de fond chez Bob détecte la divergence → bannière douce "Récupérer".
      await fireWindowFocus(instanceB.page)
      const recuperer = instanceB.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })

      // 6. Bob clique "Récupérer" → rebase fusionne les deux lignes (pas de conflit).
      await recuperer.click()

      // 7. L'éditeur de Bob se recharge avec les DEUX modifications.
      await expect(paragraph(instanceB.page, `${LINE_A} (modif Alice)`)).toBeVisible({ timeout: 25_000 })
      await expect(paragraph(instanceB.page, `${LINE_B} (modif Bob)`)).toBeVisible({ timeout: 25_000 })

      // Disque + distant contiennent les deux versions.
      const diskB = await fs.readFile(fileB, 'utf8')
      expect(diskB).toContain('(modif Alice)')
      expect(diskB).toContain('(modif Bob)')
      await expect
        .poll(async () => (await git(cloneBDir, 'rev-parse', 'HEAD')) === (await git(repos.remoteDir, 'rev-parse', repos.branch)), { timeout: 15_000 })
        .toBe(true)

      // 8. Côté Alice : avance rapide silencieuse au refocus → elle voit la ligne de Bob.
      await fireWindowFocus(instanceA.page)
      await expect(paragraph(instanceA.page, `${LINE_B} (modif Bob)`)).toBeVisible({ timeout: 25_000 })
      await expect(paragraph(instanceA.page, `${LINE_A} (modif Alice)`)).toBeVisible({ timeout: 25_000 })
    } finally {
      if (instanceA) await instanceA.app.close()
      if (instanceB) await instanceB.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      if (instanceA) await fs.rm(instanceA.configHome, { recursive: true, force: true })
      if (instanceB) await fs.rm(instanceB.configHome, { recursive: true, force: true })
    }
  })

  test('chacun édite la même ligne : un conflit est détecté et signalé', async () => {
    const repos = await setupRemoteAndCloneA()
    let instanceA: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let instanceB: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let cloneBDir = ''
    let fileB = ''

    try {
      // 1. Instance A : base normalisée poussée.
      instanceA = await launchHolo(
        [`--holo-root=${repos.cloneADir}`, `--holo-file=${repos.fileA}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instanceA.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await waitForBaselineSynced(repos.cloneADir, repos.remoteDir, repos.branch)

      // 2. Instance B clone la même base.
      const cb = await cloneB(repos.base, repos.remoteDir)
      cloneBDir = cb.cloneBDir
      fileB = cb.fileB
      instanceB = await launchHolo(
        [`--holo-root=${cloneBDir}`, `--holo-file=${fileB}`],
        'Bob', 'bob@example.com',
      )
      await expect(paragraph(instanceB.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await expect.poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice modifie la ligne A et pousse.
      const remoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await appendToParagraph(instanceA.page, LINE_A, ' (version Alice)')
      await waitForRemoteAdvance(repos.remoteDir, repos.branch, remoteTip)

      // 4. Bob modifie LA MÊME ligne A → commit local, en retard → divergence.
      const bobBaseHead = await git(cloneBDir, 'rev-parse', 'HEAD')
      await appendToParagraph(instanceB.page, LINE_A, ' (version Bob)')
      await waitForNewLocalCommit(cloneBDir, bobBaseHead)

      // 5. Bannière douce chez Bob.
      await fireWindowFocus(instanceB.page)
      const recuperer = instanceB.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })

      // 6. Récupérer → rebase impossible (même ligne) → conflit signalé sans casser l app.
      await recuperer.click()
      await expect(instanceB.page.getByText('Conflit détecté', { exact: false })).toBeVisible({ timeout: 25_000 })
    } finally {
      if (instanceA) await instanceA.app.close()
      if (instanceB) await instanceB.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      if (instanceA) await fs.rm(instanceA.configHome, { recursive: true, force: true })
      if (instanceB) await fs.rm(instanceB.configHome, { recursive: true, force: true })
    }
  })

  test('conflit sur la même ligne : « Garder ma version » conserve bien MA version, termine le rebase et pousse', async () => {
    const repos = await setupRemoteAndCloneA()
    let instanceA: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let instanceB: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let cloneBDir = ''
    let fileB = ''

    try {
      // 1. Instance A : base normalisée poussée.
      instanceA = await launchHolo(
        [`--holo-root=${repos.cloneADir}`, `--holo-file=${repos.fileA}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instanceA.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await waitForBaselineSynced(repos.cloneADir, repos.remoteDir, repos.branch)

      // 2. Instance B clone la même base.
      const cb = await cloneB(repos.base, repos.remoteDir)
      cloneBDir = cb.cloneBDir
      fileB = cb.fileB
      instanceB = await launchHolo(
        [`--holo-root=${cloneBDir}`, `--holo-file=${fileB}`],
        'Bob', 'bob@example.com',
      )
      await expect(paragraph(instanceB.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await expect.poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice modifie la ligne A et pousse.
      const remoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await appendToParagraph(instanceA.page, LINE_A, ' (version Alice)')
      await waitForRemoteAdvance(repos.remoteDir, repos.branch, remoteTip)

      // 4. Bob modifie LA MÊME ligne A → commit local, en retard → divergence.
      const bobBaseHead = await git(cloneBDir, 'rev-parse', 'HEAD')
      await appendToParagraph(instanceB.page, LINE_A, ' (version Bob)')
      await waitForNewLocalCommit(cloneBDir, bobBaseHead)

      // 5. Récupérer → conflit détecté.
      await fireWindowFocus(instanceB.page)
      const recuperer = instanceB.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })
      await recuperer.click()
      await expect(instanceB.page.getByText('Conflit détecté', { exact: false })).toBeVisible({ timeout: 25_000 })

      // 6. Ouvrir la résolution de conflit dans l éditeur.
      const resoudre = instanceB.page.getByRole('button', { name: 'Résoudre le conflit', exact: true })
      await expect(resoudre).toBeVisible({ timeout: 20_000 })
      await resoudre.click({ force: true })

      // 7. La modale s ouvre ; on conserve MA version (celle de Bob).
      await expect(instanceB.page.getByText('Conflit de fusion', { exact: false })).toBeVisible({ timeout: 10_000 })
      // La colonne « Ma version » doit afficher la modification de Bob (inversion rebase gérée).
      await expect(instanceB.page.locator('pre').filter({ hasText: '(version Bob)' }).first()).toBeVisible({ timeout: 10_000 })
      await instanceB.page.getByRole('button', { name: 'Garder ma version', exact: true }).click({ force: true })

      // 8. Le rebase se termine et l arbre redevient propre (le push éventuel de
      // suivi de l auto-save peut ajouter un commit : on ne fige donc pas HEAD==tip).
      await expect
        .poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 30_000 })
        .toBe('')

      // 9. Le fichier ne contient plus de marqueurs et garde la version de Bob.
      const resolved = await fs.readFile(fileB, 'utf8')
      expect(resolved).not.toContain('<<<<<<<')
      expect(resolved).toContain('(version Bob)')
      expect(resolved).not.toContain('(version Alice)')

      // 9b. La version de Bob a bien été poussée sur le distant.
      await expect
        .poll(() => git(repos.remoteDir, 'show', `${repos.branch}:doc.md`), { timeout: 30_000 })
        .toContain('(version Bob)')

      // 10. L éditeur affiche la version de Bob et le bandeau de conflit a disparu.
      await expect(paragraph(instanceB.page, 'version Bob')).toBeVisible({ timeout: 20_000 })
      await expect(instanceB.page.getByText('conflits de fusion non résolus', { exact: false })).toHaveCount(0)
    } finally {
      if (instanceA) await instanceA.app.close()
      if (instanceB) await instanceB.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      if (instanceA) await fs.rm(instanceA.configHome, { recursive: true, force: true })
      if (instanceB) await fs.rm(instanceB.configHome, { recursive: true, force: true })
    }
  })

  test('conflit sur la même ligne : « Résoudre manuellement » applique l édition brute et termine le rebase', async () => {
    const repos = await setupRemoteAndCloneA()
    let instanceA: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let instanceB: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let cloneBDir = ''
    let fileB = ''

    try {
      // 1. Instance A : base normalisée poussée.
      instanceA = await launchHolo(
        [`--holo-root=${repos.cloneADir}`, `--holo-file=${repos.fileA}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instanceA.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await waitForBaselineSynced(repos.cloneADir, repos.remoteDir, repos.branch)

      // 2. Instance B clone la même base.
      const cb = await cloneB(repos.base, repos.remoteDir)
      cloneBDir = cb.cloneBDir
      fileB = cb.fileB
      instanceB = await launchHolo(
        [`--holo-root=${cloneBDir}`, `--holo-file=${fileB}`],
        'Bob', 'bob@example.com',
      )
      await expect(paragraph(instanceB.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await expect.poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice modifie la ligne A et pousse.
      const remoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await appendToParagraph(instanceA.page, LINE_A, ' (version Alice)')
      await waitForRemoteAdvance(repos.remoteDir, repos.branch, remoteTip)

      // 4. Bob modifie LA MÊME ligne A → divergence.
      const bobBaseHead = await git(cloneBDir, 'rev-parse', 'HEAD')
      await appendToParagraph(instanceB.page, LINE_A, ' (version Bob)')
      await waitForNewLocalCommit(cloneBDir, bobBaseHead)

      // 5. Récupérer → conflit détecté.
      await fireWindowFocus(instanceB.page)
      const recuperer = instanceB.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })
      await recuperer.click()
      await expect(instanceB.page.getByText('Conflit détecté', { exact: false })).toBeVisible({ timeout: 25_000 })

      // 6. Ouvrir la modale puis basculer en résolution manuelle.
      const resoudre = instanceB.page.getByRole('button', { name: 'Résoudre le conflit', exact: true })
      await expect(resoudre).toBeVisible({ timeout: 20_000 })
      await resoudre.click({ force: true })
      await expect(instanceB.page.getByText('Conflit de fusion', { exact: false })).toBeVisible({ timeout: 10_000 })
      await instanceB.page.getByRole('button', { name: 'Résoudre manuellement', exact: true }).click({ force: true })

      // 7. L éditeur passe en mode brut : on retire les marqueurs en gardant les deux versions.
      const rawArea = instanceB.page.locator('textarea.font-mono')
      await expect(rawArea).toBeVisible({ timeout: 10_000 })
      const raw = await rawArea.inputValue()
      expect(raw).toContain('<<<<<<<')
      const resolvedText = raw
        .split('\n')
        .filter((l) => !/^(<{7}|={7}|>{7})/.test(l))
        .join('\n')
      await rawArea.fill(resolvedText)

      // 8. Terminer la résolution → git add + rebase --continue + push.
      await instanceB.page.getByRole('button', { name: 'Terminer la résolution', exact: true }).click()

      // 9. L arbre redevient propre.
      await expect
        .poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 30_000 })
        .toBe('')

      // 10. Le fichier ne contient plus de marqueurs et garde LES DEUX versions.
      const resolved = await fs.readFile(fileB, 'utf8')
      expect(resolved).not.toContain('<<<<<<<')
      expect(resolved).not.toContain('>>>>>>>')
      expect(resolved).toContain('(version Bob)')
      expect(resolved).toContain('(version Alice)')

      // 11. Les deux versions sont poussées sur le distant.
      await expect
        .poll(() => git(repos.remoteDir, 'show', `${repos.branch}:doc.md`), { timeout: 30_000 })
        .toContain('(version Alice)')

      // 12. Plus de bandeau de conflit dans l éditeur.
      await expect(instanceB.page.getByText('conflits de fusion non résolus', { exact: false })).toHaveCount(0)
    } finally {
      if (instanceA) await instanceA.app.close()
      if (instanceB) await instanceB.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      if (instanceA) await fs.rm(instanceA.configHome, { recursive: true, force: true })
      if (instanceB) await fs.rm(instanceB.configHome, { recursive: true, force: true })
    }
  })

  test('conflit sur la même ligne : « Prendre la version distante » conserve la version distante, termine le rebase et pousse', async () => {
    const repos = await setupRemoteAndCloneA()
    let instanceA: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let instanceB: { app: ElectronApplication; page: Page; configHome: string } | null = null
    let cloneBDir = ''
    let fileB = ''

    try {
      // 1. Instance A : base normalisée poussée.
      instanceA = await launchHolo(
        [`--holo-root=${repos.cloneADir}`, `--holo-file=${repos.fileA}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instanceA.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await waitForBaselineSynced(repos.cloneADir, repos.remoteDir, repos.branch)

      // 2. Instance B clone la même base.
      const cb = await cloneB(repos.base, repos.remoteDir)
      cloneBDir = cb.cloneBDir
      fileB = cb.fileB
      instanceB = await launchHolo(
        [`--holo-root=${cloneBDir}`, `--holo-file=${fileB}`],
        'Bob', 'bob@example.com',
      )
      await expect(paragraph(instanceB.page, LINE_A)).toBeVisible({ timeout: 25_000 })
      await expect.poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 15_000 }).toBe('')

      // 3. Alice modifie la ligne A et pousse (= version distante).
      const remoteTip = await git(repos.remoteDir, 'rev-parse', repos.branch)
      await appendToParagraph(instanceA.page, LINE_A, ' (version Alice)')
      await waitForRemoteAdvance(repos.remoteDir, repos.branch, remoteTip)

      // 4. Bob modifie LA MÊME ligne A → commit local, en retard → divergence.
      const bobBaseHead = await git(cloneBDir, 'rev-parse', 'HEAD')
      await appendToParagraph(instanceB.page, LINE_A, ' (version Bob)')
      await waitForNewLocalCommit(cloneBDir, bobBaseHead)

      // 5. Récupérer → conflit détecté.
      await fireWindowFocus(instanceB.page)
      const recuperer = instanceB.page.getByRole('button', { name: 'Récupérer', exact: true })
      await expect(recuperer).toBeVisible({ timeout: 20_000 })
      await recuperer.click()
      await expect(instanceB.page.getByText('Conflit détecté', { exact: false })).toBeVisible({ timeout: 25_000 })

      // 6. Ouvrir la résolution de conflit dans l éditeur.
      const resoudre = instanceB.page.getByRole('button', { name: 'Résoudre le conflit', exact: true })
      await expect(resoudre).toBeVisible({ timeout: 20_000 })
      await resoudre.click({ force: true })

      // 7. La modale s ouvre ; on prend la VERSION DISTANTE (celle d Alice).
      await expect(instanceB.page.getByText('Conflit de fusion', { exact: false })).toBeVisible({ timeout: 10_000 })
      // La colonne « Version distante » doit afficher la modification d Alice (inversion rebase gérée).
      await expect(instanceB.page.locator('pre').filter({ hasText: '(version Alice)' }).first()).toBeVisible({ timeout: 10_000 })
      await instanceB.page.getByRole('button', { name: 'Prendre la version distante', exact: true }).click({ force: true })

      // 8. Le rebase se termine et l arbre redevient propre.
      await expect
        .poll(() => git(cloneBDir, 'status', '--porcelain'), { timeout: 30_000 })
        .toBe('')

      // 9. Le fichier ne contient plus de marqueurs et garde la version d Alice.
      const resolved = await fs.readFile(fileB, 'utf8')
      expect(resolved).not.toContain('<<<<<<<')
      expect(resolved).toContain('(version Alice)')
      expect(resolved).not.toContain('(version Bob)')

      // 9b. La version d Alice reste bien celle du distant.
      await expect
        .poll(() => git(repos.remoteDir, 'show', `${repos.branch}:doc.md`), { timeout: 30_000 })
        .toContain('(version Alice)')

      // 10. L éditeur affiche la version d Alice et le bandeau de conflit a disparu.
      await expect(paragraph(instanceB.page, 'version Alice')).toBeVisible({ timeout: 20_000 })
      await expect(instanceB.page.getByText('conflits de fusion non résolus', { exact: false })).toHaveCount(0)
    } finally {
      if (instanceA) await instanceA.app.close()
      if (instanceB) await instanceB.app.close()
      await fs.rm(repos.base, { recursive: true, force: true })
      if (instanceA) await fs.rm(instanceA.configHome, { recursive: true, force: true })
      if (instanceB) await fs.rm(instanceB.configHome, { recursive: true, force: true })
    }
  })
})
