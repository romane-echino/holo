/**
 * tableColumns.spec.ts — Redimensionnement des colonnes de tableau
 *
 * Retour utilisateur : « Il est impossible de rétrécir une colonne dans un tableau. »
 */
import { test, expect, type Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor.html'

async function gotoEditor(page: Page, markdown: string) {
  await page.addInitScript((md) => { (window as unknown as { __PW_MD__: string }).__PW_MD__ = md }, markdown)
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
}

async function readMd(page: Page) {
  return (await page.locator('#pw-md-output').textContent()) ?? ''
}

async function dragHandle(page: Page, columnName: string, deltaX: number) {
  const handle = page.getByRole('separator', { name: `Redimensionner la colonne ${columnName}` })
  await page.locator('[data-column-id]').first().hover()
  const box = await handle.boundingBox()
  if (!box) throw new Error('Poignée introuvable')
  const startX = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(startX, y)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX / 2, y, { steps: 4 })
  await page.mouse.move(startX + deltaX, y, { steps: 4 })
  await page.mouse.up()
}

const LONG_TEXT = 'Un texte assez long pour imposer une largeur de colonne confortable'

test.describe('Colonnes de tableau', () => {
  test('une colonne peut être rétrécie sous la largeur de son contenu', async ({ page }) => {
    await gotoEditor(page, [
      '| Description | Statut |',
      '| --- | --- |',
      `| ${LONG_TEXT} | ok |`,
      '',
      'Fin.',
    ].join('\n'))

    const header = page.locator('th[data-column-id]').first()
    const before = (await header.boundingBox())!.width
    await dragHandle(page, 'Description', -Math.round(before * 0.6))

    await expect.poll(async () => (await header.boundingBox())!.width).toBeLessThan(before * 0.6)
    // Le contenu passe à la ligne au lieu d'élargir la colonne.
    const cell = page.locator('tbody [data-block-type="table-cell"]').first()
    await expect(cell).toContainText(LONG_TEXT)
  })

  test('la largeur choisie est enregistrée dans le document et restaurée', async ({ page }) => {
    await gotoEditor(page, [
      '| Description | Statut |',
      '| --- | --- |',
      `| ${LONG_TEXT} | ok |`,
      '',
      'Fin.',
    ].join('\n'))

    const header = page.locator('th[data-column-id]').first()
    const before = (await header.boundingBox())!.width
    await dragHandle(page, 'Description', -Math.round(before / 2))

    await expect.poll(() => readMd(page)).toMatch(/<!-- holo:table \{"columnWidths":\[\d+,\d+\]\} -->/)
    const md = await readMd(page)
    const savedWidth = Number(md.match(/"columnWidths":\[(\d+)/)?.[1])
    expect(savedWidth).toBeLessThan(before)

    // Recharger le document : la largeur est réappliquée.
    await page.evaluate((markdown) => { (window as unknown as { __PW_MD__: string }).__PW_MD__ = markdown }, md)
    await page.addInitScript((markdown) => { (window as unknown as { __PW_MD__: string }).__PW_MD__ = markdown }, md)
    await page.reload()
    await page.waitForSelector('[data-testid="block-editor"]')
    const restored = (await page.locator('th[data-column-id]').first().boundingBox())!.width
    expect(Math.abs(restored - savedWidth)).toBeLessThanOrEqual(2)
  })

  test('double-clic sur la poignée revient aux largeurs automatiques', async ({ page }) => {
    await gotoEditor(page, [
      '<!-- holo:table {"columnWidths":[80,90]} -->',
      '| Description | Statut |',
      '| --- | --- |',
      `| ${LONG_TEXT} | ok |`,
      '',
      'Fin.',
    ].join('\n'))

    const header = page.locator('th[data-column-id]').first()
    expect(Math.round((await header.boundingBox())!.width)).toBe(80)

    await header.hover()
    await page.getByRole('separator', { name: 'Redimensionner la colonne Description' }).dblclick()

    await expect.poll(() => readMd(page)).not.toContain('columnWidths')
    await expect.poll(async () => (await header.boundingBox())!.width).toBeGreaterThan(80)
  })
})
