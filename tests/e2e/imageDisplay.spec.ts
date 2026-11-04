/**
 * imageDisplay.spec.ts — Taille d'affichage des images
 *
 * Par défaut une image garde sa taille réelle, au plus la largeur du document
 * (une icône n'est pas étirée). « Pleine largeur » l'étire et s'écrit dans le
 * markdown ; les modes déjà écrits (50 %…) restent lus.
 */
import { test, expect, type Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor.html'
// PNG 8×8 rouge
const SMALL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'

async function gotoEditor(page: Page, markdown: string) {
  await page.addInitScript((md) => {
    ;(window as unknown as { __PW_MD__: string }).__PW_MD__ = md
  }, markdown)
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
}

test.describe('Taille d affichage des images', () => {
  test('une petite image garde sa taille ; « Pleine largeur » l étire et s écrit dans le markdown', async ({ page }) => {
    await gotoEditor(page, `Avant.\n\n![icone](${SMALL_PNG})\n\nAprès.\n`)
    const image = page.locator('[data-testid="block-editor"] figure img[alt="icone"]')
    await expect(image).toBeVisible()
    const editorWidth = (await page.locator('[data-testid="block-editor"]').boundingBox())!.width
    expect((await image.boundingBox())!.width).toBeLessThanOrEqual(16)

    await image.hover()
    await page.getByRole('button', { name: 'Mode d\'affichage' }).click()
    await page.getByRole('menuitemradio', { name: 'Pleine largeur' }).click()
    await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(editorWidth * 0.8)
    await expect.poll(async () => page.locator('#pw-md-output').textContent()).toContain('<!-- holo:image {"displayMode":"full"} -->')

    await image.hover()
    await page.getByRole('button', { name: 'Mode d\'affichage' }).click()
    await page.getByRole('menuitemradio', { name: 'Taille réelle' }).click()
    await expect.poll(async () => (await image.boundingBox())!.width).toBeLessThanOrEqual(16)
    await expect.poll(async () => page.locator('#pw-md-output').textContent()).not.toContain('holo:image')
  })

  test('un mode déjà écrit (50 %) reste lu', async ({ page }) => {
    await gotoEditor(page, `<!-- holo:image {"displayMode":"half"} -->\n![moitie](${SMALL_PNG})\n`)
    const figure = page.locator('[data-testid="block-editor"] figure').filter({ has: page.locator('img[alt="moitie"]') })
    const editorWidth = (await page.locator('[data-testid="block-editor"]').boundingBox())!.width
    await expect.poll(async () => Math.round(((await figure.boundingBox())!.width / editorWidth) * 100)).toBeGreaterThanOrEqual(45)
  })
})
