import { test, expect, Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor-frame.html'

function historyModifier() {
  return process.platform === 'darwin' ? 'Meta' : 'Control'
}

async function waitForMd(page: Page, predicate: (md: string) => boolean, timeout = 5000): Promise<string> {
  let md = ''
  await expect(async () => {
    md = (await page.locator('#pw-editorframe-md-output').textContent()) ?? ''
    expect(predicate(md)).toBe(true)
  }).toPass({ timeout })
  return md
}

async function gotoEditorFrame(page: Page, markdown?: string) {
  if (markdown !== undefined) {
    await page.addInitScript((md) => { (window as Window & { __PW_MD__?: string }).__PW_MD__ = md }, markdown)
  }
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="editor-frame-fixture"]', { timeout: 10_000 })
  await page.waitForSelector('header textarea', { timeout: 10_000 })
}

async function installImageApiMock(page: Page) {
  await page.addInitScript(() => {
    const storedImages = new Map<string, string>()

    ;(window as Window & { holo?: unknown }).holo = {
      saveImage: async (name: string, dataBase64: string) => {
        const relativePath = `images/${name}`
        storedImages.set(relativePath, `data:image/gif;base64,${dataBase64}`)
        return { ok: true, relativePath, absolutePath: `/playwright-workspace/${relativePath}` }
      },
      loadImage: async (relativePath: string) => {
        const dataUrl = storedImages.get(relativePath)
        if (!dataUrl) {
          throw new Error(`Image not found: ${relativePath}`)
        }
        return { ok: true, dataUrl }
      },
    }
  })
}

async function installRemoteGifFetchMock(page: Page, url = 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif') {
  await page.addInitScript((payload) => {
    const gifUrl = payload.url
    const gifBase64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const target = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
      if (target === gifUrl) {
        const binary = atob(gifBase64)
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
        const blob = new Blob([bytes], { type: 'image/gif' })
        return new Response(blob, {
          status: 200,
          headers: {
            'Content-Type': 'image/gif',
          },
        })
      }

      return originalFetch(input, init)
    }
  }, { url })
}

async function dispatchGifPaste(page: Page, fileName = 'animated.gif') {
  const gifBase64 = 'R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

  await page.locator('[data-editor]').evaluate((element, payload) => {
    const binary = atob(payload.base64)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const file = new File([bytes], payload.fileName, { type: 'image/gif' })
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(file)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer })
    element.dispatchEvent(event)
  }, { base64: gifBase64, fileName })
}

async function dispatchRemoteGifHtmlPaste(page: Page, url: string) {
  await page.locator('[data-editor]').evaluate((element, payload) => {
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', payload.url)
    dataTransfer.setData('text/html', `<img src="${payload.url}" alt="gif" />`)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: dataTransfer })
    element.dispatchEvent(event)
  }, { url })
}

async function pressUndo(page: Page) {
  await page.keyboard.press(`${historyModifier()}+z`)
}

async function pressRedo(page: Page) {
  await page.keyboard.press(`${historyModifier()}+Shift+z`)
}

test.describe('EditorFrame — document history', () => {
  test('undo/redo restaure le titre et la description pas à pas', async ({ page }) => {
    await gotoEditorFrame(page, [
      '---',
      'title: Titre initial',
      'description: Description initiale',
      'author: Playwright',
      'created: 2026-06-05T00:00:00.000Z',
      'updated: 2026-06-05T00:00:00.000Z',
      '---',
      '',
      'Corps initial.',
      '',
    ].join('\n'))

    const titleField = page.getByPlaceholder('Untitled')
    const descriptionField = page.getByPlaceholder('Ajouter une description…')

    await titleField.fill('Titre modifie')
    await page.waitForTimeout(320)
    await waitForMd(page, (md) => md.includes('title: Titre modifie') && md.includes('description: Description initiale'))

    await descriptionField.fill('Description modifiee')
    await page.waitForTimeout(320)
    await waitForMd(page, (md) => md.includes('title: Titre modifie') && md.includes('description: Description modifiee'))

    await descriptionField.click()
    await pressUndo(page)
    await waitForMd(page, (md) => md.includes('title: Titre modifie') && md.includes('description: Description initiale'))

    await pressUndo(page)
    await waitForMd(page, (md) => md.includes('title: Titre initial') && md.includes('description: Description initiale'))

    await pressRedo(page)
    await waitForMd(page, (md) => md.includes('title: Titre modifie') && md.includes('description: Description initiale'))

    await pressRedo(page)
    const finalMd = await waitForMd(page, (md) => md.includes('title: Titre modifie') && md.includes('description: Description modifiee'))
    expect(finalMd).toContain('Corps initial.')
  })

  test('paste un GIF local et le rend dans le document', async ({ page }) => {
    await installImageApiMock(page)
    await gotoEditorFrame(page)

    await dispatchGifPaste(page)

    await expect(page.locator('img[src^="data:image/gif;base64,"]')).toHaveCount(1)

    const md = await waitForMd(page, (value) => value.includes('![](images/animated.gif)') || value.includes('![animated](images/animated.gif)'), 6000)
    expect(md).toContain('images/animated.gif')
  })

    test('paste un GIF sans nom conserve une extension gif', async ({ page }) => {
      await installImageApiMock(page)
      await gotoEditorFrame(page)

      await dispatchGifPaste(page, '')

      const md = await waitForMd(page, (value) => /images\/image-\d+\.gif/.test(value), 6000)
      expect(md).toMatch(/images\/image-\d+\.gif/)
    })

  test('paste un GIF distant depuis une source HTML conserve l animation gif', async ({ page }) => {
    const remoteGifUrl = 'https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif'
    await installImageApiMock(page)
    await installRemoteGifFetchMock(page, remoteGifUrl)
    await gotoEditorFrame(page)

    await dispatchRemoteGifHtmlPaste(page, remoteGifUrl)

    await expect(page.locator('img[src^="data:image/gif;base64,"]')).toHaveCount(1)

    const md = await waitForMd(page, (value) => value.includes('images/Rotating_earth_\\(large\\).gif'), 6000)
    expect(md).toContain('![Rotating\\_earth\\_(large)](images/Rotating_earth_\\(large\\).gif)')
  })
})