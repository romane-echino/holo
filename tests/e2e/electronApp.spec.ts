import { test, expect } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')

async function createTempWorkspace(markdown: string) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-electron-workspace-'))
  const filePath = path.join(rootPath, 'doc.md')
  await fs.writeFile(filePath, markdown, 'utf8')
  return { rootPath, filePath }
}

async function createStructuredWorkspace(files: Record<string, string>) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-electron-structured-'))

  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootPath, relativePath)
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, content, 'utf8')
  }

  return { rootPath }
}

async function createTempConfigHome() {
  const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-electron-config-'))
  const holoDir = path.join(configHome, 'holo')
  await fs.mkdir(holoDir, { recursive: true })
  await fs.writeFile(path.join(holoDir, 'holo-config.json'), JSON.stringify({
    'app-onboarding-done': true,
    'app-author': 'Playwright',
    'git-email': 'playwright@example.com',
  }, null, 2), 'utf8')
  return configHome
}

async function launchHolo(args: string[]) {
  const configHome = await createTempConfigHome()
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [MAIN_PATH, ...args],
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: configHome,
    },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return { app, page, configHome }
}

function treePathSelector(targetPath: string) {
  return `[data-tree-path="${targetPath.replace(/"/g, '\\"')}"]`
}

async function openTreeFolder(page: import('@playwright/test').Page, folderPath: string) {
  const folder = page.locator(treePathSelector(folderPath))
  await expect(folder).toBeVisible({ timeout: 20_000 })
  await folder.click()
}

async function moveTreeItem(page: import('@playwright/test').Page, sourcePath: string, targetDirectoryPath: string) {
  await page.evaluate(({ sourceSelector, targetSelector }) => {
    const source = document.querySelector(sourceSelector)
    const target = document.querySelector(targetSelector)

    if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
      throw new Error('drag source or target not found')
    }

    const dataTransfer = new DataTransfer()
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }))
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }))
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }))
    source.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }))
  }, {
    sourceSelector: treePathSelector(sourcePath),
    targetSelector: treePathSelector(targetDirectoryPath),
  })
}

test.describe('Electron app — critical flows', () => {
  test('ouvre un document cible, sauvegarde sur disque et recharge le contenu au relancement', async () => {
    const workspace = await createTempWorkspace([
      '---',
      'title: Titre Electron initial',
      '---',
      '',
      'Corps electron initial.',
      '',
    ].join('\n'))

    const firstRun = await launchHolo([
      `--holo-root=${workspace.rootPath}`,
      `--holo-file=${workspace.filePath}`,
    ])

    try {
      const paragraph = firstRun.page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Corps electron initial.' })
      await expect(paragraph).toBeVisible({ timeout: 20_000 })

      await paragraph.click()
      await firstRun.page.keyboard.press('End')
      await firstRun.page.keyboard.type(' modifie')
      await firstRun.page.locator('textarea[placeholder="Untitled"]').first().click()

      await expect.poll(async () => fs.readFile(workspace.filePath, 'utf8'), { timeout: 15_000 }).toContain('Corps electron initial. modifie')
    } finally {
      await firstRun.app.close()
    }

    const secondRun = await launchHolo([
      `--holo-root=${workspace.rootPath}`,
      `--holo-file=${workspace.filePath}`,
    ])

    try {
      await expect(
        secondRun.page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Corps electron initial. modifie' }),
      ).toBeVisible({ timeout: 20_000 })
    } finally {
      await secondRun.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(firstRun.configHome, { recursive: true, force: true })
      await fs.rm(secondRun.configHome, { recursive: true, force: true })
    }
  })

  test('un lien holo invalide remonte une erreur de démarrage visible', async () => {
    const launched = await launchHolo(['holo://DepotInconnu/doc.md'])

    try {
      const dialog = await launched.page.waitForEvent('dialog', { timeout: 15_000 })
      expect(dialog.message()).toContain('Aucun dépôt correspondant trouvé: DepotInconnu')
      await dialog.accept()
    } finally {
      await launched.app.close()
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('une erreur writeFile remonte un état d enregistrement en erreur', async () => {
    const workspace = await createTempWorkspace([
      '---',
      'title: Titre Electron initial',
      '---',
      '',
      'Corps electron initial.',
      '',
    ].join('\n'))

    const launched = await launchHolo([
      `--holo-root=${workspace.rootPath}`,
      `--holo-file=${workspace.filePath}`,
    ])

    try {
      const paragraph = launched.page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Corps electron initial.' })
      await expect(paragraph).toBeVisible({ timeout: 20_000 })

      await fs.chmod(workspace.filePath, 0o444)

      await paragraph.click()
      await launched.page.keyboard.press('End')
      await launched.page.keyboard.type(' echec')
      await launched.page.locator('textarea[placeholder="Untitled"]').first().click()

      await expect(launched.page.getByText("Erreur d'enregistrement").first()).toBeVisible({ timeout: 10_000 })
      await expect.poll(async () => fs.readFile(workspace.filePath, 'utf8'), { timeout: 5_000 }).not.toContain('echec')
    } finally {
      await launched.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('un modèle déplacé garde son statut, reste unique et permet toujours une création', async () => {
    const workspace = await createStructuredWorkspace({
      'Templates/template-source.md': [
        '---',
        'title: Template source',
        'template: true',
        '---',
        '',
        'Contenu depuis le modele.',
        '',
      ].join('\n'),
      'Archives/.keep': '',
    })
    const templatesDir = path.join(workspace.rootPath, 'Templates')
    const archivesDir = path.join(workspace.rootPath, 'Archives')
    const originalTemplatePath = path.join(templatesDir, 'template-source.md')
    const movedTemplatePath = path.join(archivesDir, 'template-source.md')

    const launched = await launchHolo([`--holo-root=${workspace.rootPath}`])

    try {
      await openTreeFolder(launched.page, templatesDir)
      await openTreeFolder(launched.page, archivesDir)

      await moveTreeItem(launched.page, originalTemplatePath, archivesDir)
      await expect(launched.page.locator(treePathSelector(movedTemplatePath))).toBeVisible({ timeout: 20_000 })

      await moveTreeItem(launched.page, movedTemplatePath, templatesDir)
      await expect(launched.page.locator(treePathSelector(originalTemplatePath))).toBeVisible({ timeout: 20_000 })

      await launched.page.locator(treePathSelector(originalTemplatePath)).click({ button: 'right' })
      await expect(launched.page.getByRole('button', { name: 'Retirer du modèle' })).toBeVisible({ timeout: 10_000 })
      await launched.page.keyboard.press('Escape')

      await launched.page.locator(treePathSelector(templatesDir)).click({ button: 'right' })
      await launched.page.getByRole('button', { name: 'Nouveau fichier depuis un modèle' }).click()

      await expect(launched.page.getByText("Choisis d'abord le modèle à utiliser.")).toBeHidden()
      await expect(launched.page.getByText('Modèle sélectionné :')).toBeVisible({ timeout: 10_000 })

      const suffixInput = launched.page.getByPlaceholder('Suffixe du titre (ex : 25.06.26)')
      await suffixInput.press('End')
      await suffixInput.type('Copie')
      await launched.page.getByRole('button', { name: 'Créer' }).click()

      const createdPath = path.join(templatesDir, 'Template source - Copie.md')
      await expect(launched.page.locator(treePathSelector(createdPath))).toBeVisible({ timeout: 20_000 })

      await expect.poll(async () => fs.readFile(createdPath, 'utf8'), { timeout: 15_000 }).toContain('title: Template source - Copie')
      await expect.poll(async () => fs.readFile(createdPath, 'utf8'), { timeout: 15_000 }).not.toContain('template: true')
    } finally {
      await launched.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('le drag-select dans le popup nouveau fichier ne ferme pas le dialogue au mouseup hors cadre', async () => {
    const workspace = await createStructuredWorkspace({
      'doc.md': '# Test\n',
    })

    const launched = await launchHolo([`--holo-root=${workspace.rootPath}`])

    try {
      await launched.page.getByRole('button', { name: 'Nouveau…' }).click()
      await launched.page.getByRole('button', { name: 'Nouveau fichier' }).click()

      const input = launched.page.getByPlaceholder('nom-du-fichier.md')
      await expect(input).toBeVisible({ timeout: 10_000 })
      await input.fill('document-long.md')

      const box = await input.boundingBox()
      if (!box) {
        throw new Error('input bounding box unavailable')
      }

      await launched.page.mouse.move(box.x + box.width - 12, box.y + box.height / 2)
      await launched.page.mouse.down()
      await launched.page.mouse.move(Math.max(4, box.x - 140), box.y + box.height / 2, { steps: 12 })
      await launched.page.mouse.up()

      await expect(input).toBeVisible()
      await launched.page.getByRole('button', { name: 'Créer' }).click()

      const createdPath = path.join(workspace.rootPath, 'document-long.md')
      await expect.poll(async () => fs.access(createdPath).then(() => true).catch(() => false), { timeout: 10_000 }).toBe(true)
    } finally {
      await launched.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('le menu principal desktop peut etre masque puis reaffiche depuis le header', async () => {
    const workspace = await createStructuredWorkspace({
      'doc.md': '# Test\n',
    })

    const launched = await launchHolo([`--holo-root=${workspace.rootPath}`])

    try {
      await launched.page.setViewportSize({ width: 1440, height: 900 })

      const sidebarSearchButton = launched.page.getByRole('button', { name: 'Rechercher...' })
      await expect(sidebarSearchButton).toBeVisible({ timeout: 20_000 })

      await launched.page.getByRole('button', { name: 'Masquer le menu principal' }).click()
      await expect(sidebarSearchButton).toBeHidden({ timeout: 10_000 })

      await launched.page.getByRole('button', { name: 'Afficher le menu principal' }).click()
      await expect(sidebarSearchButton).toBeVisible({ timeout: 10_000 })
    } finally {
      await launched.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })

  test('le champ de lien du FormatToolbar accepte le collage clavier (Ctrl/Cmd+V)', async () => {
    const workspace = await createStructuredWorkspace({
      'doc.md': [
        '---',
        'title: Doc lien',
        '---',
        '',
        'Texte a transformer en lien.',
        '',
      ].join('\n'),
    })

    const launched = await launchHolo([
      `--holo-root=${workspace.rootPath}`,
      `--holo-file=${path.join(workspace.rootPath, 'doc.md')}`,
    ])

    try {
      // Garde-fou principal : sans menu Édition déclaré, Electron ne route plus
      // les accélérateurs presse-papiers vers les champs natifs et Ctrl+V ne
      // colle pas (le bug signalé). On vérifie que les rôles sont bien exposés.
      const clipboardRoles = await launched.app.evaluate(({ Menu }) => {
        const menu = Menu.getApplicationMenu()
        if (!menu) return [] as string[]
        const found = new Set<string>()
        const walk = (items: Electron.MenuItem[]) => {
          for (const item of items) {
            if (item.role) found.add(String(item.role).toLowerCase())
            if (item.submenu) walk(item.submenu.items)
          }
        }
        walk(menu.items)
        return Array.from(found)
      })
      expect(clipboardRoles).toEqual(expect.arrayContaining(['cut', 'copy', 'paste', 'selectall']))

      const paragraph = launched.page
        .locator('[data-block-type="paragraph"][contenteditable]')
        .filter({ hasText: 'Texte a transformer en lien.' })
      await expect(paragraph).toBeVisible({ timeout: 20_000 })

      // Sélectionne tout le texte du paragraphe : la FormatToolbar apparaît.
      await paragraph.click()
      await launched.page.keyboard.press('Home')
      await launched.page.keyboard.press('Shift+End')

      const toolbar = launched.page.locator('[data-format-toolbar="true"]')
      await expect(toolbar).toBeVisible({ timeout: 10_000 })

      // Ouvre le mode saisie de lien.
      await toolbar.getByRole('button', { name: 'Ajouter un lien (Ctrl+K)' }).click()

      const linkInput = launched.page.getByPlaceholder(/nom de page/)
      await expect(linkInput).toBeVisible({ timeout: 10_000 })

      // Place une URL dans le presse-papiers système (process principal Electron).
      const url = 'https://exemple.test/page-collee'
      await launched.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), url)

      // Colle dans le champ natif <input> : aucun handler côté rendu ne doit
      // intercepter / preventDefault le collage de texte dans ce champ.
      await linkInput.click()
      const pasteModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
      await launched.page.keyboard.press(`${pasteModifier}+V`)

      await expect(linkInput).toHaveValue(url, { timeout: 10_000 })
    } finally {
      await launched.app.close()
      await fs.rm(workspace.rootPath, { recursive: true, force: true })
      await fs.rm(launched.configHome, { recursive: true, force: true })
    }
  })
})