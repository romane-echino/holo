/**
 * realtimeTeamDocument.spec.ts — Un document complet construit à trois, en direct
 *
 * Trois instances Holo (Alice, Bob, Chloé) sur trois clones d'un même dépôt
 * (servi en HTTP), reliées par le relais Codenotch local, rédigent ensemble un
 * compte rendu : tableau rempli cellule par cellule en même temps, lignes vides,
 * liste, paragraphes, image glissée. À la fin, les trois documents sont
 * identiques, chaque saisie est intacte et à sa place (aucun curseur n'a sauté),
 * l'image s'affiche chez tout le monde et aucun conflit n'est signalé.
 *
 * Nécessite un runtime Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`). Ignoré sinon.
 */
import { test, expect, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { git, launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const DOCUMENT = 'Comptes rendus/Réunion équipe.md'
const INITIAL = [
  '# Réunion équipe',
  '',
  'Introduction.',
  '',
  '| Sujet | Responsable | Statut |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '|  |  |  |',
  '',
  '- Point 1',
  '- Point 2',
  '',
  'Conclusion.',
  '',
].join('\n')

// PNG 8×8 rouge.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'

/** Saisie au rythme d'une personne, pour que les frappes des trois s'entremêlent. */
const TYPING_DELAY_MS = 35

function presence(page: Page) {
  return page.getByTestId('realtime-presence').first()
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

function cell(page: Page, row: number, column: number) {
  return page.locator('table tbody tr').nth(row).locator('td[data-table-cell-key]').nth(column).locator('[contenteditable="true"]')
}

function listItem(page: Page, text: string) {
  return page.locator('[data-list-text]').filter({ hasText: text })
}

async function typeInCell(page: Page, row: number, column: number, text: string) {
  await cell(page, row, column).click()
  await page.keyboard.type(text, { delay: TYPING_DELAY_MS })
}

async function appendAtEnd(locator: ReturnType<Page['locator']>, page: Page, text: string) {
  await locator.click()
  await page.keyboard.press('End')
  await page.keyboard.type(text, { delay: TYPING_DELAY_MS })
}

/** Un clic dans une cellule sélectionne tout son contenu : → place le curseur à la fin. */
async function appendInCell(page: Page, row: number, column: number, text: string) {
  await cell(page, row, column).click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type(text, { delay: TYPING_DELAY_MS })
}

/** Texte des cellules du tableau (lignes de données). */
async function tableTexts(page: Page): Promise<string[][]> {
  return page.locator('table tbody tr').evaluateAll((rows) => rows.map((row) => Array.from(row.querySelectorAll('td[data-table-cell-key]')).map((td) => (td.textContent ?? '').trim())))
}

async function dropImage(page: Page, onText: string) {
  const target = paragraph(page, onText).first()
  await target.click()
  await target.evaluate((element, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], 'schema.png', { type: 'image/png' }))
    const rect = element.getBoundingClientRect()
    const init = { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: rect.left + 4, clientY: rect.top + 4 }
    element.dispatchEvent(new DragEvent('dragover', init))
    element.dispatchEvent(new DragEvent('drop', init))
  }, PNG_BASE64)
}

test.describe('Document construit en équipe, en direct (relais Codenotch)', () => {
  test.setTimeout(240_000)

  test('trois personnes rédigent ensemble un compte rendu complet', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const people = ['alice', 'bob', 'chloe'] as const
    const repository = await setupSharedRepository([...people], { [DOCUMENT]: INITIAL, 'README.md': '# Équipe\n' })
    const launched: Partial<Record<(typeof people)[number], Launched>> = {}
    try {
      const names = { alice: 'Alice Martin', bob: 'Bob Keller', chloe: 'Chloé Durand' }
      for (const person of people) {
        const root = repository.clones[person]
        launched[person] = await launchHolo(root, path.join(root, DOCUMENT), names[person], `${person}@example.com`)
        await expect(presence(launched[person]!.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      }
      const alice = launched.alice!.page
      const bob = launched.bob!.page
      const chloe = launched.chloe!.page
      for (const page of [alice, bob, chloe]) {
        await expect(presence(page).getByLabel(/Alice Martin|Bob Keller|Chloé Durand/)).toHaveCount(2, { timeout: 20_000 })
      }

      // 1. Tableau : trois cellules remplies en même temps, dont deux sur la
      //    même ligne. Personne ne doit être renvoyé dans une autre cellule.
      await Promise.all([
        typeInCell(alice, 0, 0, 'Budget 2027'),
        typeInCell(bob, 0, 1, 'Bob Keller'),
        typeInCell(chloe, 1, 0, 'Recrutement'),
      ])
      await Promise.all([
        typeInCell(alice, 0, 2, 'Validé'),
        typeInCell(bob, 1, 1, 'Chloé'),
        typeInCell(chloe, 1, 2, 'En cours'),
      ])
      const expectedTable = [['Budget 2027', 'Bob Keller', 'Validé'], ['Recrutement', 'Chloé', 'En cours']]
      for (const page of [alice, bob, chloe]) {
        await expect.poll(() => tableTexts(page), { timeout: 20_000 }).toEqual(expectedTable)
      }

      // 2. Ligne vide : Alice ouvre une nouvelle ligne pendant que les autres
      //    tapent ; elle ne disparaît pas et Alice y écrit ensuite.
      await paragraph(alice, 'Introduction.').click()
      await alice.keyboard.press('End')
      await alice.keyboard.press('Enter')
      await Promise.all([
        appendAtEnd(listItem(bob, 'Point 1'), bob, ' : validé par Bob'),
        appendAtEnd(paragraph(chloe, 'Conclusion.'), chloe, ' Prochaine réunion lundi.'),
      ])
      await alice.keyboard.type('Ordre du jour validé.', { delay: TYPING_DELAY_MS })
      for (const page of [alice, bob, chloe]) {
        await expect(paragraph(page, 'Ordre du jour validé.')).toBeVisible({ timeout: 20_000 })
        await expect(listItem(page, 'Point 1 : validé par Bob')).toBeVisible({ timeout: 20_000 })
        await expect(paragraph(page, 'Conclusion. Prochaine réunion lundi.')).toBeVisible({ timeout: 20_000 })
      }

      // 3. Liste et paragraphes en parallèle : Chloé ajoute un point, Bob
      //    complète l'introduction, Alice tape dans le tableau.
      await Promise.all([
        (async () => {
          await listItem(chloe, 'Point 2').click()
          await chloe.keyboard.press('End')
          await chloe.keyboard.press('Enter')
          await chloe.keyboard.type('Point 3 ajouté par Chloé', { delay: TYPING_DELAY_MS })
        })(),
        appendAtEnd(paragraph(bob, 'Introduction.'), bob, ' Merci à tous.'),
        appendInCell(alice, 1, 2, ' (80 %)'),
      ])
      for (const page of [alice, bob, chloe]) {
        await expect(listItem(page, 'Point 3 ajouté par Chloé')).toBeVisible({ timeout: 20_000 })
        await expect(paragraph(page, 'Introduction. Merci à tous.')).toBeVisible({ timeout: 20_000 })
        await expect.poll(async () => (await tableTexts(page))[1][2], { timeout: 20_000 }).toBe('En cours (80 %)')
      }

      // 4. Image glissée par Alice dans un document situé dans un sous-dossier :
      //    le lien est relatif au document et l'image arrive chez les autres.
      await dropImage(alice, 'Ordre du jour validé.')
      const aliceImage = alice.locator('img[src^="data:image"]').first()
      await expect(aliceImage).toBeVisible({ timeout: 15_000 })
      for (const page of [bob, chloe]) {
        await expect(page.locator('img[src^="data:image"]').first()).toBeVisible({ timeout: 45_000 })
      }

      // 5. Tout le monde converge : mêmes documents sur les trois postes, et
      //    l'historique git reçoit le document final, sans conflit.
      const readDocument = (person: (typeof people)[number]) => fs.readFile(path.join(repository.clones[person], DOCUMENT), 'utf8')
      await expect.poll(async () => {
        const [a, b, c] = await Promise.all(people.map(readDocument))
        return a === b && b === c
      }, { timeout: 30_000 }).toBe(true)
      const final = await readDocument('alice')
      const order = [
        '# Réunion équipe',
        'Introduction. Merci à tous.',
        'Ordre du jour validé.',
        '](../images/schema-',
        '| Budget 2027 | Bob Keller',
        '| Recrutement | Chloé',
        'En cours (80 %)',
        'Point 1 : validé par Bob',
        'Point 2',
        'Point 3 ajouté par Chloé',
        'Conclusion. Prochaine réunion lundi.',
      ]
      let cursor = 0
      for (const fragment of order) {
        const index = final.indexOf(fragment, cursor)
        expect(index, `« ${fragment} » manquant ou mal placé dans :\n${final}`).toBeGreaterThanOrEqual(0)
        cursor = index
      }
      const imageName = /\]\(\.\.\/images\/(schema-[0-9a-f]{8}\.png)\)/.exec(final)?.[1]
      expect(imageName).toBeTruthy()
      for (const person of people) {
        await expect.poll(() => fs.access(path.join(repository.clones[person], 'images', imageName!)).then(() => true, () => false), { timeout: 30_000 }).toBe(true)
      }

      for (const page of [alice, bob, chloe]) {
        await expect(page.getByText('se chevauchent')).toHaveCount(0)
        await expect(page.getByText('Conflit')).toHaveCount(0)
      }
      // Rien n'est resté sans être envoyé : les trois dépôts finissent alignés sur le serveur.
      await expect.poll(async () => {
        const heads = await Promise.all(people.map(async (person) => {
          await git(repository.clones[person], 'fetch', '--quiet').catch(() => undefined)
          return git(repository.clones[person], 'status', '--porcelain=v1', '--branch')
        }))
        return heads.every((status) => !/ahead|behind/.test(status.split('\n')[0]))
      }, { timeout: 90_000, intervals: [3_000] }).toBe(true)
    } finally {
      for (const person of people) await launched[person]?.app.close().catch(() => {})
      await repository.cleanup()
      for (const person of people) {
        if (launched[person]) await fs.rm(launched[person]!.configHome, { recursive: true, force: true }).catch(() => {})
      }
    }
  })
})
