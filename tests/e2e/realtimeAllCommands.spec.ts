/**
 * realtimeAllCommands.spec.ts — Toutes les commandes de l'éditeur, en direct
 *
 * Deux instances Holo (Alice, Bob) sur deux clones d'un même dépôt (servi en
 * HTTP), reliées par le relais Codenotch local :
 * - Alice crée un bloc de chaque type du menu « / » (22 commandes) et le
 *   remplit, pendant que Bob tape sans s'arrêter dans un autre paragraphe ;
 * - Alice applique toutes les mises en forme (gras, italique, code, souligné,
 *   barré, exposant, indice, lien) ;
 * - images importées des deux côtés : collée, déposée sur un paragraphe,
 *   déposée dans une cellule de tableau.
 * À la fin, les deux documents sont identiques, contiennent tout, la saisie de
 * Bob est intacte et les images s'affichent chez les deux.
 *
 * Nécessite un runtime Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`). Ignoré sinon.
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const DOCUMENT = 'Notes/Toutes les commandes.md'
const INITIAL = ['# Toutes les commandes', '', 'Début.', '', 'Fin.', ''].join('\n')
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC'
const GIF_BASE64 = 'R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

function presence(page: Page) {
  return page.getByTestId('realtime-presence').first()
}

function paragraph(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

/** Nouveau paragraphe vide juste après « Fin. », puis menu « / » filtré. */
async function slashCommand(page: Page, filter: string, label: string) {
  await paragraph(page, 'Fin.').first().click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForSelector('[data-testid="slash-popup"]', { timeout: 5_000 })
  await page.waitForTimeout(80)
  await page.keyboard.type(filter)
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForSelector('[data-testid="slash-popup"]', { state: 'hidden', timeout: 5_000 })
  // Le nouveau bloc prend le focus à l'image suivante : on attend comme le ferait une personne.
  await page.waitForTimeout(150)
}

/** Attend que la zone de saisie du bloc créé ait le focus (elle le prend à l'image suivante). */
async function waitForFieldFocus(page: Page) {
  await page.waitForFunction(() => ['TEXTAREA', 'INPUT'].includes(document.activeElement?.tagName ?? ''), undefined, { timeout: 5_000 })
}

/** Quitte un bloc édité dans une zone de saisie (les blocs spéciaux s'enregistrent en la quittant). */
async function leaveBlock(page: Page) {
  await paragraph(page, 'Fin.').first().click()
}

async function selectWord(locator: Locator, word: string) {
  await locator.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
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
    throw new Error(`« ${target} » introuvable`)
  }, word)
}

async function dispatchImage(locator: Locator, kind: 'paste' | 'drop', name: string, mime: string, base64: string) {
  await locator.evaluate((element, args) => {
    const bytes = Uint8Array.from(atob(args.base64), (char) => char.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], args.name, { type: args.mime }))
    const rect = element.getBoundingClientRect()
    if (args.kind === 'paste') {
      element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
      return
    }
    const init = { dataTransfer: transfer, bubbles: true, cancelable: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }
    element.dispatchEvent(new DragEvent('dragover', init))
    element.dispatchEvent(new DragEvent('drop', init))
  }, { kind, name, mime, base64 })
}

type Step = { name: string; run: (page: Page) => Promise<void>; expected: RegExp[] }

const STEPS: Step[] = [
  ...([1, 2, 3, 4] as const).map((depth): Step => ({
    name: `Titre ${depth}`,
    run: async (page) => {
      await slashCommand(page, `h${depth}`, `Titre ${depth}`)
      await page.keyboard.type(`Titre niveau ${depth}`)
    },
    expected: [new RegExp(`^${'#'.repeat(depth)} Titre niveau ${depth}$`, 'm')],
  })),
  {
    name: 'Paragraphe',
    run: async (page) => {
      await slashCommand(page, 'para', 'Paragraphe')
      await page.keyboard.type('Paragraphe via la commande.')
    },
    expected: [/^Paragraphe via la commande\.$/m],
  },
  {
    name: 'Liste à puces',
    run: async (page) => {
      await slashCommand(page, 'puce', 'Liste à puces')
      await page.keyboard.type('Puce A')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Puce B')
    },
    expected: [/^[-*] Puce A\n[-*] Puce B$/m],
  },
  {
    name: 'Liste numérotée',
    run: async (page) => {
      await slashCommand(page, 'numer', 'Liste numérotée')
      await page.keyboard.type('Numéro un')
      await page.keyboard.press('Enter')
      await page.keyboard.type('Numéro deux')
    },
    // « 1) » quand la liste suit directement une autre liste numérotée (sinon elles fusionneraient).
    expected: [/^1[.)] Numéro un\n2[.)] Numéro deux$/m],
  },
  {
    name: 'Liste alphabétique',
    run: async (page) => {
      await slashCommand(page, 'alpha', 'Liste alphabétique')
      await page.keyboard.type('Lettre a')
    },
    expected: [/<!-- list-style:alpha -->\s*\n+1\. Lettre a/],
  },
  {
    name: 'Checklist',
    run: async (page) => {
      await slashCommand(page, 'check', 'Checklist')
      await page.keyboard.type('Tâche à faire')
    },
    expected: [/^[-*] \[ \] Tâche à faire$/m],
  },
  {
    name: 'Tableau',
    run: async (page) => {
      await slashCommand(page, 'tableau', 'Tableau')
      const table = page.locator('table').last()
      await table.locator('td[data-table-cell-key] [contenteditable="true"]').first().click()
      await page.keyboard.type('Cellule A1')
    },
    expected: [/^\|.*\|\n\|\s*:?-{2,}.*\|\n\| Cellule A1 \|/m],
  },
  {
    name: 'Bloc de code',
    run: async (page) => {
      await slashCommand(page, 'code', 'Bloc de code')
      // Éditeur CodeMirror (zone .cm-content éditable).
      await page.locator('.cm-content').last().click()
      await page.keyboard.type('const total = 42')
      await page.keyboard.press('Escape')
      await leaveBlock(page)
    },
    expected: [/^```[\w-]*\nconst total = 42\n```$/m],
  },
  {
    name: 'Bloc HTML',
    run: async (page) => {
      await slashCommand(page, 'html', 'Bloc HTML')
      await waitForFieldFocus(page)
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('<b>HTML en direct</b>')
      await leaveBlock(page)
    },
    expected: [/<b>HTML en direct<\/b>/],
  },
  {
    name: 'Vidéo YouTube',
    run: async (page) => {
      await slashCommand(page, 'youtube', 'Vidéo YouTube')
      await waitForFieldFocus(page)
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
      await page.keyboard.press('Enter')
      await leaveBlock(page)
    },
    expected: [/dQw4w9WgXcQ/],
  },
  {
    name: 'Diagramme Mermaid',
    run: async (page) => {
      await slashCommand(page, 'mermaid', 'Diagramme Mermaid')
      await waitForFieldFocus(page)
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('graph TD\nAlice-->Bob')
      await leaveBlock(page)
    },
    expected: [/^```mermaid\ngraph TD\nAlice-->Bob\n```$/m],
  },
  {
    name: 'Section repliable',
    run: async (page) => {
      await slashCommand(page, 'repli', 'Section repliable')
      await waitForFieldFocus(page)
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('Résumé repliable')
      await page.keyboard.press('Tab')
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('Contenu caché')
      await leaveBlock(page)
    },
    expected: [/<summary>Résumé repliable<\/summary>/, /Contenu caché/],
  },
  {
    name: 'LaTeX / Formule',
    run: async (page) => {
      await slashCommand(page, 'latex', 'LaTeX / Formule')
      await waitForFieldFocus(page)
      await page.keyboard.press('ControlOrMeta+a')
      await page.keyboard.type('E = mc^2')
      await leaveBlock(page)
    },
    expected: [/^\$\$\nE = mc\^2\n\$\$$/m],
  },
  {
    name: 'Citation',
    run: async (page) => {
      await slashCommand(page, 'citation', 'Citation')
      await page.keyboard.type('Une citation en direct')
    },
    expected: [/^> Une citation en direct$/m],
  },
  ...(['note', 'astuce', 'importante', 'attention', 'prudence'] as const).map((kind): Step => {
    const marker = { note: 'NOTE', astuce: 'TIP', importante: 'IMPORTANT', attention: 'WARNING', prudence: 'CAUTION' }[kind]
    return {
      name: `Alerte ${kind}`,
      run: async (page) => {
        await slashCommand(page, kind, `Alerte ${kind}`)
        await page.keyboard.type(`Alerte ${marker.toLowerCase()} en direct`)
      },
      expected: [new RegExp(`^> \\[!${marker}\\]\\n> Alerte ${marker.toLowerCase()} en direct$`, 'm')],
    }
  }),
  {
    name: 'Séparateur',
    run: async (page) => {
      await slashCommand(page, 'separ', 'Séparateur')
    },
    expected: [/^(\*\*\*|---|___)$/m],
  },
]

const FORMATS: Array<{ word: string; keys?: string; expected: RegExp }> = [
  { word: 'gras', keys: 'ControlOrMeta+b', expected: /\*\*gras\*\*/ },
  { word: 'italique', keys: 'ControlOrMeta+i', expected: /(\*|_)italique\1/ },
  { word: 'codé', keys: 'ControlOrMeta+e', expected: /`codé`/ },
  { word: 'souligné', keys: 'ControlOrMeta+u', expected: /<u>souligné<\/u>/ },
  { word: 'barré', keys: 'ControlOrMeta+Shift+s', expected: /~~barré~~/ },
  { word: 'exposant', keys: 'ControlOrMeta+.', expected: /<sup>exposant<\/sup>/ },
  { word: 'indice', keys: 'ControlOrMeta+,', expected: /<sub>indice<\/sub>/ },
  { word: 'lien', expected: /\[lien\]\(https:\/\/echino\.com\/?\)/ },
]

test.describe('Toutes les commandes, en direct (relais Codenotch)', () => {
  test.setTimeout(360_000)

  test('blocs, mises en forme et images, pendant qu un collègue tape', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const people = ['alice', 'bob'] as const
    const repository = await setupSharedRepository([...people], { [DOCUMENT]: INITIAL })
    const launched: Partial<Record<(typeof people)[number], Launched>> = {}
    try {
      const names = { alice: 'Alice Martin', bob: 'Bob Keller' }
      for (const person of people) {
        const root = repository.clones[person]
        launched[person] = await launchHolo(root, path.join(root, DOCUMENT), names[person], `${person}@example.com`)
        await expect(presence(launched[person]!.page)).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      }
      const alice = launched.alice!.page
      const bob = launched.bob!.page
      await expect(presence(alice).getByLabel('Bob Keller')).toBeVisible({ timeout: 20_000 })

      // 1. Alice crée un bloc de chaque type pendant que Bob tape sans arrêt.
      let aliceDone = false
      const bobWords: string[] = []
      const bobTyping = (async () => {
        await paragraph(bob, 'Début.').first().click()
        await bob.keyboard.press('End')
        for (let index = 1; !aliceDone && index <= 400; index += 1) {
          const word = ` mot${index}`
          await bob.keyboard.type(word, { delay: 25 })
          bobWords.push(word)
          await bob.waitForTimeout(120)
        }
      })()
      try {
        for (const step of STEPS) {
          await test.step(step.name, () => step.run(alice))
        }
      } finally {
        aliceDone = true
        await bobTyping
      }
      const bobSentence = `Début.${bobWords.join('')}`

      // 2. Mises en forme, appliquées une par une à des mots sélectionnés.
      await paragraph(alice, 'Fin.').first().click()
      await alice.keyboard.press('End')
      await alice.keyboard.press('Enter')
      await alice.keyboard.type(`Formats : ${FORMATS.map((format) => format.word).join(' ')} fin.`)
      const formatted = paragraph(alice, 'Formats :').first()
      for (const format of FORMATS) {
        await test.step(`format ${format.word}`, async () => {
          await formatted.scrollIntoViewIfNeeded()
          await selectWord(formatted, format.word)
          if (format.keys) {
            await alice.keyboard.press(format.keys)
          } else {
            await alice.getByRole('button', { name: 'Ajouter un lien (Ctrl+K)' }).click()
            await alice.getByPlaceholder('https://… ou nom de page').fill('https://echino.com')
            await alice.keyboard.press('Enter')
          }
        })
      }
      await leaveBlock(alice)

      // 3. Images importées des deux côtés : collée, déposée sur un paragraphe, déposée dans une cellule.
      await paragraph(alice, 'Fin.').first().click()
      await dispatchImage(paragraph(alice, 'Fin.').first(), 'paste', 'capture.png', 'image/png', PNG_BASE64)
      await expect(alice.locator('img[src^="data:image"]')).toHaveCount(1, { timeout: 15_000 })
      const firstCell = alice.locator('table').last().locator('td[data-table-cell-key]').nth(1)
      await firstCell.locator('[contenteditable="true"]').click()
      await dispatchImage(firstCell, 'drop', 'cellule.gif', 'image/gif', GIF_BASE64)
      await expect(alice.locator('img[src^="data:image"]')).toHaveCount(2, { timeout: 15_000 })
      await paragraph(bob, 'Début.').first().click()
      await dispatchImage(paragraph(bob, 'Début.').first(), 'drop', 'photo-bob.png', 'image/png', PNG_BASE64)
      for (const page of [alice, bob]) {
        await expect(page.locator('img[src^="data:image"]')).toHaveCount(3, { timeout: 60_000 })
      }

      // 4. Convergence : documents identiques, tout est là, la saisie de Bob est intacte.
      const readDocument = (person: (typeof people)[number]) => fs.readFile(path.join(repository.clones[person], DOCUMENT), 'utf8')
      await expect.poll(async () => {
        const [a, b] = await Promise.all(people.map(readDocument))
        return a === b
      }, { timeout: 30_000 }).toBe(true)
      const final = await readDocument('alice')
      expect(final, 'saisie continue de Bob').toContain(bobSentence)
      for (const step of STEPS) {
        for (const pattern of step.expected) expect(final, `${step.name} : ${pattern}\n\n${final}`).toMatch(pattern)
      }
      for (const format of FORMATS) expect(final, `format ${format.word}\n\n${final}`).toMatch(format.expected)
      // Liens d'images relatifs au document (rangé dans « Notes/ »).
      expect(final.match(/\]\(\.\.\/images\/[\w-]+\.(png|gif)\)/g) ?? []).toHaveLength(3)

      // Rendu identique chez Bob : un bloc de chaque type.
      for (const depth of [1, 2, 3, 4]) {
        await expect(bob.locator(`[data-block-type="heading-${depth}"]`).filter({ hasText: `Titre niveau ${depth}` })).toHaveCount(1)
      }
      await expect(bob.locator('table')).toHaveCount(1)
      for (const page of [alice, bob]) {
        await expect(page.getByText('se chevauchent')).toHaveCount(0)
      }
    } finally {
      for (const person of people) await launched[person]?.app.close().catch(() => {})
      await repository.cleanup()
      for (const person of people) {
        if (launched[person]) await fs.rm(launched[person]!.configHome, { recursive: true, force: true }).catch(() => {})
      }
    }
  })
})
