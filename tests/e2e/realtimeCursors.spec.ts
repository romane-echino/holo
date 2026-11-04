/**
 * realtimeCursors.spec.ts — Curseur et cadre d'un collègue
 *
 * Le curseur d'un collègue est repéré par l'identifiant partagé de son bloc :
 * des paragraphes ajoutés au-dessus ne le déplacent pas sur un autre bloc.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const DOCUMENT = 'Notes.md'

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

/** Curseur à la fin du paragraphe contenant `text`. */
async function caretAtEnd(page: Page, text: string) {
  const field = paragraph(page, text)
  await field.click()
  await field.evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    range.collapse(false)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

test.describe('Curseurs des collègues', () => {
  test.setTimeout(180_000)

  test('des paragraphes ajoutés au-dessus ne déplacent pas le cadre d un collègue sur un autre bloc', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')
    const repository = await setupSharedRepository(['alice', 'bob'], { [DOCUMENT]: '# Notes\n\nPara un.\n\nPara fin.\n' })
    const launched: Launched[] = []
    try {
      for (const person of ['alice', 'bob']) {
        const root = repository.clones[person]
        const instance = await launchHolo(root, path.join(root, DOCUMENT), person, `${person}@example.com`)
        await expect(instance.page.getByTestId('realtime-presence').first()).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
        launched.push(instance)
      }
      const [alice, bob] = launched.map((instance) => instance.page)
      const frame = alice.locator('[data-remote-block="bob"]')
      const frameOnParaFin = async () => {
        const [box, target] = [await frame.boundingBox(), await paragraph(alice, 'Para fin.').boundingBox()]
        return Boolean(box && target && box.y <= target.y && box.y + box.height >= target.y + target.height)
      }

      await caretAtEnd(bob, 'Para fin.')
      await expect.poll(frameOnParaFin, { timeout: 10_000 }).toBe(true)

      // Alice ajoute trois paragraphes au-dessus ; Bob ne bouge pas.
      await caretAtEnd(alice, 'Para un.')
      for (const line of ['Ajout un.', 'Ajout deux.', 'Ajout trois.']) {
        await alice.keyboard.press('Enter')
        await alice.keyboard.insertText(line)
      }
      await expect(paragraph(bob, 'Ajout trois.')).toBeVisible({ timeout: 15_000 })
      await alice.waitForTimeout(1_000)
      expect(await frameOnParaFin(), 'le cadre de Bob est resté sur « Para fin. »').toBe(true)
    } finally {
      for (const instance of launched) await instance.app.close().catch(() => {})
      await repository.cleanup()
    }
  })
})
