/**
 * whatsNew.spec.ts — « Quoi de neuf » après une mise à jour
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { compareVersions, entriesSince } from '../../src/lib/whatsNew'

const require = createRequire(import.meta.url)
const electronExecutable = require('electron') as string
const MAIN_PATH = path.join(process.cwd(), 'electron/main.js')
const CURRENT = (require('../../package.json') as { version: string }).version

const ENTRIES = [
  { version: '0.9.3', releasedAt: '2026-11-04', items: ['c'] },
  { version: '0.9.2', releasedAt: '2026-11-04', items: ['b'] },
  { version: '0.9.1', releasedAt: '2026-11-04', items: ['a'] },
  { version: '0.10.0', releasedAt: '2026-12-01', items: ['futur'] },
]

test.describe('Quoi de neuf : versions à présenter', () => {
  test('comparaison de versions', () => {
    expect(compareVersions('0.9.10', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('v0.10.0', '0.9.9')).toBeGreaterThan(0)
    expect(compareVersions('0.9.3', '0.9.3')).toBe(0)
  })

  test('les versions installées depuis la dernière vue, de la plus récente à la plus ancienne', () => {
    expect(entriesSince(ENTRIES, '0.9.1', '0.9.3').map((entry) => entry.version)).toEqual(['0.9.3', '0.9.2'])
    expect(entriesSince(ENTRIES, null, '0.9.3')).toEqual([])
    expect(entriesSince(ENTRIES, '0.9.3', '0.9.3')).toEqual([])
    expect(entriesSince(ENTRIES, '0.9.3', '0.9.2')).toEqual([])
  })
})

async function launch(configHome: string, workspace: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: [MAIN_PATH, `--holo-root=${workspace}`, `--holo-file=${path.join(workspace, 'doc.md')}`],
    cwd: process.cwd(),
    env: { ...process.env, XDG_CONFIG_HOME: configHome, HOLO_APP_DATA_DIR: configHome },
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('[data-testid="block-editor"]')).toContainText('Contenu', { timeout: 20_000 })
  return { app, page }
}

test.describe('Quoi de neuf : dans l application', () => {
  test('après une mise à jour, les nouveautés s affichent une fois', async () => {
    const configHome = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-whatsnew-config-'))
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'holo-whatsnew-'))
    await fs.writeFile(path.join(workspace, 'doc.md'), 'Contenu.\n', 'utf8')
    const configFile = path.join(configHome, 'holo', 'holo-config.json')
    await fs.mkdir(path.dirname(configFile), { recursive: true })
    await fs.writeFile(configFile, JSON.stringify({
      'app-onboarding-done': true,
      'realtime-prompt-dismissed': true,
      'app-author': 'Playwright',
      'git-email': 'playwright@example.com',
      'last-seen-version': '0.9.1',
    }), 'utf8')
    let run = await launch(configHome, workspace)
    try {
      const dialog = run.page.getByTestId('whats-new')
      await expect(dialog).toBeVisible({ timeout: 10_000 })
      await expect(run.page.getByRole('heading', { name: `Nouveautés de Holo ${CURRENT}` })).toBeVisible()
      await expect(dialog).toContainText(`Version ${CURRENT}`)
      await expect(dialog).not.toContainText('Version 0.9.1')
      await run.page.getByRole('button', { name: 'C\'est noté' }).click()
      await expect(dialog).toBeHidden()
      await expect.poll(async () => JSON.parse(await fs.readFile(configFile, 'utf8'))['last-seen-version']).toBe(CURRENT)
      await run.app.close()

      // Relancé : rien de nouveau.
      run = await launch(configHome, workspace)
      await run.page.waitForTimeout(1_500)
      await expect(run.page.getByTestId('whats-new')).toHaveCount(0)
    } finally {
      await run.app.close().catch(() => {})
      await fs.rm(configHome, { recursive: true, force: true })
      await fs.rm(workspace, { recursive: true, force: true })
    }
  })
})
