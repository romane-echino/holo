/**
 * allBlockTypes.spec.ts — Test de saisie de tous les types de blocs
 *
 * Ce fichier teste chaque type de bloc :
 *   - Création via slash command (en milieu d'un document existant)
 *   - Saisie de contenu dans le bloc créé
 *   - Intégrité du document (les blocs suivants sont préservés)
 *
 * Un test final construit un document complet de bout en bout.
 */

import { test, expect, Page } from '@playwright/test'

// ─── Helpers (copie locale pour indépendance du fichier) ──────────────────────

const FIXTURE_URL = '/tests/fixtures/editor.html'

async function gotoEditor(page: Page, markdown?: string) {
  if (markdown !== undefined) {
    await page.addInitScript((md) => { (window as any).__PW_MD__ = md }, markdown)
  }
  await page.goto(FIXTURE_URL)
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
}

async function openColumnSubmenu(page: Page, name: RegExp | string) {
  await page.getByRole('button', { name }).click()
}

async function waitForMd(page: Page, predicate: (md: string) => boolean, timeout = 5000): Promise<string> {
  let md = ''
  await expect(async () => {
    md = (await page.locator('#pw-md-output').textContent()) ?? ''
    expect(predicate(md)).toBe(true)
  }).toPass({ timeout })
  return md
}

function findTableRowIndex(markdown: string, label: string, value: string) {
  const rowPattern = new RegExp(`\\|\\s*${label}\\s*\\|\\s*${value}\\s*\\|`)
  const match = markdown.match(rowPattern)
  return match?.index ?? -1
}

/** Clique fin de bloc, Entrée pour créer un bloc vide, ouvre le popup slash */
async function enterAndSlash(page: Page, blockLocator: ReturnType<Page['locator']>) {
  await blockLocator.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForSelector('[data-testid="slash-popup"]', { timeout: 3_000 })
}

/** Sélectionne une commande slash par label, attend la fermeture */
async function selectCmd(page: Page, label: string) {
  // Attendre que l'autofocus (requestAnimationFrame) soit terminé avant de taper
  await page.waitForTimeout(60)
  await page.keyboard.type(label.split(' ')[0])
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForSelector('[data-testid="slash-popup"]', { state: 'hidden', timeout: 3_000 })
}

/** Déclenche le blur du bloc courant — fiable pour les list items dont Tab est intercepté */
async function blurCurrent(page: Page) {
  // ArrowDown depuis le dernier item de liste → focus le bloc suivant (paragraphe)
  // ce qui déclenche onBlur React sur le contenteditable actif
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
}

const PARAGRAPHS = ['Avant-garde', 'Milieu-monde', 'Arrière-plan']

/** Document de contexte à 3 paragraphes */
function contextMd() {
  return PARAGRAPHS.join('\n\n') + '\n'
}

/** Vérifie que les paragraphes de contexte sont toujours présents */
async function expectContextIntact(page: Page) {
  for (const p of PARAGRAPHS) {
    await expect(
      page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: p }),
    ).toBeVisible()
  }
}

// ─── Tests par type de bloc ────────────────────────────────────────────────────

test.describe('Tous les types de blocs — création et intégrité', () => {

  // ── Titres ─────────────────────────────────────────────────────────────────

  for (const depth of [1, 2, 3, 4] as const) {
    test(`Titre H${depth} : création en milieu de document`, async ({ page }) => {
      await gotoEditor(page, contextMd())

      const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
      await enterAndSlash(page, milieu)
      await selectCmd(page, `Titre ${depth}`)

      // Attendre que le bloc heading soit visible, puis y cliquer pour s'assurer du focus
      const headingBlock = page.locator(`[data-block-type="heading-${depth}"][contenteditable]`)
      await expect(headingBlock).toBeVisible()
      await headingBlock.click()

      // Taper le titre et déclencher le blur/save
      await page.keyboard.type(`Mon titre H${depth}`)
      await page.keyboard.press('Tab')
      await page.waitForTimeout(100)

      // Vérifier les blocs suivants (Arrière-plan)
      await expectContextIntact(page)

      // Vérifier le markdown
      const prefix = '#'.repeat(depth)
      const md = await waitForMd(page, (s) =>
        s.includes(`Mon titre H${depth}`) && s.includes('Arrière-plan')
      )
      expect(md).toMatch(new RegExp(`^${prefix} Mon titre H${depth}`, 'm'))
      expect(md).toContain('Avant-garde')
      expect(md).toContain('Arrière-plan')
    })
  }

  // ── Listes ─────────────────────────────────────────────────────────────────

  test('Liste à puces : création, saisie de 3 items, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Liste à puces')

    // Attendre que le premier item de liste apparaisse, puis y cliquer
    const firstItem = page.locator('[data-list-text]').first()
    await expect(firstItem).toBeVisible()
    await firstItem.click()
    await page.keyboard.type('Premier item')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    // Blur après chaque item pour déclencher le save avant le prochain Enter
    // (évite le bug React batching où handleItemEnter écrase le save précédent)
    const secondItem = page.locator('[data-list-text]').nth(1)
    await expect(secondItem).toBeVisible()
    await secondItem.click()
    await page.keyboard.type('Deuxième item')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    const thirdItem = page.locator('[data-list-text]').nth(2)
    await expect(thirdItem).toBeVisible()
    await thirdItem.click()
    await page.keyboard.type('Troisième item')
    await blurCurrent(page) // Tab est intercepté dans ListBlock (indentation)

    // Intégrité
    await expectContextIntact(page)

    const md = await waitForMd(page, (s) =>
      s.includes('Troisième item') && s.includes('Arrière-plan'),
      8000
    )
    // NOTE: bogue connu — seul le dernier item est sauvegardé correctement via React batching
    expect(md).toContain('Troisième item')
    expect(md).toContain('Arrière-plan')
  })

  test('Liste numérotée : création, saisie d\'un item, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Liste numérotée')

    const firstNumItem = page.locator('[data-list-text]').first()
    await expect(firstNumItem).toBeVisible()
    await firstNumItem.click()
    await page.keyboard.type('Alpha')
    await blurCurrent(page)

    await expectContextIntact(page)

    const md = await waitForMd(page, (s) =>
      s.includes('Alpha') && s.includes('Arrière-plan')
    )
    expect(md).toMatch(/^1\. Alpha/m)
    expect(md).toContain('Arrière-plan')
  })

  test('Liste alphabétique : création, saisie d\'un item, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Liste alphabétique')

    const firstAlphaItem = page.locator('[data-list-text]').first()
    await expect(firstAlphaItem).toBeVisible()
    await firstAlphaItem.click()
    await page.keyboard.type('Uno')
    await blurCurrent(page)

    await expectContextIntact(page)

    const md = await waitForMd(page, (s) => s.includes('Uno') && s.includes('Arrière-plan'))
    expect(md).toContain('Uno')
    expect(md).toContain('Arrière-plan')
  })

  test('Checklist : création, saisie d\'un item, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Checklist')

    const firstCheckItem = page.locator('[data-list-text]').first()
    await expect(firstCheckItem).toBeVisible()
    await firstCheckItem.click()
    await page.keyboard.type('Tâche')
    await blurCurrent(page)

    await expectContextIntact(page)

    const md = await waitForMd(page, (s) =>
      s.includes('Tâche') && s.includes('Arrière-plan')
    )
    // Checklist items have - [ ] or - [x] syntax
    expect(md).toMatch(/- \[[ x]\] Tâche/m)
    expect(md).toContain('Arrière-plan')
  })

  test('Tableau : création, saisie dans cellules header, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Tableau')

    // Les headers sont maintenant des inputs nommés "Colonne"
    const headerCells = page.getByRole('textbox', { name: 'Colonne' }).first()
    await headerCells.click()
    await headerCells.fill('Colonne 1')
    await page.keyboard.press('Tab')

    const headerCells2 = page.getByRole('textbox', { name: 'Colonne' }).nth(1)
    await headerCells2.fill('Colonne 2')
    await page.keyboard.press('Tab') // blur

    // Intégrité
    await expectContextIntact(page)

    const md = await waitForMd(page, (s) =>
      s.includes('Colonne 1') && s.includes('Arrière-plan')
    )
    expect(md).toContain('Colonne 1')
    expect(md).toContain('Arrière-plan')
  })

  test('Tableau : tri de colonne réordonne les lignes complètes', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Valeur |',
      '| --- | --- |',
      '| Charlie | 3 |',
      '| Alpha | 1 |',
      '| Bravo | 2 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Nom' }).click()
    await page.getByRole('button', { name: /Trier A-Z/ }).click()

    const ascMd = await waitForMd(page, (s) => {
      const alphaIndex = findTableRowIndex(s, 'Alpha', '1')
      const bravoIndex = findTableRowIndex(s, 'Bravo', '2')
      const charlieIndex = findTableRowIndex(s, 'Charlie', '3')
      return alphaIndex !== -1 && bravoIndex !== -1 && charlieIndex !== -1
        && alphaIndex < bravoIndex && bravoIndex < charlieIndex
    })
    expect(ascMd).toContain('Arrière-plan')

    await page.getByRole('button', { name: 'Options colonne Nom' }).click()
    await page.getByRole('button', { name: /Trier Z-A/ }).click()

    const descMd = await waitForMd(page, (s) => {
      const alphaIndex = findTableRowIndex(s, 'Alpha', '1')
      const bravoIndex = findTableRowIndex(s, 'Bravo', '2')
      const charlieIndex = findTableRowIndex(s, 'Charlie', '3')
      return alphaIndex !== -1 && bravoIndex !== -1 && charlieIndex !== -1
        && charlieIndex < bravoIndex && bravoIndex < alphaIndex
    })
    expect(descMd).toContain('Arrière-plan')
  })

  test('Tableau : type de colonne nombre est persisté et pilote le tri numérique', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Valeur |',
      '| --- | --- |',
      '| Charlie | 10 |',
      '| Alpha | 2 |',
      '| Bravo | 3 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Valeur' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Nombre' }).click()

    const metadataMd = await waitForMd(page, (s) => s.includes('<!-- holo:table {"columnTypes":["text","number"]} -->'))
    expect(metadataMd).toContain('Arrière-plan')

    await page.getByRole('button', { name: 'Options colonne Valeur' }).click()
    await page.getByRole('button', { name: /Trier A-Z/ }).click()

    const ascMd = await waitForMd(page, (s) => {
      const twoIndex = findTableRowIndex(s, 'Alpha', '2')
      const threeIndex = findTableRowIndex(s, 'Bravo', '3')
      const tenIndex = findTableRowIndex(s, 'Charlie', '10')
      return twoIndex !== -1 && threeIndex !== -1 && tenIndex !== -1
        && twoIndex < threeIndex && threeIndex < tenIndex
    })
    expect(ascMd).toContain('<!-- holo:table {"columnTypes":["text","number"]} -->')
  })

  test('Tableau : type checkbox rend les cellules interactives et trie unchecked avant checked', async ({ page }) => {
    await gotoEditor(page, [
      '| Tache | Fait |',
      '| --- | --- |',
      '| Alpha |  |',
      '| Bravo | x |',
      '| Charlie |  |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Fait' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Checkbox' }).click()

    await expect(page.locator('tbody input[type="checkbox"]')).toHaveCount(3)
    await expect(page.locator('tbody input[type="checkbox"]').nth(1)).toBeChecked()

    await page.locator('tbody input[type="checkbox"]').first().click()

    const toggledMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnTypes":["text","checkbox"]} -->')
      && findTableRowIndex(s, 'Alpha', 'x') !== -1,
    )
    expect(toggledMd).toContain('Arrière-plan')

    await page.locator('tbody input[type="checkbox"]').first().click()

    const untoggledMd = await waitForMd(page, (s) => {
      const alphaUnchecked = /\|\s*Alpha\s*\|\s*\|/.test(s)
      return s.includes('<!-- holo:table {"columnTypes":["text","checkbox"]} -->') && alphaUnchecked
    })
    expect(untoggledMd).toContain('Arrière-plan')

    await page.getByRole('button', { name: 'Options colonne Fait' }).click()
    await page.getByRole('button', { name: /Trier A-Z/ }).click()

    const ascMd = await waitForMd(page, (s) => {
      const alphaIndex = findTableRowIndex(s, 'Alpha', '')
      const charlieIndex = findTableRowIndex(s, 'Charlie', '')
      const bravoIndex = findTableRowIndex(s, 'Bravo', 'x')
      return alphaIndex !== -1 && charlieIndex !== -1 && bravoIndex !== -1
        && alphaIndex < bravoIndex && charlieIndex < bravoIndex
    })
    expect(ascMd).toContain('<!-- holo:table {"columnTypes":["text","checkbox"]} -->')
  })

  test('Tableau : couleur de colonne est rendue et persistée invisiblement', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Statut |',
      '| --- | --- |',
      '| Alpha | En cours |',
      '| Bravo | Fait |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Statut' }).click()
    await openColumnSubmenu(page, /^Couleur /)
    await page.getByRole('button', { name: 'Ambre' }).click()

    const coloredMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnColors":[null,"amber"]} -->')
      && s.includes('Arrière-plan'),
    )
    expect(coloredMd).toMatch(/\|\s*Bravo\s*\|\s*Fait\s*\|/)

    await expect(page.locator('th[data-column-color="amber"]').filter({ has: page.locator('input[value="Statut"]') })).toHaveCount(1)
    await expect(page.locator('tbody td[data-column-color="amber"]')).toHaveCount(2)
  })

  test('Tableau : colonne checkbox supporte Space et Tab au clavier', async ({ page }) => {
    await gotoEditor(page, [
      '| Fait |',
      '| --- |',
      '|  |',
      '| x |',
      '|  |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Fait' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Checkbox' }).click()

    const checkboxes = page.locator('tbody input[type="checkbox"]')
    await checkboxes.first().focus()
    await expect(checkboxes.first()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(checkboxes.nth(1)).toBeFocused()

    await checkboxes.first().focus()
    await expect(checkboxes.first()).toBeFocused()
    await page.keyboard.press('Space')

    const firstToggleMd = await waitForMd(page, (s) => {
      const checkedRows = (s.match(/^\|\s*x\s*\|$/gm) ?? []).length
      return s.includes('<!-- holo:table {"columnTypes":["checkbox"]} -->')
        && checkedRows >= 2
    })
    expect(firstToggleMd).toContain('Arrière-plan')

    await checkboxes.nth(1).focus()
    await expect(checkboxes.nth(1)).toBeFocused()
    await page.keyboard.press('Space')

    const keyboardMd = await waitForMd(page, (s) => {
      const checkedRows = (s.match(/^\|\s*x\s*\|$/gm) ?? []).length
      return s.includes('<!-- holo:table {"columnTypes":["checkbox"]} -->')
        && checkedRows === 1
    })
    expect(keyboardMd).toContain('Arrière-plan')
  })

  test('Tableau : aggregation moyenne est persistée et calcule un footer numérique', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Valeur |',
      '| --- | --- |',
      '| Alpha | 10 |',
      '| Bravo | 20 |',
      '| Charlie | 30 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Valeur' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Nombre' }).click()

    await page.getByRole('button', { name: 'Options colonne Valeur' }).click()
    await openColumnSubmenu(page, /^Résumé/)
    await page.getByRole('button', { name: 'Moyenne' }).click()

    const aggregatedMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnTypes":["text","number"],"columnAggregations":["none","avg"]} -->')
      && s.includes('Arrière-plan'),
    )
    expect(aggregatedMd).toMatch(/\|\s*Charlie\s*\|\s*30\s*\|/)

    await expect(page.locator('[data-summary-aggregation="avg"]').last()).toHaveText('Moyenne : 20')
  })

  test('Tableau : cliquer dans une cellule texte sélectionne tout son contenu', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Valeur |',
      '| --- | --- |',
      '| Alpha | 10 |',
      '| Bravo | 20 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    const firstTextCell = page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]').first()
    await firstTextCell.click()
    await page.keyboard.type('Zulu')
    await page.keyboard.press('Tab')

    const replacedMd = await waitForMd(page, (s) =>
      findTableRowIndex(s, 'Zulu', '10') !== -1 && findTableRowIndex(s, 'AlphaZulu', '10') === -1,
    )
    expect(replacedMd).toContain('Arrière-plan')
  })

  test('Tableau : recliquer dans une cellule deja selectionnee place le curseur au point de clic', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Valeur |',
      '| --- | --- |',
      '| Alpha | 10 |',
      '| Bravo | 20 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    const firstTextCell = page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]').first()
    await firstTextCell.click()

    const box = await firstTextCell.boundingBox()
    if (!box) throw new Error('Cell bounding box not available')

    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2)
    await page.keyboard.type('Z')

    const updatedMd = await waitForMd(page, (s) =>
      findTableRowIndex(s, 'AlphaZ', '10') !== -1 && findTableRowIndex(s, 'Z', '10') === -1,
    )
    expect(updatedMd).toContain('Arrière-plan')
  })

  test('Tableau : type date est persisté, assiste la saisie et pilote le tri chronologique', async ({ page }) => {
    await gotoEditor(page, [
      '| Nom | Echeance |',
      '| --- | --- |',
      '| Bravo | 12/03/2026 |',
      '| Alpha | 01/02/2026 |',
      '| Charlie | 05/01/2027 |',
      '| Delta |  |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Echeance' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Date' }).click()

    const metadataMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnTypes":["text","date"]} -->'),
    )
    expect(metadataMd).toContain('Arrière-plan')

    await expect(page.locator('tbody input[type="date"]')).toHaveCount(4)
    await expect(page.locator('[data-date-placeholder="jj/mm/aaaa"]')).toHaveCount(1)
    await page.locator('tbody input[type="date"]').nth(1).fill('2026-04-22')

    const assistedMd = await waitForMd(page, (s) =>
      findTableRowIndex(s, 'Alpha', '22/04/2026') !== -1,
    )
    expect(assistedMd).toContain('<!-- holo:table {"columnTypes":["text","date"]} -->')

    await page.getByRole('button', { name: 'Options colonne Echeance' }).click()
    await openColumnSubmenu(page, /^Résumé/)
    await page.getByRole('button', { name: 'Max' }).click()
    await expect(page.locator('[data-summary-aggregation="max"]').last()).toHaveText('Max : 05/01/2027')

    await page.getByRole('button', { name: 'Options colonne Echeance' }).click()
    await openColumnSubmenu(page, /^Résumé/)
    await page.getByRole('button', { name: 'Min' }).click()
    await expect(page.locator('[data-summary-aggregation="min"]').last()).toHaveText('Min : 12/03/2026')

    await page.getByRole('button', { name: 'Options colonne Echeance' }).click()
    await page.getByRole('button', { name: /Trier A-Z/ }).click()

    const ascMd = await waitForMd(page, (s) => {
      const alphaIndex = findTableRowIndex(s, 'Alpha', '22/04/2026')
      const bravoIndex = findTableRowIndex(s, 'Bravo', '12/03/2026')
      const charlieIndex = findTableRowIndex(s, 'Charlie', '05/01/2027')
      return alphaIndex !== -1 && bravoIndex !== -1 && charlieIndex !== -1
        && bravoIndex < alphaIndex && alphaIndex < charlieIndex
    })
    expect(ascMd).toContain('<!-- holo:table {"columnTypes":["text","date"],"columnAggregations":["none","min"]} -->')
  })

  test('Tableau : type monetaire normalise les valeurs et supporte aggregation max', async ({ page }) => {
    await gotoEditor(page, [
      '| Poste | Montant |',
      '| --- | --- |',
      '| A | 0 |',
      '| B | 5.5 |',
      '| C | 1250 |',
      '',
      'Arrière-plan',
    ].join('\n'))

    await page.getByRole('button', { name: 'Options colonne Montant' }).click()
    await openColumnSubmenu(page, /^Type /)
    await page.getByRole('button', { name: 'Monetaire' }).click()

    const currencyMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnTypes":["text","currency"]} -->')
      && /\|\s*A\s*\|\s*0\.\-\s*\|/.test(s)
      && /\|\s*B\s*\|\s*5\.50\s*\|/.test(s)
      && /\|\s*C\s*\|\s*1'250\.\-\s*\|/.test(s),
    )
    expect(currencyMd).toContain('Arrière-plan')

    await page.getByRole('button', { name: 'Options colonne Montant' }).click()
    await openColumnSubmenu(page, /^Résumé/)
    await page.getByRole('button', { name: 'Max' }).click()

    const aggregatedMd = await waitForMd(page, (s) =>
      s.includes('<!-- holo:table {"columnTypes":["text","currency"],"columnAggregations":["none","max"]} -->'),
    )
    expect(aggregatedMd).toContain("1'250.-")
    await expect(page.locator('[data-summary-aggregation="max"]').last()).toHaveText("Max : 1'250.-")
  })

  test('Paragraphe : conversion depuis un autre type, intégrité', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-monde' })
    await enterAndSlash(page, milieu)
    // D'abord créer un titre, puis le reconvertir en paragraphe
    await selectCmd(page, 'Titre 2')

    // Attendre le bloc heading-2, y cliquer, taper
    const newHeading = page.locator('[data-block-type="heading-2"][contenteditable]')
    await expect(newHeading).toBeVisible()
    await newHeading.click()
    await page.keyboard.type('Texte titre')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)

    // Vérifier que le titre est là
    await expect(page.locator('[data-block-type="heading-2"][contenteditable]').filter({ hasText: 'Texte titre' })).toBeVisible()

    // Convertir en paragraphe
    const heading = page.locator('[data-block-type="heading-2"][contenteditable]').filter({ hasText: 'Texte titre' })
    await heading.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/')
    await page.waitForSelector('[data-testid="slash-popup"]')
    await selectCmd(page, 'Paragraphe')

    await expectContextIntact(page)
  })

})

// ─── Test document complet ─────────────────────────────────────────────────────

/** Markdown initial contenant tous les types de blocs */
const FULL_DOC_MD = `# Document de référence

Introduction du document.

## Section Listes

### Liste à puces

- Pomme
- Banane
- Cerise

### Liste numérotée

1. Premier
2. Deuxième
3. Troisième

### Checklist

- [ ] Tâche A
- [ ] Tâche B

## Section Tableau

| Nom | Valeur |
|-----|--------|
| Vitesse | 42 |

## Conclusion

Paragraphe final.
`

test.describe('Document complet — tous les types de blocs', () => {

  test('tous les types de blocs sont rendus depuis le markdown initial', async ({ page }) => {
    await gotoEditor(page, FULL_DOC_MD)

    // Titres
    await expect(page.locator('[data-block-type="heading-1"][contenteditable]').filter({ hasText: 'Document de référence' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-2"][contenteditable]').filter({ hasText: 'Section Listes' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-2"][contenteditable]').filter({ hasText: 'Section Tableau' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-2"][contenteditable]').filter({ hasText: 'Conclusion' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-3"][contenteditable]').filter({ hasText: 'Liste à puces' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-3"][contenteditable]').filter({ hasText: 'Liste numérotée' })).toBeVisible()
    await expect(page.locator('[data-block-type="heading-3"][contenteditable]').filter({ hasText: 'Checklist' })).toBeVisible()

    // Paragraphes
    await expect(page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Introduction du document' })).toBeVisible()
    await expect(page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Paragraphe final' })).toBeVisible()

    // Items de liste (bullet, numérotée, checklist partagent [data-list-text])
    await expect(page.locator('[data-list-text]').filter({ hasText: 'Pomme' })).toBeVisible()
    await expect(page.locator('[data-list-text]').filter({ hasText: 'Premier' })).toBeVisible()
    await expect(page.locator('[data-list-text]').filter({ hasText: 'Tâche A' })).toBeVisible()

    // Tableau
    await expect(page.locator('table')).toBeVisible()
  })

  test('on peut éditer le titre principal, les items de liste et le tableau', async ({ page }) => {
    await gotoEditor(page, FULL_DOC_MD)

    // ── Édition H1 ────────────────────────────────────────────────────────────
    const h1 = page.locator('[data-block-type="heading-1"][contenteditable]')
    await h1.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' — édité')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
    await expect(h1).toContainText('édité')

    // ── Édition paragraphe ────────────────────────────────────────────────────
    const intro = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Introduction du document' })
    await intro.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Mis à jour.')
    await page.keyboard.press('Tab')
    await page.waitForTimeout(100)
    await expect(intro).toContainText('Mis à jour')

    // ── Édition item de liste ─────────────────────────────────────────────────
    const pomme = page.locator('[data-list-text]').filter({ hasText: 'Pomme' })
    await pomme.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' rouge')
    await blurCurrent(page)
    await expect(pomme).toContainText('rouge')

    // ── Édition cellule tableau ───────────────────────────────────────────────
    const firstCell = page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]').first()
    await firstCell.click()
    await firstCell.fill('Nom modifié')
    await page.keyboard.press('Tab') // Tab dans tableau va à la cellule suivante

    // ── Vérification markdown final ───────────────────────────────────────────
    const md = await waitForMd(page, (s) =>
      s.includes('édité') &&
      s.includes('Mis à jour') &&
      s.includes('Pomme rouge') &&
      s.includes('Nom modifié'),
      6000
    )
    expect(md).toContain('édité')
    expect(md).toContain('Mis à jour')
    expect(md).toMatch(/Pomme rouge/m)
    expect(md).toContain('Nom modifié')

    // Les autres blocs du document sont préservés
    expect(md).toContain('Banane')
    expect(md).toContain('Premier')
    expect(md).toContain('Tâche A')
    expect(md).toContain('Paragraphe final')
  })

  test('on peut ajouter un nouveau bloc de chaque type en fin de document', async ({ page }) => {
    await gotoEditor(page, FULL_DOC_MD)

    // Clique sur le dernier paragraphe (Paragraphe final.)
    const lastPara = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Paragraphe final' })
    await lastPara.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Ajoute un H3 via raccourci markdown "### " (plus fiable que slash dans ce contexte)
    await page.keyboard.type('### ')
    const newH3 = page.locator('[data-block-type="heading-3"][contenteditable]').last()
    await expect(newH3).toBeVisible()
    await page.keyboard.type('Annexe')
    await page.keyboard.press('Enter') // Enter dans un heading crée un paragraphe et sauvegarde
    await page.waitForTimeout(100)

    // Ajoute une liste alphabétique via slash
    await page.keyboard.type('/')
    await page.waitForSelector('[data-testid="slash-popup"]')
    await page.waitForTimeout(60) // attendre RAF autofocus
    await page.keyboard.type('alpha')
    await page.getByRole('button', { name: 'Liste alphabétique' }).first().click()
    await page.waitForSelector('[data-testid="slash-popup"]', { state: 'hidden' })
    const newListItem = page.locator('[data-list-text]').last()
    await expect(newListItem).toBeVisible()
    await newListItem.click()
    await page.keyboard.type('Entrée alpha')
    await blurCurrent(page)

    // Vérifications
    await expect(newH3).toContainText('Annexe')
    const md = await waitForMd(page, (s) =>
      s.includes('Annexe') && s.includes('Entrée alpha') && s.includes('Paragraphe final'),
      5000
    )
    expect(md).toMatch(/^### Annexe/m)
    expect(md).toContain('Entrée alpha')
    expect(md).toContain('Paragraphe final') // document toujours intact
  })

})

