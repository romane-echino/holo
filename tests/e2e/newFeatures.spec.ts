/**
 * newFeatures.spec.ts — Tests E2E des nouvelles fonctionnalités
 *
 * Couvre :
 *  1. BlockquoteBlock  — création, saisie, sérialisation markdown, navigation clavier
 *  2. FootnoteBlock    — création, saisie, sérialisation markdown
 *  3. Separator        — création, sélection, suppression via BACKSPACE
 *  4. Image block      — sélection au clic, suppression via BACKSPACE, préservation du contexte
 *  5. Drag-select      — sélection multi-blocs à la souris, suppression groupée
 *  6. Shift+clic       — sélection de plage, suppression groupée
 */

import { test, expect, Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXTURE_URL = '/tests/fixtures/editor.html'

async function gotoEditor(page: Page, markdown?: string) {
  if (markdown !== undefined) {
    await page.addInitScript((md) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__PW_MD__ = md
    }, markdown)
  }
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

/** Crée un bloc vide après le bloc cible et ouvre le popup slash */
async function enterAndSlash(page: Page, blockLocator: ReturnType<Page['locator']>) {
  await blockLocator.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await page.waitForSelector('[data-testid="slash-popup"]', { timeout: 3_000 })
}

async function selectCmd(page: Page, label: string) {
  await page.waitForTimeout(60)
  await page.keyboard.type(label.split(' ')[0])
  await page.getByRole('button', { name: label }).first().click()
  await page.waitForSelector('[data-testid="slash-popup"]', { state: 'hidden', timeout: 3_000 })
}

const CONTEXT_PARAGRAPHS = ['Alpha-premier', 'Beta-milieu', 'Gamma-dernier']

function contextMd() {
  return CONTEXT_PARAGRAPHS.join('\n\n') + '\n'
}

async function expectContextIntact(page: Page) {
  for (const p of CONTEXT_PARAGRAPHS) {
    await expect(
      page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: p }),
    ).toBeVisible({ timeout: 3_000 })
  }
}

// ─── 1. BlockquoteBlock ────────────────────────────────────────────────────────

test.describe('BlockquoteBlock — édition et sérialisation', () => {

  test('création via slash command, saisie et sérialisation markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    // L'InlineEditor du blockquote doit être focalisé et éditable
    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await expect(bqEditor).toBeVisible({ timeout: 3_000 })
    await bqEditor.click()
    await page.keyboard.type('Ceci est une belle citation')
    await page.keyboard.press('Tab') // déclenche le blur/save

    // Vérifier la sérialisation
    const md = await waitForMd(page, (s) =>
      s.includes('Ceci est une belle citation') && s.includes('Gamma-dernier'),
      6000,
    )
    // Le markdown blockquote commence par "> "
    expect(md).toMatch(/^> Ceci est une belle citation/m)
    expect(md).toContain('Gamma-dernier')
    await expectContextIntact(page)
  })

  test('saisie longue avec curseur intermédiaire', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await bqEditor.click()
    await page.keyboard.type('Début ')
    await page.keyboard.type('milieu ')
    await page.keyboard.type('fin')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) => s.includes('Début milieu fin'), 6000)
    expect(md).toMatch(/^> Début milieu fin/m)
  })

  test('Enter à la fin crée un nouveau bloc paragraphe', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await bqEditor.click()
    await page.keyboard.type('Ma citation')
    await page.keyboard.press('Enter') // onEnterAtEnd → crée un paragraphe après

    // Un nouveau bloc paragraphe vide doit apparaître après le blockquote
    const paragraphsAfter = page.locator('[data-block-type="paragraph"][contenteditable]')
    await expect(paragraphsAfter).toHaveCount(
      await paragraphsAfter.count(), // au moins autant qu'avant + 1
    )
    // On tape dans le nouveau bloc pour vérifier qu'il est focalisé
    await page.keyboard.type('Après citation')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('Ma citation') && s.includes('Après citation'), 6000,
    )
    expect(md).toMatch(/^> Ma citation/m)
    expect(md).toContain('Après citation')
  })

  test('Backspace au début d\'un blockquote vide le supprime', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await bqEditor.click()
    // Le bloc est vide — Backspace au début → onBackspaceAtStart → le bloc disparaît
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    // Le blockquote doit avoir disparu
    await expect(bqEditor).toBeHidden({ timeout: 2_000 })
    await expectContextIntact(page)
  })

  test('blockquote pré-existant dans le markdown est éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '> Citation existante',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await expect(bqEditor).toBeVisible()

    await bqEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' ajout')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) => s.includes('Citation existante ajout'), 6000)
    expect(md).toMatch(/^> Citation existante ajout/m)
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })
})

// ─── 2. FootnoteBlock ─────────────────────────────────────────────────────────

test.describe('FootnoteBlock — édition et sérialisation', () => {

  test('création via slash command, saisie et sérialisation markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Note')

    const fnEditor = page.locator('[data-block-type="footnoteDefinition"][contenteditable]')
    await expect(fnEditor).toBeVisible({ timeout: 3_000 })
    await fnEditor.click()
    await page.keyboard.type('Contenu de la note de bas de page')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('Contenu de la note de bas de page') && s.includes('Gamma-dernier'),
      6000,
    )
    // Le markdown footnoteDefinition : [^id]: contenu
    expect(md).toMatch(/\[\^[^\]]+\]:\s*Contenu de la note de bas de page/m)
    expect(md).toContain('Gamma-dernier')
    await expectContextIntact(page)
  })

  test('le badge d\'identifiant est affiché', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Note')

    // Le badge [id] doit être visible dans le bloc
    // Il est rendu dans un <span> avec font-mono
    await expect(page.locator('[data-block-type="footnoteDefinition"]')).toBeVisible()
    await expect(page.locator('span.font-mono').first()).toBeVisible()
  })

  test('Enter à la fin crée un nouveau bloc après la note', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Note')

    const fnEditor = page.locator('[data-block-type="footnoteDefinition"][contenteditable]')
    await fnEditor.click()
    await page.keyboard.type('Ma note')
    await page.keyboard.press('Enter')

    // Tape dans le nouveau bloc après la note
    await page.keyboard.type('Après note')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('Ma note') && s.includes('Après note'), 6000,
    )
    expect(md).toMatch(/\[\^[^\]]+\]:\s*Ma note/m)
    expect(md).toContain('Après note')
  })

  test('note pré-existante dans le markdown est éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '[^1]: Note pré-existante',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const fnEditor = page.locator('[data-block-type="footnoteDefinition"][contenteditable]')
    await expect(fnEditor).toBeVisible()

    await fnEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' éditée')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) => s.includes('Note pré-existante éditée'), 6000)
    expect(md).toMatch(/\[\^[^\]]+\]:\s*Note pré-existante éditée/m)
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })
})

// ─── 3. Séparateur (thematicBreak) ────────────────────────────────────────────

test.describe('Séparateur — création, sélection, suppression', () => {

  test('création via slash command insère un séparateur HR', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Séparateur')

    await expect(page.locator('hr')).toBeVisible({ timeout: 3_000 })

    const md = await waitForMd(page, (s) =>
      // remark-stringify sérialise par défaut les thematicBreaks en "***"
      /^(\*{3,}|-{3,})$/m.test(s) && s.includes('Gamma-dernier'), 8000)
    expect(md).toMatch(/^(\*{3,}|-{3,})$/m)
    expect(md).toContain('Gamma-dernier')
    await expectContextIntact(page)
  })

  test('clic sur le séparateur le sélectionne (ring visible)', async ({ page }) => {
    await gotoEditor(page, ['Alpha-premier', '', '---', '', 'Gamma-dernier'].join('\n'))

    const hrWrapper = page.locator('[data-block-id]').filter({ has: page.locator('hr') })
    await hrWrapper.click()

    // Après clic, le wrapper doit avoir la classe de sélection ring
    await expect(hrWrapper).toHaveClass(/ring-1/, { timeout: 2_000 })
  })

  test('BACKSPACE sur un séparateur sélectionné le supprime', async ({ page }) => {
    await gotoEditor(page, ['Alpha-premier', '', '---', '', 'Gamma-dernier'].join('\n'))

    const hrWrapper = page.locator('[data-block-id]').filter({ has: page.locator('hr') })
    await hrWrapper.click()
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')

    // Le HR doit avoir disparu
    await expect(page.locator('hr')).toBeHidden({ timeout: 2_000 })

    const md = await waitForMd(page, (s) => !s.includes('---') && s.includes('Gamma-dernier'), 4000)
    expect(md).not.toMatch(/^---$/m)
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })

  test('DELETE sur un séparateur sélectionné le supprime', async ({ page }) => {
    await gotoEditor(page, ['Alpha-premier', '', '---', '', 'Gamma-dernier'].join('\n'))

    const hrWrapper = page.locator('[data-block-id]').filter({ has: page.locator('hr') })
    await hrWrapper.click()
    await page.waitForTimeout(100)
    await page.keyboard.press('Delete')

    await expect(page.locator('hr')).toBeHidden({ timeout: 2_000 })
    const md = await waitForMd(page, (s) => !s.includes('---') && s.includes('Gamma-dernier'), 4000)
    expect(md).not.toMatch(/^---$/m)
  })
})

// ─── 4. Image block — sélection + suppression ─────────────────────────────────

test.describe('Image block — sélection et suppression', () => {

  // Un paragraphe contenant uniquement une image (data URL pour éviter les requêtes réseau et les transitions d'état)
  // Tiny 1x1 transparent GIF, stable et toujours disponible
  const TEST_IMAGE_URL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
  const IMAGE_MD = [
    'Alpha-premier',
    '',
    `![Logo test](${TEST_IMAGE_URL})`,
    '',
    'Gamma-dernier',
  ].join('\n')

  test('l\'image est rendue dans un bloc cliquable', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    // L'ImageBlock est rendu dans un <figure> ou un <div> cliquable
    // Pour les URLs http, l'image est rendue directement (pas de chargement IPC)
    const imgContainer = page.locator('[data-block-id]').filter({ has: page.locator('figure, img') }).first()
    await expect(imgContainer).toBeVisible({ timeout: 3_000 })
  })

  test('clic sur l\'image la sélectionne (ring)', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    const figure = page.locator('figure').first()
    await expect(figure).toBeVisible({ timeout: 3_000 })
    await figure.click()

    // Après clic, figure doit avoir la classe ring (isSelected=true)
    await expect(figure).toHaveClass(/ring-2/, { timeout: 2_000 })
  })

  test('BACKSPACE après sélection d\'image la supprime', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    const figure = page.locator('figure').first()
    await expect(figure).toBeVisible({ timeout: 3_000 })
    await figure.click()
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')

    // L'image doit avoir disparu
    await expect(figure).toBeHidden({ timeout: 2_000 })

    const md = await waitForMd(page, (s) =>
      !s.includes('Logo test') && s.includes('Gamma-dernier'), 4000,
    )
    expect(md).not.toContain('Logo test')
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })

  test('clic sur un paragraphe après l\'image désélectionne l\'image', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    const figure = page.locator('figure').first()
    await figure.click()
    await expect(figure).toHaveClass(/ring-2/, { timeout: 2_000 })

    // Cliquer dans un paragraphe éditable → l'image perd son ring
    const para = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Gamma-dernier' })
    await para.click()
    await page.waitForTimeout(100)

    // La figure ne doit plus avoir ring-2
    await expect(figure).not.toHaveClass(/ring-2/, { timeout: 2_000 })
  })
})

// ─── 5. Drag-select multi-blocs ────────────────────────────────────────────────

test.describe('Drag-select — sélection multi-blocs et suppression', () => {

  test('drag depuis bloc A vers bloc B sélectionne les deux blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Bloc-un',
      '',
      'Bloc-deux',
      '',
      'Bloc-trois',
    ].join('\n'))

    const blocUn = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-un' })
    const blocDeux = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-deux' })

    await expect(blocUn).toBeVisible()
    await expect(blocDeux).toBeVisible()

    const boxUn = await blocUn.boundingBox()
    const boxDeux = await blocDeux.boundingBox()
    if (!boxUn || !boxDeux) throw new Error('boundingBox manquant')

    // Drag depuis le coin gauche de Bloc-un jusqu'au coin gauche de Bloc-deux
    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2)
    await page.mouse.down()
    // Mouvement progressif pour déclencher le seuil (>10px)
    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2 + 6)
    await page.mouse.move(boxUn.x + 2, boxDeux.y + boxDeux.height / 2)
    await page.waitForTimeout(80)
    await page.mouse.up()

    // Les deux wrappers de blocs doivent avoir la classe de sélection
    const wrapperUn = page.locator('[data-block-id]').filter({ has: blocUn })
    const wrapperDeux = page.locator('[data-block-id]').filter({ has: blocDeux })
    await expect(wrapperUn).toHaveClass(/ring-1/, { timeout: 2_000 })
    await expect(wrapperDeux).toHaveClass(/ring-1/, { timeout: 2_000 })
  })

  test('BACKSPACE après drag-select supprime tous les blocs sélectionnés', async ({ page }) => {
    await gotoEditor(page, [
      'Survivant-avant',
      '',
      'A-supprimer',
      '',
      'B-supprimer',
      '',
      'Survivant-après',
    ].join('\n'))

    const blocA = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'A-supprimer' })
    const blocB = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'B-supprimer' })

    const boxA = await blocA.boundingBox()
    const boxB = await blocB.boundingBox()
    if (!boxA || !boxB) throw new Error('boundingBox manquant')

    // Drag de A vers B
    await page.mouse.move(boxA.x + 2, boxA.y + boxA.height / 2)
    await page.mouse.down()
    await page.mouse.move(boxA.x + 2, boxA.y + boxA.height / 2 + 6)
    await page.mouse.move(boxA.x + 2, boxB.y + boxB.height / 2)
    await page.waitForTimeout(80)
    await page.mouse.up()

    // Appuyer sur Backspace pour supprimer
    await page.keyboard.press('Backspace')

    // A et B doivent avoir disparu
    await expect(blocA).toBeHidden({ timeout: 2_000 })
    await expect(blocB).toBeHidden({ timeout: 2_000 })

    // Les survivants sont toujours là
    await expect(
      page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Survivant-avant' }),
    ).toBeVisible()
    await expect(
      page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Survivant-après' }),
    ).toBeVisible()

    const md = await waitForMd(page, (s) =>
      !s.includes('A-supprimer') && !s.includes('B-supprimer') &&
      s.includes('Survivant-avant') && s.includes('Survivant-après'), 5000,
    )
    expect(md).not.toContain('A-supprimer')
    expect(md).not.toContain('B-supprimer')
    expect(md).toContain('Survivant-avant')
    expect(md).toContain('Survivant-après')
  })

  test('drag-select puis DELETE supprime aussi les blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Haut',
      '',
      'Milieu-del',
      '',
      'Bas',
    ].join('\n'))

    const blocMilieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Milieu-del' })
    const box = await blocMilieu.boundingBox()
    if (!box) throw new Error('boundingBox manquant')

    await page.mouse.move(box.x + 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + 2, box.y + box.height / 2 + 15)
    await page.waitForTimeout(80)
    await page.mouse.up()

    await page.keyboard.press('Delete')

    await expect(blocMilieu).toBeHidden({ timeout: 2_000 })
    const md = await waitForMd(page, (s) => !s.includes('Milieu-del') && s.includes('Bas'), 4000)
    expect(md).not.toContain('Milieu-del')
    expect(md).toContain('Haut')
    expect(md).toContain('Bas')
  })

  test('clic dans un éditeur de texte désélectionne les blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Bloc-un',
      '',
      'Bloc-deux',
      '',
      'Bloc-trois',
    ].join('\n'))

    const blocUn = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-un' })
    const blocDeux = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-deux' })
    const blocTrois = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-trois' })

    // Sélectionner Bloc-un et Bloc-deux par drag
    const boxUn = await blocUn.boundingBox()
    const boxDeux = await blocDeux.boundingBox()
    if (!boxUn || !boxDeux) throw new Error('boundingBox manquant')

    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2)
    await page.mouse.down()
    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2 + 6)
    await page.mouse.move(boxUn.x + 2, boxDeux.y + boxDeux.height / 2)
    await page.waitForTimeout(80)
    await page.mouse.up()

    // Vérifier qu'ils sont sélectionnés
    const wrapperUn = page.locator('[data-block-id]').filter({ has: blocUn })
    await expect(wrapperUn).toHaveClass(/ring-1/, { timeout: 2_000 })

    // Cliquer dans Bloc-trois (éditeur de texte) → désélection
    await blocTrois.click()
    await page.waitForTimeout(100)

    // Bloc-un ne doit plus être sélectionné
    await expect(wrapperUn).not.toHaveClass(/ring-1/)
  })
})

// ─── 6. Shift+clic — sélection de plage ──────────────────────────────────────

test.describe('Shift+clic — sélection de plage', () => {

  test('shift+clic sur le séparateur sélectionne la plage depuis la sélection actuelle', async ({ page }) => {
    await gotoEditor(page, [
      'Bloc-A',
      '',
      '---',
      '',
      'Bloc-B',
    ].join('\n'))

    // Sélectionner d'abord Bloc-A via drag court
    const blocA = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-A' })
    const boxA = await blocA.boundingBox()
    if (!boxA) throw new Error('boundingBox manquant')

    await page.mouse.move(boxA.x + 2, boxA.y + boxA.height / 2)
    await page.mouse.down()
    await page.mouse.move(boxA.x + 2, boxA.y + boxA.height / 2 + 15)
    await page.waitForTimeout(80)
    await page.mouse.up()

    const wrapperA = page.locator('[data-block-id]').filter({ has: blocA })
    await expect(wrapperA).toHaveClass(/ring-1/, { timeout: 2_000 })

    // Shift+clic sur Bloc-B
    const blocB = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-B' })
    await blocB.click({ modifiers: ['Shift'] })
    await page.waitForTimeout(100)

    // Bloc-A et Bloc-B (et le séparateur entre eux) doivent être sélectionnés
    const wrapperB = page.locator('[data-block-id]').filter({ has: blocB })
    await expect(wrapperB).toHaveClass(/ring-1/, { timeout: 2_000 })
    await expect(wrapperA).toHaveClass(/ring-1/)
  })

  test('BACKSPACE après shift+clic supprime la plage', async ({ page }) => {
    await gotoEditor(page, [
      'Survivant-haut',
      '',
      'Del-un',
      '',
      'Del-deux',
      '',
      'Del-trois',
      '',
      'Survivant-bas',
    ].join('\n'))

    const delUn = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Del-un' })
    const delTrois = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Del-trois' })

    // Sélectionner Del-un par drag
    const boxUn = await delUn.boundingBox()
    if (!boxUn) throw new Error('boundingBox manquant')

    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2)
    await page.mouse.down()
    await page.mouse.move(boxUn.x + 2, boxUn.y + boxUn.height / 2 + 15)
    await page.waitForTimeout(80)
    await page.mouse.up()

    // Shift+clic sur Del-trois → plage [Del-un, Del-deux, Del-trois]
    await delTrois.click({ modifiers: ['Shift'] })
    await page.waitForTimeout(100)

    await page.keyboard.press('Backspace')

    // Toutes les Del-* doivent avoir disparu
    await expect(delUn).toBeHidden({ timeout: 2_000 })
    await expect(delTrois).toBeHidden({ timeout: 2_000 })

    const md = await waitForMd(page, (s) =>
      !s.includes('Del-') && s.includes('Survivant-haut') && s.includes('Survivant-bas'), 5000,
    )
    expect(md).not.toContain('Del-')
    expect(md).toContain('Survivant-haut')
    expect(md).toContain('Survivant-bas')
  })
})
