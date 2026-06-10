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

/** Variante qui ne jette pas : renvoie { ok, stdout, stderr }. */
async function gitSafe(cwd: string, ...args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    })
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() }
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string }
    return { ok: false, stdout: (err.stdout ?? '').trim(), stderr: (err.stderr ?? '').trim() }
  }
}

async function configureIdentity(repoDir: string, name: string, email: string) {
  await git(repoDir, 'config', 'user.name', name)
  await git(repoDir, 'config', 'user.email', email)
  await git(repoDir, 'config', 'commit.gpgsign', 'false')
}

const SHARED_LINE = 'Ligne partagée à éditer.'

function simpleDoc(line: string) {
  return ['---', 'title: Fail Safe', '---', '', line, '', 'Pied de page.', ''].join('\n')
}

/** Crée un dépôt distant (bare) avec un doc.md déjà poussé. */
async function setupRemote(prefix: string) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  const remoteDir = path.join(base, 'remote.git')
  const seedDir = path.join(base, 'seed')

  await fs.mkdir(seedDir, { recursive: true })
  await git(seedDir, 'init')
  await configureIdentity(seedDir, 'Seed', 'seed@example.com')
  await fs.writeFile(path.join(seedDir, 'doc.md'), simpleDoc(SHARED_LINE), 'utf8')
  await git(seedDir, 'add', '-A')
  await git(seedDir, 'commit', '-m', 'init')
  const branch = await git(seedDir, 'rev-parse', '--abbrev-ref', 'HEAD')

  await git(base, 'init', '--bare', remoteDir)
  await git(seedDir, 'remote', 'add', 'origin', remoteDir)
  await git(seedDir, 'push', '-u', 'origin', branch)

  return { base, remoteDir, branch }
}

async function cloneInto(base: string, remoteDir: string, name: string, author: string, email: string) {
  const dir = path.join(base, name)
  await git(base, 'clone', remoteDir, dir)
  await configureIdentity(dir, author, email)
  return { dir, file: path.join(dir, 'doc.md') }
}

// ─── Helpers Electron ────────────────────────────────────────────────────────
async function createTempConfigHome(author: string, email: string) {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-failsafe-config-'))
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

/** Attend que le process principal ait ouvert le dépôt (currentRootPath défini). */
async function waitForRepoOpen(page: Page) {
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const state = await window.holo?.gitGetState?.(false)
        return Boolean(state && state.isRepo)
      })
    }, { timeout: 30_000 })
    .toBe(true)
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

async function appendToParagraph(page: Page, target: string, suffix: string) {
  const block = paragraph(page, target)
  await expect(block).toBeVisible({ timeout: 25_000 })
  await block.click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix)
  await page.locator('textarea[placeholder="Untitled"]').first().click()
}

async function waitForNewLocalCommit(repoDir: string, previousHead: string) {
  await expect
    .poll(() => git(repoDir, 'rev-parse', 'HEAD'), { timeout: 25_000 })
    .not.toBe(previousHead)
}

async function waitForRemoteAdvance(remoteDir: string, branch: string, previousTip: string) {
  await expect
    .poll(() => git(remoteDir, 'rev-parse', branch), { timeout: 25_000 })
    .not.toBe(previousTip)
}

// ─── Tests ────────────────────────────────────────────────────────────────────
test.describe('Robustesse git (fail-safe)', () => {
  test.setTimeout(150_000)

  // ── Test 1 : anti-corruption ───────────────────────────────────────────────
  test('aucun commit pendant un rebase en conflit : l auto-save refuse de committer des marqueurs', async () => {
    const repo = await setupRemote('holo-failsafe-conflict-')
    let instance: { app: ElectronApplication; page: Page; configHome: string } | null = null

    try {
      // Bob clone la base initiale.
      const bob = await cloneInto(repo.base, repo.remoteDir, 'bob', 'Bob', 'bob@example.com')

      // Un autre contributeur fait avancer le distant sur LA MÊME ligne.
      const other = await cloneInto(repo.base, repo.remoteDir, 'other', 'Other', 'other@example.com')
      await fs.writeFile(other.file, simpleDoc(`${SHARED_LINE} (version distante)`), 'utf8')
      await git(other.dir, 'commit', '-am', 'edit distant')
      await git(other.dir, 'push')

      // Bob édite la même ligne localement, puis tente un rebase → CONFLIT.
      await fs.writeFile(bob.file, simpleDoc(`${SHARED_LINE} (version locale Bob)`), 'utf8')
      await git(bob.dir, 'commit', '-am', 'edit local')
      await git(bob.dir, 'fetch', 'origin')
      const rebase = await gitSafe(bob.dir, 'rebase', `origin/${repo.branch}`)
      expect(rebase.ok).toBe(false) // le rebase s'arrête sur le conflit

      // Le dépôt est bien en rebase avec des marqueurs dans le fichier.
      const conflicted = await fs.readFile(bob.file, 'utf8')
      expect(conflicted).toContain('<<<<<<<')
      const headBefore = await git(bob.dir, 'rev-parse', 'HEAD')

      // Holo ouvre ce dépôt en plein conflit.
      instance = await launchHolo(
        [`--holo-root=${bob.dir}`, `--holo-file=${bob.file}`],
        'Bob', 'bob@example.com',
      )
      await waitForRepoOpen(instance.page)

      // On force un auto-save : il DOIT refuser (sinon il committerait les marqueurs).
      const result = await instance.page.evaluate(async (filePath) => {
        return window.holo?.gitAutoSave?.(filePath, 'Bob', 'bob@example.com')
      }, bob.file)

      expect(result?.committed).toBe(false)
      expect(['operation-in-progress', 'conflicts-present']).toContain(result?.reason)

      // HEAD inchangé et aucun commit ne contient de marqueurs de conflit.
      expect(await git(bob.dir, 'rev-parse', 'HEAD')).toBe(headBefore)
      const committedDoc = await git(bob.dir, 'show', 'HEAD:doc.md')
      expect(committedDoc).not.toContain('<<<<<<<')
      expect(committedDoc).not.toContain('>>>>>>>')

      // Le rebase est toujours en cours (rien n'a été cassé en douce).
      const status = await git(bob.dir, 'status')
      expect(status.toLowerCase()).toContain('rebas')
    } finally {
      if (instance) {
        await instance.app.close()
        await fs.rm(instance.configHome, { recursive: true, force: true }).catch(() => {})
      }
      await fs.rm(repo.base, { recursive: true, force: true }).catch(() => {})
    }
  })

  // ── Test 2 : résilience hors-ligne ──────────────────────────────────────────
  test('remote injoignable pendant l édition : le commit local est conservé puis resynchronisé au retour', async () => {
    const repo = await setupRemote('holo-failsafe-offline-')
    let instance: { app: ElectronApplication; page: Page; configHome: string } | null = null

    try {
      const alice = await cloneInto(repo.base, repo.remoteDir, 'alice', 'Alice', 'alice@example.com')
      instance = await launchHolo(
        [`--holo-root=${alice.dir}`, `--holo-file=${alice.file}`],
        'Alice', 'alice@example.com',
      )
      await expect(paragraph(instance.page, SHARED_LINE)).toBeVisible({ timeout: 25_000 })
      await waitForRepoOpen(instance.page)

      // Base de référence : arbre propre, synchronisé.
      await expect.poll(() => git(alice.dir, 'status', '--porcelain'), { timeout: 25_000 }).toBe('')
      const remoteTip0 = await git(repo.remoteDir, 'rev-parse', repo.branch)
      const headBefore = await git(alice.dir, 'rev-parse', 'HEAD')

      // On coupe le distant (chemin inexistant) → tout push échouera.
      await git(alice.dir, 'remote', 'set-url', 'origin', path.join(repo.base, 'introuvable.git'))

      // Alice édite : l'auto-save commit en local, le push échoue silencieusement.
      await appendToParagraph(instance.page, SHARED_LINE, ' (hors-ligne)')
      await waitForNewLocalCommit(alice.dir, headBefore)

      // Aucune perte : le travail est sur disque ET committé localement (en attente de push).
      const disk = await fs.readFile(alice.file, 'utf8')
      expect(disk).toContain('(hors-ligne)')
      const committed = await git(alice.dir, 'show', 'HEAD:doc.md')
      expect(committed).toContain('(hors-ligne)')
      // Le distant n'a pas bougé (push impossible).
      expect(await git(repo.remoteDir, 'rev-parse', repo.branch)).toBe(remoteTip0)

      // Le distant redevient joignable.
      await git(alice.dir, 'remote', 'set-url', 'origin', repo.remoteDir)

      // Un nouvel auto-save pousse les commits en attente.
      await instance.page.evaluate(async (filePath) => {
        return window.holo?.gitAutoSave?.(filePath, 'Alice', 'alice@example.com')
      }, alice.file)

      await waitForRemoteAdvance(repo.remoteDir, repo.branch, remoteTip0)
      await expect
        .poll(() => git(repo.remoteDir, 'show', `${repo.branch}:doc.md`), { timeout: 15_000 })
        .toContain('(hors-ligne)')
    } finally {
      if (instance) {
        await instance.app.close()
        await fs.rm(instance.configHome, { recursive: true, force: true }).catch(() => {})
      }
      await fs.rm(repo.base, { recursive: true, force: true }).catch(() => {})
    }
  })

  // ── Test 3 : clone échoué puis nouvelle tentative ───────────────────────────
  // Le clone n'accepte que des URLs http(s). On vérifie le contrat de robustesse :
  // un clone qui échoue (hôte injoignable) ne laisse aucun dossier résiduel, et une
  // nouvelle tentative n'est PAS bloquée par « le dossier cible existe déjà » — c'est
  // exactement ce que garantit le nettoyage du dossier partiel dans le handler.
  test('un clone échoué ne laisse pas de dossier résiduel et n empêche pas une nouvelle tentative', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-failsafe-clone-')))
    const destination = path.join(base, 'dest')
    let instance: { app: ElectronApplication; page: Page; configHome: string } | null = null

    try {
      await fs.mkdir(destination, { recursive: true })

      // Hôte local sur un port fermé → échec immédiat (connexion refusée), sans réseau.
      const badUrl = 'http://127.0.0.1:1/repo.git' // nom de dépôt déduit : « repo »
      const cloneTarget = path.join(destination, 'repo')

      // Holo démarre sans espace ouvert.
      instance = await launchHolo([], 'Alice', 'alice@example.com')
      await expect
        .poll(() => instance!.page.evaluate(() => Boolean(window.holo)), { timeout: 30_000 })
        .toBe(true)

      const attemptClone = (payload: { repoUrl: string; destinationPath: string }) =>
        instance!.page.evaluate(async (p) => {
          try {
            await window.holo!.gitCloneRepository({ ...p, username: '', password: '' })
            return { ok: true, message: '' }
          } catch (error) {
            return { ok: false, message: (error as Error).message }
          }
        }, payload)

      // 1) Première tentative → rejet (clone impossible).
      const first = await attemptClone({ repoUrl: badUrl, destinationPath: destination })
      expect(first.ok).toBe(false)

      // Aucun dossier résiduel : la cible ne doit pas exister après l'échec.
      const leftover = await fs.stat(cloneTarget).catch(() => null)
      expect(leftover).toBeNull()

      // 2) Nouvelle tentative → rejet « normal » de clone, et SURTOUT pas « le dossier
      //    cible existe déjà » : la correction des identifiants resterait donc possible.
      const second = await attemptClone({ repoUrl: badUrl, destinationPath: destination })
      expect(second.ok).toBe(false)
      expect(second.message.toLowerCase()).not.toContain('existe déjà')

      // Toujours aucun dossier résiduel.
      const leftoverAfter = await fs.stat(cloneTarget).catch(() => null)
      expect(leftoverAfter).toBeNull()
    } finally {
      if (instance) {
        await instance.app.close()
        await fs.rm(instance.configHome, { recursive: true, force: true }).catch(() => {})
      }
      await fs.rm(base, { recursive: true, force: true }).catch(() => {})
    }
  })

  // ── Test 4 : noms de fichiers accentués ─────────────────────────────────────
  // Beaucoup de documents de cette app portent des accents/espaces (« Résumé été.md »).
  // git status --porcelain échappe ces noms (quotePath) et les entoure de guillemets.
  // Le fichier en conflit DOIT être détecté avec son vrai chemin, sinon la bannière
  // « Résoudre le conflit » ne s'affiche pas et la résolution cible un chemin inexistant.
  test('conflit sur un fichier au nom accentué : le chemin en conflit est correct', async () => {
    const ACCENT_FILE = 'Résumé été.md'
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-failsafe-accent-')))
    const remoteDir = path.join(base, 'remote.git')
    const seedDir = path.join(base, 'seed')
    let instance: { app: ElectronApplication; page: Page; configHome: string } | null = null

    try {
      // Dépôt source avec un fichier au nom accentué.
      await fs.mkdir(seedDir, { recursive: true })
      await git(seedDir, 'init')
      await configureIdentity(seedDir, 'Seed', 'seed@example.com')
      await fs.writeFile(path.join(seedDir, ACCENT_FILE), simpleDoc(SHARED_LINE), 'utf8')
      await git(seedDir, 'add', '-A')
      await git(seedDir, 'commit', '-m', 'init')
      const branch = await git(seedDir, 'rev-parse', '--abbrev-ref', 'HEAD')
      await git(base, 'init', '--bare', remoteDir)
      await git(seedDir, 'remote', 'add', 'origin', remoteDir)
      await git(seedDir, 'push', '-u', 'origin', branch)

      // Bob clone, un autre contributeur fait avancer le distant sur la même ligne.
      const bobDir = path.join(base, 'bob')
      await git(base, 'clone', remoteDir, bobDir)
      await configureIdentity(bobDir, 'Bob', 'bob@example.com')
      const bobFile = path.join(bobDir, ACCENT_FILE)

      const otherDir = path.join(base, 'other')
      await git(base, 'clone', remoteDir, otherDir)
      await configureIdentity(otherDir, 'Other', 'other@example.com')
      await fs.writeFile(path.join(otherDir, ACCENT_FILE), simpleDoc(`${SHARED_LINE} (distant)`), 'utf8')
      await git(otherDir, 'commit', '-am', 'edit distant')
      await git(otherDir, 'push')

      // Bob édite la même ligne puis rebase → CONFLIT dans le fichier accentué.
      await fs.writeFile(bobFile, simpleDoc(`${SHARED_LINE} (local Bob)`), 'utf8')
      await git(bobDir, 'commit', '-am', 'edit local')
      await git(bobDir, 'fetch', 'origin')
      const rebase = await gitSafe(bobDir, 'rebase', `origin/${branch}`)
      expect(rebase.ok).toBe(false)
      expect(await fs.readFile(bobFile, 'utf8')).toContain('<<<<<<<')

      // Holo ouvre le dépôt en plein conflit.
      instance = await launchHolo(
        [`--holo-root=${bobDir}`, `--holo-file=${bobFile}`],
        'Bob', 'bob@example.com',
      )
      await waitForRepoOpen(instance.page)

      // L'état git doit lister le fichier en conflit AVEC son vrai chemin.
      const state = await instance.page.evaluate(async () => window.holo?.gitGetState?.(false))
      const conflicted = (state?.conflictedFiles ?? []) as string[]

      // Le vrai chemin doit être présent (sinon : nom échappé/entre guillemets → bug).
      expect(conflicted).toContain(bobFile)
      // Aucune entrée ne doit contenir de séquence d'échappement ni de guillemets.
      for (const entry of conflicted) {
        expect(entry).not.toContain('\\')
        expect(entry).not.toContain('"')
      }
    } finally {
      if (instance) {
        await instance.app.close()
        await fs.rm(instance.configHome, { recursive: true, force: true }).catch(() => {})
      }
      await fs.rm(base, { recursive: true, force: true }).catch(() => {})
    }
  })
})
