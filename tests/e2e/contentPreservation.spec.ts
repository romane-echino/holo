/**
 * contentPreservation.spec.ts — Rien ne doit disparaître à l'enregistrement
 *
 * Retour utilisateur : « Lorsque j'écris dans des tableaux, le lendemain il
 * manque des caractères et des éléments sont supprimés. »
 *
 * Chaque test modifie une partie du document puis vérifie que le contenu que
 * l'éditeur ne sait pas (ou mal) représenter est réécrit à l'identique.
 */
import { test, expect, type Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor.html'

async function gotoEditor(page: Page, markdown: string) {
  await page.addInitScript((md) => { (window as unknown as { __PW_MD__: string }).__PW_MD__ = md }, markdown)
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
}

async function waitForMd(page: Page, predicate: (md: string) => boolean, timeout = 5000): Promise<string> {
  let md = ''
  await expect(async () => {
    md = (await page.locator('#pw-md-output').textContent()) ?? ''
    expect(predicate(md)).toBe(true)
  }).toPass({ timeout })
  return md
}

function bodyCells(page: Page) {
  return page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]')
}

async function typeInCellAndLeave(page: Page, cellIndex: number, text: string) {
  const cell = bodyCells(page).nth(cellIndex)
  await cell.click()
  // Un clic sélectionne tout le contenu de la cellule : on se place à la fin.
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Fin.' }).click()
}

test.describe('Préservation du contenu', () => {
  test('tableau : <br>, HTML inline et en-tête formaté survivent à l édition d une autre cellule', async ({ page }) => {
    await gotoEditor(page, [
      '| **Nom** client | [Lien](https://example.com) |',
      '| --- | --- |',
      '| ligne 1<br>ligne 2 | <kbd>Ctrl</kbd> + S |',
      '| Alpha | à compléter |',
      '',
      'Fin.',
    ].join('\n'))

    await typeInCellAndLeave(page, 3, ' !')

    const md = await waitForMd(page, (s) => s.includes('à compléter !'))
    expect(md).toContain('| **Nom** client | [Lien](https://example.com) |')
    expect(md).toContain('ligne 1<br>ligne 2')
    expect(md).toContain('<kbd>Ctrl</kbd> + S')
  })

  test('tableau : éditer une cellule contenant <br> conserve le saut de ligne', async ({ page }) => {
    await gotoEditor(page, [
      '| Notes |',
      '| --- |',
      '| première<br>seconde |',
      '',
      'Fin.',
    ].join('\n'))

    await typeInCellAndLeave(page, 0, ' ligne')

    const md = await waitForMd(page, (s) => s.includes('seconde ligne'))
    expect(md).toContain('| première<br>seconde ligne |')
  })

  test('tableau : Maj+Entrée dans une cellule écrit <br> au lieu d un espace', async ({ page }) => {
    await gotoEditor(page, [
      '| Notes |',
      '| --- |',
      '| haut |',
      '',
      'Fin.',
    ].join('\n'))

    const cell = bodyCells(page).first()
    await cell.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('bas')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Fin.' }).click()

    const md = await waitForMd(page, (s) => s.includes('bas'))
    expect(md).toContain('| haut<br>bas |')
  })

  test('paragraphe : HTML inline et formule en ligne survivent à l édition', async ({ page }) => {
    await gotoEditor(page, [
      'Appuyez sur <kbd>Ctrl</kbd> puis calculez $x^2$ vite.',
      '',
      'Fin.',
    ].join('\n'))

    const paragraph = page.locator('[data-block-type="paragraph"][contenteditable]').first()
    await paragraph.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.press('End')
    await page.keyboard.type(' Merci.')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Fin.' }).click()

    const md = await waitForMd(page, (s) => s.includes('Merci.'))
    expect(md).toContain('<kbd>Ctrl</kbd>')
    expect(md).toContain('$x^2$')
    // La formule est rendue (KaTeX), pas affichée en texte brut.
    await expect(page.locator('.holo-inline-math .katex').first()).toBeVisible()
  })

  test('colonne devise : un montant en texte libre n est pas tronqué', async ({ page }) => {
    await gotoEditor(page, [
      '<!-- holo:table {"columnTypes":["text","currency"]} -->',
      '| Poste | Montant |',
      '| --- | --- |',
      '| Matériel | 1200 |',
      '',
      'Fin.',
    ].join('\n'))

    const amountCell = bodyCells(page).nth(1)
    await amountCell.click()
    await page.keyboard.type('env. 1500 CHF')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Fin.' }).click()

    const md = await waitForMd(page, (s) => s.includes('env.'))
    expect(md).toContain('| Matériel | env. 1500 CHF |')
  })
})
