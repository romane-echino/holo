/**
 * realtimeSelection.spec.ts — Curseur, sélection et historique pendant qu'un
 * collègue tape dans le même champ
 *
 * - Un mot sélectionné (paragraphe, texte en gras, cellule, élément de liste)
 *   reste sélectionné quand un collègue tape dans le même champ : Retour
 *   arrière supprime ce mot, et rien d'autre.
 * - Un mot annulé puis rétabli revient, même pendant qu'un collègue tape.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const DOCUMENT = 'Notes.md'
const INITIAL = [
  '# Notes',
  '',
  'Para un.',
  '',
  'Para deux avec **gras** dedans.',
  '',
  '| A | B |',
  '| --- | --- |',
  '| cellule | |',
  '',
  '- Item un',
  '- Item deux',
  '',
  'Para fin.',
  '',
].join('\n')

type Person = 'alice' | 'bob'

/** Curseur au début (ou à la fin) du champ éditable de `locator`. */
async function placeCaret(page: Page, locator: Locator, edge: 'start' | 'end') {
  await locator.click({ timeout: 5_000 })
  await page.keyboard.press('ArrowRight')
  await locator.evaluate((element, atStart) => {
    const editable = (element.matches('[contenteditable="true"]') ? element : element.querySelector('[contenteditable="true"]')) as HTMLElement | null
    const target = editable ?? (element as HTMLElement)
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(atStart)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }, edge === 'start', { timeout: 5_000 })
}

/** Sélectionne le mot `word` dans le champ éditable de `locator`. */
async function selectWord(locator: Locator, word: string) {
  await locator.evaluate((element, target) => {
    const editable = (element.matches('[contenteditable="true"]') ? element : element.querySelector('[contenteditable="true"]')) as HTMLElement
    editable.focus()
    const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const index = node.textContent?.indexOf(target) ?? -1
      if (index === -1) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + target.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    throw new Error(`mot introuvable : ${target}`)
  }, word)
}

async function openBoth() {
  const people: Person[] = ['alice', 'bob']
  const repository = await setupSharedRepository(people, { [DOCUMENT]: INITIAL })
  const launched: Partial<Record<Person, Launched>> = {}
  for (const person of people) {
    const root = repository.clones[person]
    launched[person] = await launchHolo(root, path.join(root, DOCUMENT), person, `${person}@example.com`)
    await expect(launched[person]!.page.getByTestId('realtime-presence').first()).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
  }
  const read = (person: Person) => fs.readFile(path.join(repository.clones[person], DOCUMENT), 'utf8')
  return {
    alice: launched.alice!.page,
    bob: launched.bob!.page,
    read,
    async converged() {
      await expect.poll(async () => (await read('alice')) === (await read('bob')), { timeout: 30_000 }).toBe(true)
      return read('alice')
    },
    async close() {
      for (const person of people) await launched[person]?.app.close().catch(() => {})
      await repository.cleanup()
    },
  }
}

test.describe('Sélection et historique en direct', () => {
  test.setTimeout(240_000)

  test('un mot sélectionné reste sélectionné quand un collègue tape dans le même champ', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')
    const session = await openBoth()
    try {
      const { alice, bob } = session
      const fields: { name: string; word: string; locate: (page: Page) => Locator }[] = [
        { name: 'paragraphe', word: 'un', locate: (page) => page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Para un.' }) },
        { name: 'texte en gras', word: 'gras', locate: (page) => page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Para deux' }) },
        { name: 'cellule', word: 'cellule', locate: (page) => page.locator('table td[data-table-cell-key]').filter({ hasText: 'cellule' }).locator('[contenteditable="true"]') },
        { name: 'élément de liste', word: 'deux', locate: (page) => page.locator('[data-list-text]').filter({ hasText: 'Item deux' }) },
      ]
      for (const [index, field] of fields.entries()) {
        await test.step(field.name, async () => {
          const typed = `bo${index}q `
          // Le champ par ses identifiants partagés (les mêmes chez Alice et chez Bob).
          const selector = await field.locate(alice).evaluate((element) => {
            const item = element.closest('[data-list-item-id]')
            if (item) return `[data-list-item-id="${item.getAttribute('data-list-item-id')}"]`
            const cell = element.closest('td[data-row-id]')
            if (cell) return `td[data-row-id="${cell.getAttribute('data-row-id')}"][data-column-id="${cell.getAttribute('data-column-id')}"] [contenteditable="true"]`
            return `[data-block-id="${element.closest('[data-block-id]')!.getAttribute('data-block-id')}"] [contenteditable="true"]`
          })
          const before = (await alice.locator(selector).innerText()).trim()
          await selectWord(alice.locator(selector), field.word)
          // Bob tape au début du même champ.
          await placeCaret(bob, bob.locator(selector), 'start')
          await bob.keyboard.insertText(typed)
          await expect(alice.locator(selector)).toContainText(typed.trim(), { timeout: 15_000 })
          expect(await alice.evaluate(() => window.getSelection()?.toString()), `sélection d'Alice (${field.name})`).toBe(field.word)
          await alice.keyboard.press('Backspace')
          // Le mot et lui seul a disparu ; ce que Bob a tapé est là.
          const expected = `${typed}${before.replace(field.word, '')}`.replace(/\s+/g, ' ').trim()
          await expect.poll(async () => (await alice.locator(selector).innerText()).replace(/\s+/g, ' ').trim(), { timeout: 5_000 }).toBe(expected)
        })
      }
      // Dernière suppression enregistrée (après la pause de saisie) et reçue par Bob.
      await expect.poll(async () => !(await session.read('alice')).includes('Item deux') && !(await session.read('bob')).includes('Item deux'), { timeout: 15_000 }).toBe(true)
      const final = await session.converged()
      for (const [index] of fields.entries()) expect(final).toContain(`bo${index}q`)
      expect(final).toContain('Para .')
      expect(final).not.toContain('gras')
      expect(final).toContain('Item ')
      expect(final).not.toContain('Item deux')
    } finally {
      await session.close()
    }
  })

  test('le curseur d un collègue qui tape en fin de paragraphe avance sans revenir au début', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')
    const session = await openBoth()
    try {
      const { alice, bob } = session
      const field = (page: Page) => page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Para fin.' })
      await placeCaret(bob, field(bob), 'end')
      await expect(alice.locator('[data-remote-cursor="bob"]')).toBeVisible({ timeout: 10_000 })
      await alice.waitForTimeout(500)
      // Position horizontale du curseur de Bob chez Alice, à chaque image.
      await alice.evaluate(() => {
        const samples: number[] = []
        ;(window as unknown as { __cursorX: number[] }).__cursorX = samples
        const tick = () => {
          const cursor = document.querySelector('[data-remote-cursor="bob"]')
          if (cursor) samples.push(Math.round(cursor.getBoundingClientRect().left))
          if (samples.length < 600) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      // Des espaces en fin de champ : leur position arrive avant le texte (ou
      // n'est pas affichée), ce qui renvoyait le curseur au début du paragraphe.
      await bob.keyboard.type(' un deux trois quatre', { delay: 120 })
      await expect(field(alice)).toContainText('quatre', { timeout: 15_000 })
      await alice.waitForTimeout(500)
      const xs = await alice.evaluate(() => (window as unknown as { __cursorX: number[] }).__cursorX)
      expect(xs.length).toBeGreaterThan(10)
      const backwards = xs.filter((x, index) => index > 0 && x < xs[index - 1] - 20)
      expect(backwards, `positions successives : ${xs.filter((x, index) => index === 0 || x !== xs[index - 1]).join(' ')}`).toEqual([])
    } finally {
      await session.close()
    }
  })

  test('un mot annulé puis rétabli revient, même quand un collègue tape', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')
    const session = await openBoth()
    try {
      const { alice, bob } = session
      let stop = false
      const bobTyping = (async () => {
        let index = 0
        while (!stop) {
          const targets = bob.locator('[data-block-type="paragraph"][contenteditable], table td[data-table-cell-key] [contenteditable="true"], [data-list-text]')
          const target = targets.nth(index % Math.max(1, await targets.count()))
          index += 1
          await placeCaret(bob, target, 'end').catch(() => undefined)
          await bob.keyboard.insertText(` bo${index}q`).catch(() => undefined)
          await bob.waitForTimeout(80 + (index % 5) * 40)
        }
      })()
      const rounds = 20
      for (let round = 1; round <= rounds; round += 1) {
        const paragraphs = alice.locator('[data-block-type="paragraph"][contenteditable]')
        await placeCaret(alice, paragraphs.nth(round % Math.max(1, await paragraphs.count())), 'end')
        await alice.keyboard.insertText(` al${round}q`)
        await alice.keyboard.press('ControlOrMeta+z')
        await alice.waitForTimeout(150)
        await alice.keyboard.press('ControlOrMeta+Shift+z')
        await alice.waitForTimeout(300)
      }
      stop = true
      await bobTyping
      const final = await session.converged()
      const problems: string[] = []
      for (let round = 1; round <= rounds; round += 1) {
        const occurrences = final.split(`al${round}q`).length - 1
        if (occurrences !== 1) problems.push(`al${round}q : ${occurrences} fois`)
      }
      expect(problems, final).toEqual([])
    } finally {
      await session.close()
    }
  })
})
