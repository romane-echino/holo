/**
 * tableImages.spec.ts — Images dans les tableaux et copie d'images
 *
 * Retours utilisateurs :
 *   - « On ne peut pas mettre d'image dans un tableau »
 *   - « Pouvoir copier une image depuis Holo »
 */
import { test, expect, type Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor-frame.html'
const GIF_BASE64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const TABLE_DOC = [
  '---',
  'title: Tableau avec images',
  '---',
  '',
  '| Produit | Visuel |',
  '| --- | --- |',
  '| Lampe | ![existant](images/existant.gif) |',
  '| Chaise | à illustrer |',
  '',
  'Fin.',
  '',
].join('\n')

async function gotoEditorFrame(page: Page, markdown: string) {
  await page.addInitScript((md) => { (window as Window & { __PW_MD__?: string }).__PW_MD__ = md }, markdown)
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="editor-frame-fixture"]', { timeout: 10_000 })
}

async function readMd(page: Page) {
  return (await page.locator('#pw-editorframe-md-output').textContent()) ?? ''
}

/** Faux pont Electron : stockage d'images en mémoire + presse-papiers espion. */
async function installHoloMock(page: Page, options: { copiedHoloImage?: string } = {}) {
  await page.addInitScript((payload) => {
    const stored = new Map<string, string>([['images/existant.gif', `data:image/gif;base64,${payload.gif}`]])
    const calls: { writeClipboardImage: string[]; saveImage: string[] } = { writeClipboardImage: [], saveImage: [] }
    ;(window as unknown as { __holoCalls: typeof calls }).__holoCalls = calls
    ;(window as Window & { holo?: unknown }).holo = {
      saveImage: async (name: string, dataBase64: string) => {
        const relativePath = `images/${name}`
        calls.saveImage.push(relativePath)
        stored.set(relativePath, `data:image/gif;base64,${dataBase64}`)
        return { ok: true, relativePath, absolutePath: `/playwright-workspace/${relativePath}` }
      },
      loadImage: async (relativePath: string) => {
        const dataUrl = stored.get(relativePath)
        if (!dataUrl) throw new Error(`Image not found: ${relativePath}`)
        return { ok: true, dataUrl }
      },
      writeClipboardImage: async (source: string) => {
        calls.writeClipboardImage.push(source)
        return { ok: true }
      },
      writeClipboardText: async () => ({ ok: true }),
      getCopiedHoloImage: async () => payload.copiedHoloImage ?? null,
    }
  }, { gif: GIF_BASE64, copiedHoloImage: options.copiedHoloImage })
}

function bodyCell(page: Page, index: number) {
  return page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]').nth(index)
}

async function pasteGifInto(page: Page, cellIndex: number, fileName: string) {
  const cell = bodyCell(page, cellIndex)
  await cell.click()
  await page.keyboard.press('End')
  await cell.evaluate((element, payload) => {
    const bytes = Uint8Array.from(atob(payload.gif), (char) => char.charCodeAt(0))
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File([bytes], payload.fileName, { type: 'image/gif' }))
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer })
    element.dispatchEvent(event)
  }, { gif: GIF_BASE64, fileName })
}

test.describe('Images dans les tableaux', () => {
  test('une image existante dans une cellule est affichée', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, TABLE_DOC)

    const image = bodyCell(page, 1).locator('img[data-md-image]')
    await expect(image).toHaveAttribute('src', /^data:image\/gif;base64,/)
    await expect(image).toHaveAttribute('data-md-src', 'images/existant.gif')
  })

  test('coller une image dans une cellule l insère dans la cellule, pas sous le tableau', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, TABLE_DOC)

    await pasteGifInto(page, 3, 'chaise.gif')

    await expect.poll(() => readMd(page)).toContain('| Chaise | à illustrer![chaise](images/chaise.gif) |')
    // Aucun bloc image séparé n'a été créé.
    expect((await readMd(page)).match(/^!\[chaise\]/m)).toBeNull()
    await expect(bodyCell(page, 3).locator('img[data-md-image]')).toHaveAttribute('src', /^data:image\/gif/)
  })

  test('éditer le texte d une cellule conserve son image', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, TABLE_DOC)

    const cell = bodyCell(page, 0)
    await cell.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' LED')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Fin.' }).click()

    await expect.poll(() => readMd(page)).toContain('| Lampe LED | ![existant](images/existant.gif) |')
  })

  test('coller une image copiée depuis Holo réutilise le fichier existant', async ({ page }) => {
    await installHoloMock(page, { copiedHoloImage: 'images/existant.gif' })
    await gotoEditorFrame(page, TABLE_DOC)

    await pasteGifInto(page, 3, 'image.gif')

    await expect.poll(() => readMd(page)).toContain('| Chaise | à illustrer![existant](images/existant.gif) |')
    const calls = await page.evaluate(() => (window as unknown as { __holoCalls: { saveImage: string[] } }).__holoCalls)
    expect(calls.saveImage).toEqual([])
  })
})

test.describe('Copier une image', () => {
  const IMAGE_DOC = ['---', 'title: Image', '---', '', 'Avant.', '', '![photo](images/existant.gif)', '', 'Après.', ''].join('\n')

  test('le bouton « Copier l image » copie l image dans le presse-papiers système', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, IMAGE_DOC)

    const figure = page.locator('figure').filter({ has: page.locator('img[alt="photo"]') })
    await figure.hover()
    await figure.getByRole('button', { name: 'Copier l\'image' }).click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { __holoCalls: { writeClipboardImage: string[] } }).__holoCalls.writeClipboardImage))
      .toEqual(['images/existant.gif'])
    await expect(page.getByText('Image copiée')).toBeVisible()
  })

  test('clic droit sur une image propose de la copier', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, IMAGE_DOC)

    await page.locator('img[alt="photo"]').click({ button: 'right' })
    await page.getByRole('button', { name: 'Copier l\'image' }).last().click()

    await expect.poll(() => page.evaluate(() => (window as unknown as { __holoCalls: { writeClipboardImage: string[] } }).__holoCalls.writeClipboardImage))
      .toEqual(['images/existant.gif'])
  })

  test('Cmd/Ctrl+C sur une image sélectionnée la copie aussi en tant qu image', async ({ page }) => {
    await installHoloMock(page)
    await gotoEditorFrame(page, IMAGE_DOC)

    await page.locator('img[alt="photo"]').click()
    await page.keyboard.press('ControlOrMeta+C')

    await expect.poll(() => page.evaluate(() => (window as unknown as { __holoCalls: { writeClipboardImage: string[] } }).__holoCalls.writeClipboardImage))
      .toEqual(['images/existant.gif'])
  })
})
