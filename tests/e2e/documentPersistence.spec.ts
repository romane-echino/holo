/**
 * Persistance du document ouvert face aux modifications externes (OneDrive,
 * autre application, autre instance) et aux enregistrements forcés.
 *
 * Retours utilisateurs couverts :
 *   - « bugs quand le dépôt est dans un dossier OneDrive (double synchro) »
 *   - « dans les tableaux, le lendemain il manque des caractères »
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

async function launchHolo(rootPath: string, filePath: string): Promise<Launched> {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-persistence-config-'))
  await fs.mkdir(path.join(configHome, 'holo'), { recursive: true })
  await fs.writeFile(path.join(configHome, 'holo', 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'app-author': 'Playwright',
    'git-email': 'playwright@example.com',
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

async function createWorkspace(markdown: string) {
  const rootPath = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-persistence-')))
  const filePath = path.join(rootPath, 'doc.md')
  await fs.writeFile(filePath, markdown, 'utf8')
  return { rootPath, filePath }
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

function tableCells(page: Page) {
  return page.locator('[data-block-type="table-cell"][contenteditable]')
}

async function cleanup(launched: Launched | null, ...dirs: string[]) {
  if (launched) await launched.app.close().catch(() => {})
  for (const dir of [...dirs, launched?.configHome].filter(Boolean) as string[]) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

test.describe('Persistance du document ouvert', () => {
  test.setTimeout(90_000)

  test('une modification externe (OneDrive) apparaît dans l éditeur sans le recharger', async () => {
    const ws = await createWorkspace(['# Titre', '', 'Paragraphe initial.', '', 'Second paragraphe.', ''].join('\n'))
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      await expect(paragraph(launched.page, 'Paragraphe initial.')).toBeVisible({ timeout: 20_000 })

      // Simule OneDrive qui dépose la version d'un collègue.
      await fs.writeFile(ws.filePath, ['# Titre', '', 'Paragraphe initial.', '', 'Second paragraphe modifié ailleurs.', ''].join('\n'), 'utf8')

      await expect(paragraph(launched.page, 'Second paragraphe modifié ailleurs.')).toBeVisible({ timeout: 15_000 })
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('saisie + modification externe simultanées : les deux sont conservées', async () => {
    const ws = await createWorkspace(['Ligne du haut.', '', 'Ligne tampon.', '', 'Ligne du bas.', ''].join('\n'))
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      const top = paragraph(launched.page, 'Ligne du haut.')
      await expect(top).toBeVisible({ timeout: 20_000 })

      // L'utilisateur commence à taper en haut…
      await top.click()
      await launched.page.keyboard.press('End')
      await launched.page.keyboard.type(' (moi)')
      // …pendant que le fichier change sur disque, en bas, avant l'enregistrement.
      await fs.writeFile(ws.filePath, ['Ligne du haut.', '', 'Ligne tampon.', '', 'Ligne du bas. (collègue)', ''].join('\n'), 'utf8')
      await launched.page.keyboard.type(' encore')

      await expect
        .poll(async () => fs.readFile(ws.filePath, 'utf8'), { timeout: 10_000 })
        .toMatch(/Ligne du haut\. \(moi\) encore[\s\S]*Ligne du bas\. \(collègue\)/)
      await expect(paragraph(launched.page, 'Ligne du bas. (collègue)')).toBeVisible({ timeout: 10_000 })
      await expect(paragraph(launched.page, 'Ligne du haut. (moi) encore')).toBeVisible()
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('Ctrl/Cmd+S juste après une frappe l écrit immédiatement sur disque', async () => {
    const ws = await createWorkspace(['Texte de départ.', ''].join('\n'))
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      const target = paragraph(launched.page, 'Texte de départ.')
      await expect(target).toBeVisible({ timeout: 20_000 })
      await target.click()
      await launched.page.keyboard.press('End')
      await launched.page.keyboard.type(' sauvé')
      await launched.page.keyboard.press('ControlOrMeta+S')
      // Sans flush, la saisie attendrait le délai de 400 ms puis l'écriture ;
      // ici elle doit être sur disque quasi immédiatement.
      await expect.poll(async () => fs.readFile(ws.filePath, 'utf8'), { timeout: 1_500, intervals: [50] }).toContain('Texte de départ. sauvé')
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('une saisie de tableau est conservée à la fermeture de l app', async () => {
    const ws = await createWorkspace(['| Nom | Statut |', '| --- | --- |', '| Alpha | ok |', ''].join('\n'))
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      const cell = tableCells(launched.page).nth(1)
      await expect(cell).toBeVisible({ timeout: 20_000 })
      await cell.click()
      await launched.page.keyboard.type('terminé')
      // Fermeture immédiate, avant le délai d'enregistrement de la cellule.
      await launched.app.close()
      launched = { ...launched, app: { close: async () => {} } as unknown as ElectronApplication }
      const disk = await fs.readFile(ws.filePath, 'utf8')
      expect(disk).toContain('| Alpha | terminé |')
      // La ligne de séparation d'origine n'est pas réécrite.
      expect(disk).toContain('| --- | --- |')
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('ouvrir un document ne le réécrit pas et ne crée aucun commit', async () => {
    const original = ['---', 'title: Non normalisé', 'tags:', '  - alpha', '  - beta', '---', '', '* item un', '* item deux', '', '| a   | b   |', '|-----|-----|', '| 1   | 2   |', ''].join('\n')
    const ws = await createWorkspace(original)
    await git(ws.rootPath, 'init')
    await git(ws.rootPath, 'config', 'user.name', 'Test')
    await git(ws.rootPath, 'config', 'user.email', 'test@example.com')
    await git(ws.rootPath, 'add', '-A')
    await git(ws.rootPath, 'commit', '-m', 'init')
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      await expect(launched.page.locator('[data-block-type="table-cell"][contenteditable]').first()).toBeVisible({ timeout: 20_000 })
      await launched.page.waitForTimeout(3000)
      expect(await fs.readFile(ws.filePath, 'utf8')).toBe(original)
      expect(await git(ws.rootPath, 'rev-list', '--count', 'HEAD')).toBe('1')
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('copier une image la place dans le presse-papiers système et la reconnaît au collage', async () => {
    // PNG 2×2 rouge
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64')
    const ws = await createWorkspace(['Avant.', '', '![rouge](images/rouge.png)', '', 'Après.', ''].join('\n'))
    await fs.mkdir(path.join(ws.rootPath, 'images'), { recursive: true })
    await fs.writeFile(path.join(ws.rootPath, 'images', 'rouge.png'), png)
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      await expect(launched.page.locator('img[alt="rouge"]')).toHaveAttribute('src', /^data:image\/png/, { timeout: 20_000 })

      await launched.page.evaluate(() => (window as unknown as { holo: { writeClipboardImage: (s: string) => Promise<unknown> } }).holo.writeClipboardImage('images/rouge.png'))
      const size = await launched.app.evaluate(async ({ clipboard, nativeImage }) => {
        const [item] = await clipboard.read()
        const blob = await item.getType('image/png')
        return nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer())).getSize()
      })
      expect(size).toEqual({ width: 2, height: 2 })
      const copied = await launched.page.evaluate(() => (window as unknown as { holo: { getCopiedHoloImage: () => Promise<string | null> } }).holo.getCopiedHoloImage())
      expect(copied).toBe('images/rouge.png')

      // Une autre image dans le presse-papiers n'est pas confondue avec celle de Holo.
      await launched.app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
        const other = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
        await clipboard.write([new ClipboardItem({ 'image/png': new Blob([other.toPNG()], { type: 'image/png' }) })])
      })
      const other = await launched.page.evaluate(() => (window as unknown as { holo: { getCopiedHoloImage: () => Promise<string | null> } }).holo.getCopiedHoloImage())
      expect(other).toBeNull()
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('un dépôt git dans un dossier OneDrive affiche un avertissement', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'holo-onedrive-')))
    const rootPath = path.join(base, 'OneDrive - Echino', 'Documents', 'docs')
    await fs.mkdir(rootPath, { recursive: true })
    const filePath = path.join(rootPath, 'doc.md')
    await fs.writeFile(filePath, 'Contenu.\n', 'utf8')
    await git(rootPath, 'init')
    let launched: Launched | null = null
    try {
      launched = await launchHolo(rootPath, filePath)
      await expect(launched.page.getByText('Dépôt git dans un dossier OneDrive')).toBeVisible({ timeout: 20_000 })
    } finally {
      await cleanup(launched, base)
    }
  })

  test('les réglages temps réel s enregistrent avec le bouton global des paramètres', async () => {
    const ws = await createWorkspace('Contenu.\n')
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      const page = launched.page
      await expect(paragraph(page, 'Contenu.')).toBeVisible({ timeout: 20_000 })
      await page.getByRole('button', { name: 'Paramètres' }).click()
      await page.getByRole('button', { name: /Collaboration/ }).first().click()
      await page.getByLabel('Activer l\'édition en temps réel').check()
      await page.getByPlaceholder('https://cn.echino.com/holo-realtime').fill('https://relais.example.com/holo-realtime/api/')
      await page.getByPlaceholder('CN_…').fill('CN_test-token')
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).last().click()

      await expect.poll(() => page.evaluate(() => (window as unknown as { holo: { realtime: { getConfig: () => Promise<unknown> } } }).holo.realtime.getConfig()), { timeout: 5_000 })
        .toEqual({ url: 'https://relais.example.com/holo-realtime', enabled: true, hasToken: true })
      // Le jeton n'est jamais stocké en clair.
      const config = await fs.readFile(path.join(launched.configHome, 'holo', 'holo-config.json'), 'utf8')
      expect(config).not.toContain('CN_test-token')
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })

  test('modifier un paragraphe conserve la mise en forme du reste du fichier', async () => {
    const original = ['---', 'title: Diff minimal', 'tags:', '  - alpha', '---', '', '* item un', '* item deux', '', 'Paragraphe à modifier.', '', '| a   | b   |', '|-----|-----|', '| x<br>y | 2   |', ''].join('\n')
    const ws = await createWorkspace(original)
    let launched: Launched | null = null
    try {
      launched = await launchHolo(ws.rootPath, ws.filePath)
      const target = paragraph(launched.page, 'Paragraphe à modifier.')
      await expect(target).toBeVisible({ timeout: 20_000 })
      await target.click()
      await launched.page.keyboard.press('End')
      await launched.page.keyboard.type(' Modifié.')
      await launched.page.keyboard.press('ControlOrMeta+S')
      await expect.poll(async () => fs.readFile(ws.filePath, 'utf8'), { timeout: 5_000 }).toContain('Paragraphe à modifier. Modifié.')
      const disk = await fs.readFile(ws.filePath, 'utf8')
      // Tout ce que l'utilisateur n'a pas touché reste octet pour octet identique.
      expect(disk).toBe(original.replace('Paragraphe à modifier.', 'Paragraphe à modifier. Modifié.'))
    } finally {
      await cleanup(launched, ws.rootPath)
    }
  })
})
