/**
 * realtimeWindows.spec.ts — Un poste Windows et un Mac sur le même dépôt
 *
 * Git pour Windows convertit par défaut les fins de ligne en CRLF à
 * l'extraction (core.autocrlf=true), le Mac garde LF. On simule le poste
 * Windows de Bob en clonant avec core.autocrlf=true : ses fichiers sur disque
 * sont en CRLF, ceux d'Alice en LF. On vérifie :
 * - qu'une session en direct ne duplique ni ne réécrit rien, quel que soit
 *   l'ordre d'arrivée ;
 * - que les saisies simultanées convergent ;
 * - que git ne reçoit que les lignes réellement modifiées (pas de réécriture
 *   de tout le fichier à cause des fins de ligne) ;
 * - qu'une modification faite hors session sur Windows arrive intacte sur Mac.
 *
 * Nécessite un runtime Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`). Ignoré sinon.
 */
import { test, expect, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { git, launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const DOC_A = 'Projet/Plan.md'
const DOC_B = 'Projet/Budget.md'
const DOC_C = 'Projet/Risques.md'
const TYPING_DELAY_MS = 30

function documentContent(title: string) {
  return [
    `# ${title}`,
    '',
    'Paragraphe un.',
    '',
    'Paragraphe deux.',
    '',
    '| Poste | Montant |',
    '| --- | --- |',
    '|  |  |',
    '',
    '- Point A',
    '- Point B',
    '',
    'Paragraphe final.',
    '',
  ].join('\n')
}

function presence(page: Page) {
  return page.getByTestId('realtime-presence').first()
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

function cell(page: Page, row: number, column: number) {
  return page.locator('table tbody tr').nth(row).locator('td[data-table-cell-key]').nth(column).locator('[contenteditable="true"]')
}

async function appendTo(page: Page, text: string, suffix: string) {
  await paragraph(page, text).first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(suffix, { delay: TYPING_DELAY_MS })
}

async function typeInCell(page: Page, row: number, column: number, text: string) {
  await cell(page, row, column).click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(text, { delay: TYPING_DELAY_MS })
}

const lf = (text: string) => text.replace(/\r\n/g, '\n')

/** Chaque paragraphe d'origine apparaît exactement une fois dans l'éditeur. */
async function expectNoDuplication(page: Page) {
  for (const text of ['Paragraphe un.', 'Paragraphe deux.', 'Paragraphe final.']) {
    await expect(paragraph(page, text)).toHaveCount(1)
  }
  await expect(page.locator('table')).toHaveCount(1)
  await expect(page.locator('[data-list-text]').filter({ hasText: 'Point A' })).toHaveCount(1)
}

/** Lignes ajoutées ou supprimées dans le dépôt distant depuis le commit initial, pour un fichier. */
async function changedLinesOnServer(clone: string, file: string): Promise<number> {
  await git(clone, 'fetch', '--quiet')
  const root = (await git(clone, 'rev-list', '--max-parents=0', 'HEAD')).split('\n')[0]
  const numstat = await git(clone, 'diff', '--numstat', root, '@{upstream}', '--', file)
  return numstat.split('\n').filter(Boolean).reduce((sum, line) => {
    const [added, removed] = line.split('\t')
    return sum + Number(added) + Number(removed)
  }, 0)
}

async function diffOnServer(clone: string, file: string): Promise<string> {
  const root = (await git(clone, 'rev-list', '--max-parents=0', 'HEAD')).split('\n')[0]
  return git(clone, 'diff', root, '@{upstream}', '--', file)
}

async function serverContent(clone: string, file: string): Promise<string> {
  await git(clone, 'fetch', '--quiet')
  return git(clone, 'show', `@{upstream}:${file}`)
}

test.describe('Poste Windows (CRLF) et Mac (LF) sur le même dépôt', () => {
  test.setTimeout(300_000)

  test('session en direct, saisie simultanée, modifications hors session, dans les deux ordres', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const repository = await setupSharedRepository(['alice', 'bob'], {
      [DOC_A]: documentContent('Plan'),
      [DOC_B]: documentContent('Budget'),
      [DOC_C]: documentContent('Risques'),
    }, { cloneArgs: { bob: ['-c', 'core.autocrlf=true'] } })
    const { alice: aliceRoot, bob: bobRoot } = repository.clones as Record<'alice' | 'bob', string>
    let alice: Launched | null = null
    let bob: Launched | null = null
    try {
      // Le clone de Bob est bien « Windows » : CRLF sur disque.
      expect(await fs.readFile(path.join(bobRoot, DOC_A), 'utf8')).toContain('\r\n')
      expect(await fs.readFile(path.join(aliceRoot, DOC_A), 'utf8')).not.toContain('\r')

      // ── 1. Mac d'abord, puis Windows rejoint la session ──────────────────
      alice = await launchHolo(aliceRoot, path.join(aliceRoot, DOC_A), 'Alice Martin', 'alice@example.com')
      await expect(presence(alice.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      bob = await launchHolo(bobRoot, path.join(bobRoot, DOC_A), 'Bob Keller', 'bob@example.com')
      await expect(presence(bob.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      await expect(presence(alice.page).getByLabel('Bob Keller')).toBeVisible({ timeout: 20_000 })
      await bob.page.waitForTimeout(1500)
      await expectNoDuplication(alice.page)
      await expectNoDuplication(bob.page)

      await Promise.all([
        appendTo(alice.page, 'Paragraphe un.', ' Ajout Mac.'),
        (async () => {
          await appendTo(bob.page, 'Paragraphe final.', ' Ajout Windows.')
          await bob.page.keyboard.press('Enter')
          await bob.page.keyboard.type('Nouvelle ligne Windows.', { delay: TYPING_DELAY_MS })
        })(),
      ])
      await Promise.all([
        typeInCell(alice.page, 0, 0, 'Serveurs'),
        typeInCell(bob.page, 0, 1, '1200'),
      ])
      for (const page of [alice.page, bob.page]) {
        await expect(paragraph(page, 'Paragraphe un. Ajout Mac.')).toHaveCount(1, { timeout: 20_000 })
        await expect(paragraph(page, 'Paragraphe final. Ajout Windows.')).toHaveCount(1, { timeout: 20_000 })
        await expect(paragraph(page, 'Nouvelle ligne Windows.')).toHaveCount(1, { timeout: 20_000 })
        await expect(cell(page, 0, 0)).toHaveText('Serveurs', { timeout: 20_000 })
        await expect(cell(page, 0, 1)).toHaveText('1200', { timeout: 20_000 })
        await expectNoDuplication(page)
      }
      // Mêmes documents sur les deux disques (aux fins de ligne près).
      await expect.poll(async () => {
        const [a, b] = await Promise.all([aliceRoot, bobRoot].map((root) => fs.readFile(path.join(root, DOC_A), 'utf8')))
        return lf(a) === lf(b)
      }, { timeout: 30_000 }).toBe(true)
      // Git ne reçoit que les lignes modifiées, sans CR.
      await expect.poll(async () => {
        const content = await serverContent(aliceRoot, DOC_A)
        return content.includes('Nouvelle ligne Windows.') && content.includes('Ajout Mac.') && content.includes('| Serveurs | 1200 |')
      }, { timeout: 60_000, intervals: [2_000] }).toBe(true)
      expect(await serverContent(aliceRoot, DOC_A)).not.toContain('\r')
      expect(await changedLinesOnServer(aliceRoot, DOC_A), await diffOnServer(aliceRoot, DOC_A)).toBeLessThanOrEqual(10)

      // ── 2. Windows modifie seul un autre document (hors session) ─────────
      await bob.page.locator(`[data-tree-path="${path.join(bobRoot, DOC_B)}"]`).click()
      await expect(paragraph(bob.page, 'Paragraphe deux.')).toHaveCount(1, { timeout: 15_000 })
      await expectNoDuplication(bob.page)
      await appendTo(bob.page, 'Paragraphe deux.', ' Révisé sur Windows.')
      await expect.poll(async () => (await serverContent(aliceRoot, DOC_B)).includes('Révisé sur Windows.'), { timeout: 60_000, intervals: [2_000] }).toBe(true)
      expect(await serverContent(aliceRoot, DOC_B)).not.toContain('\r')
      expect(await changedLinesOnServer(aliceRoot, DOC_B), await diffOnServer(aliceRoot, DOC_B)).toBeLessThanOrEqual(2)
      // Alice l'ouvre : la modification est là, rien n'est dupliqué, rien n'est recommité.
      await alice.page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect.poll(async () => (await fs.readFile(path.join(aliceRoot, DOC_B), 'utf8')).includes('Révisé sur Windows.'), { timeout: 60_000, intervals: [2_000] }).toBe(true)
      await alice.page.locator(`[data-tree-path="${path.join(aliceRoot, DOC_B)}"]`).click()
      await expect(paragraph(alice.page, 'Paragraphe deux. Révisé sur Windows.')).toHaveCount(1, { timeout: 15_000 })
      await expectNoDuplication(alice.page)

      // ── 3. Windows d'abord, puis Mac rejoint (document C) ────────────────
      await bob.page.locator(`[data-tree-path="${path.join(bobRoot, DOC_C)}"]`).click()
      await expect(presence(bob.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      await appendTo(bob.page, 'Paragraphe un.', ' Seul sur Windows.')
      await bob.page.waitForTimeout(1500)
      await alice.page.locator(`[data-tree-path="${path.join(aliceRoot, DOC_C)}"]`).click()
      await expect(presence(alice.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      await expect(paragraph(alice.page, 'Paragraphe un. Seul sur Windows.')).toHaveCount(1, { timeout: 20_000 })
      await alice.page.waitForTimeout(1500)
      await expectNoDuplication(alice.page)
      await expectNoDuplication(bob.page)
      await Promise.all([
        appendTo(alice.page, 'Paragraphe deux.', ' Mac après.'),
        (async () => {
          await bob.page.locator('[data-list-text]').filter({ hasText: 'Point B' }).first().click()
          await bob.page.keyboard.press('End')
          await bob.page.keyboard.type(' complété', { delay: TYPING_DELAY_MS })
        })(),
      ])
      for (const page of [alice.page, bob.page]) {
        await expect(paragraph(page, 'Paragraphe deux. Mac après.')).toHaveCount(1, { timeout: 20_000 })
        await expect(page.locator('[data-list-text]').filter({ hasText: 'Point B complété' })).toHaveCount(1, { timeout: 20_000 })
        await expectNoDuplication(page)
      }
      await expect.poll(async () => {
        const content = await serverContent(aliceRoot, DOC_C)
        return content.includes('Mac après.') && content.includes('Point B complété') && content.includes('Seul sur Windows.')
      }, { timeout: 60_000, intervals: [2_000] }).toBe(true)
      expect(await serverContent(aliceRoot, DOC_C)).not.toContain('\r')
      expect(await changedLinesOnServer(aliceRoot, DOC_C), await diffOnServer(aliceRoot, DOC_C)).toBeLessThanOrEqual(6)

      for (const page of [alice.page, bob.page]) {
        await expect(page.getByText('se chevauchent')).toHaveCount(0)
        await expect(page.getByText('Conflit')).toHaveCount(0)
      }
      // Le dépôt de Bob reste propre (pas de fichier « modifié » par les seules fins de ligne).
      await expect.poll(async () => git(bobRoot, 'status', '--porcelain'), { timeout: 30_000, intervals: [2_000] }).toBe('')
    } finally {
      for (const launched of [alice, bob]) await launched?.app.close().catch(() => {})
      await repository.cleanup()
      for (const launched of [alice, bob]) if (launched) await fs.rm(launched.configHome, { recursive: true, force: true }).catch(() => {})
    }
  })
})
