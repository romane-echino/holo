import { test, expect, Page } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/markdown-renderer.html'

async function gotoRenderer(page: Page, markdown?: string) {
  if (markdown !== undefined) {
    await page.addInitScript((md) => { (window as Window & { __PW_MD__?: string }).__PW_MD__ = md }, markdown)
  }
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="markdown-renderer-fixture"]', { timeout: 10_000 })
}

test.describe('MarkdownRenderer — footnotes tooltip', () => {
  test('une référence de note affiche un tooltip et masque la section de bas de page', async ({ page }) => {
    await gotoRenderer(page, [
      'Here is a simple footnote[^1].',
      '',
      '[^1]: My reference tooltip.',
    ].join('\n'))

    const footnoteRef = page.locator('a[href*="#user-content-fn-1"], a[href*="#fn-1"]').first()
    await expect(footnoteRef).toBeVisible()
    await footnoteRef.hover()

    const tooltip = page.getByTestId('footnote-tooltip')
    await expect(tooltip).toBeVisible()
    await expect(tooltip).toContainText('My reference tooltip.')
    await expect(page.locator('.footnotes')).toHaveCount(0)
  })
})