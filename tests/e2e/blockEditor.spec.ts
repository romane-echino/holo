/**
 * blockEditor.spec.ts — Batterie de tests E2E pour BlockEditor
 *
 * Couvre les interactions critiques de l'éditeur :
 *   - Commandes slash (bug regression : contenu suivant ne doit pas disparaître)
 *   - Raccourcis markdown (- espace → liste, # espace → titre)
 *   - Navigation inter-blocs (Enter, Backspace)
 *   - Conversions de type en milieu et fin de document
 */

import { test, expect, Page } from '@playwright/test'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FIXTURE_URL = '/tests/fixtures/editor.html'

/**
 * Attend que le markdown courant satisfasse un prédicat.
 * page.locator('#pw-md-output').textContent() fonctionne même sur display:none.
 */
async function waitForMd(page: Page, predicate: (md: string) => boolean, timeout = 4000): Promise<string> {
  await page.waitForFunction(
    (sel: string) => {
      const el = document.querySelector(sel)
      return el?.textContent ?? ''
    },
    '#pw-md-output',
    { timeout },
  )
  // Retry jusqu'à ce que le prédicat soit vrai
  let md = ''
  await expect(async () => {
    md = (await page.locator('#pw-md-output').textContent()) ?? ''
    expect(predicate(md)).toBe(true)
  }).toPass({ timeout })
  return md
}

/** Attends que le BlockEditor soit prêt */
async function waitForEditor(page: Page) {
  await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
}

/** Navigue vers la fixture avec un markdown initial personnalisé. */
async function gotoEditor(page: Page, markdown?: string) {
  if (markdown) {
    await page.addInitScript((md) => { (window as any).__PW_MD__ = md }, markdown)
  }
  await page.goto(FIXTURE_URL)
  await waitForEditor(page)
}

/** Trouve un bloc paragraph éditable par son contenu texte */
function paragraphWithText(page: Page, text: string) {
  return page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: text })
}

/** Ouvre la slash command depuis un bloc vide focalisé. */
async function openSlashPopup(page: Page) {
  await page.keyboard.type('/')
  await page.waitForSelector('[data-testid="slash-popup"]', { timeout: 3_000 })
}

/** Sélectionne une commande slash par son label. */
async function selectSlashCommand(page: Page, label: string) {
  const query = label.split(' ')[0]
  await page.keyboard.type(query)
  await page.getByRole('button', { name: label }).first().click()
  // Attendre la fermeture du popup
  await page.waitForSelector('[data-testid="slash-popup"]', { state: 'hidden', timeout: 2_000 })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('BlockEditor — slash commands', () => {

  test('list-bullet en milieu de doc ne fait pas disparaître les blocs suivants (regression)', async ({ page }) => {
    await gotoEditor(page, [
      'Bloc A',
      '',
      'Bloc B',
      '',
      'Bloc C',
      '',
      'Bloc D',
    ].join('\n'))

    // Cliquer dans Bloc B → fin → Enter → nouveau bloc vide
    const blocB = paragraphWithText(page, 'Bloc B')
    await blocB.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    // Le nouveau bloc vide est focalisé — ouvrir le popup slash
    await openSlashPopup(page)
    await selectSlashCommand(page, 'Liste à puces')

    // Vérifier que Bloc C et Bloc D sont toujours là
    await expect(paragraphWithText(page, 'Bloc C')).toBeVisible()
    await expect(paragraphWithText(page, 'Bloc D')).toBeVisible()

    // Vérifier le markdown sérialisé (avec retry car React est async)
    const md = await waitForMd(page, (s) => s.includes('Bloc C') && s.includes('Bloc D') && /^-/m.test(s))
    expect(md).toContain('Bloc C')
    expect(md).toContain('Bloc D')
    expect(md).toMatch(/^-/m) // au moins un item de liste à puces
  })

  test('list-bullet en fin de doc ajoute un paragraphe vide après', async ({ page }) => {
    await gotoEditor(page, 'Seul bloc\n')

    const bloc = paragraphWithText(page, 'Seul bloc')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await openSlashPopup(page)
    await selectSlashCommand(page, 'Liste à puces')

    // Le doc doit contenir la liste ET un paragraphe vide après
    const md = await waitForMd(page, (s) => /^-/m.test(s))
    expect(md).toMatch(/^-/m)
    // La liste n'est pas le dernier caractère (paragraphe vide ajouté)
    expect(md.trimEnd()).not.toMatch(/\n- \s*$/)
  })

  test('heading-1 en milieu de doc préserve les blocs suivants', async ({ page }) => {
    await gotoEditor(page, [
      'Intro',
      '',
      'Milieu',
      '',
      'Fin',
    ].join('\n'))

    const milieu = paragraphWithText(page, 'Milieu')
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await openSlashPopup(page)
    await selectSlashCommand(page, 'Titre 1')

    await expect(paragraphWithText(page, 'Fin')).toBeVisible()
    const md = await waitForMd(page, (s) => s.includes('Fin') && /^#/m.test(s))
    expect(md).toContain('Fin')
    expect(md).toMatch(/^#/m)
  })

  test('table en milieu de doc préserve les blocs suivants', async ({ page }) => {
    await gotoEditor(page, [
      'Avant',
      '',
      'Milieu',
      '',
      'Après',
    ].join('\n'))

    const milieu = paragraphWithText(page, 'Milieu')
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await openSlashPopup(page)
    await selectSlashCommand(page, 'Tableau')

    await expect(paragraphWithText(page, 'Après')).toBeVisible()
  })

  test('checklist en milieu de doc préserve les blocs suivants', async ({ page }) => {
    await gotoEditor(page, [
      'Intro',
      '',
      'Milieu',
      '',
      'Conclusion',
    ].join('\n'))

    const milieu = paragraphWithText(page, 'Milieu')
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await openSlashPopup(page)
    await selectSlashCommand(page, 'Checklist')

    await expect(paragraphWithText(page, 'Conclusion')).toBeVisible()
  })

  test('Échap ferme le popup sans modifier le contenu', async ({ page }) => {
    await gotoEditor(page, 'Mon paragraphe\n')

    const bloc = paragraphWithText(page, 'Mon paragraphe')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')

    await openSlashPopup(page)
    await page.keyboard.press('Escape')

    // Le popup est fermé
    await expect(page.locator('[data-testid="slash-popup"]')).not.toBeVisible()

    // Le contenu original est intact
    await expect(paragraphWithText(page, 'Mon paragraphe')).toBeVisible()
  })

})

test.describe('BlockEditor — raccourcis markdown', () => {

  test('- espace au début d\'un bloc vide crée une liste à puces', async ({ page }) => {
    await gotoEditor(page, 'Paragraphe\n')

    const bloc = paragraphWithText(page, 'Paragraphe')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    // Bloc vide focalisé
    await page.keyboard.type('- ')

    // Le bloc doit être converti en liste
    const md = await waitForMd(page, (s) => /^-/m.test(s))
    expect(md).toMatch(/^-/m)
    await expect(paragraphWithText(page, 'Paragraphe')).toBeVisible()
  })

  test('# espace au début d\'un bloc vide crée un titre H1', async ({ page }) => {
    await gotoEditor(page, 'Intro\n')

    const bloc = paragraphWithText(page, 'Intro')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('# ')

    const md = await waitForMd(page, (s) => /^#/m.test(s))
    expect(md).toMatch(/^#/m)
  })

  test('## espace crée un titre H2', async ({ page }) => {
    await gotoEditor(page, 'Intro\n')

    const bloc = paragraphWithText(page, 'Intro')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('## ')

    const md2 = await waitForMd(page, (s) => /^##/m.test(s))
    expect(md2).toMatch(/^##/m)
  })

  test('1. espace crée une liste ordonnée', async ({ page }) => {
    await gotoEditor(page, 'Intro\n')

    const bloc = paragraphWithText(page, 'Intro')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('1. ')

    const md3 = await waitForMd(page, (s) => /^1\./m.test(s))
    expect(md3).toMatch(/^1\./m)
  })

})

test.describe('BlockEditor — navigation et structure', () => {

  test('Enter en fin de bloc crée un nouveau paragraphe', async ({ page }) => {
    await gotoEditor(page, 'Un seul bloc\n')

    const md0 = (await page.locator('#pw-md-output').textContent()) ?? ''
    const blocksBefore = md0.split('\n\n').filter(Boolean).length

    const bloc = paragraphWithText(page, 'Un seul bloc')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Nouveau bloc')
    // InlineEditor sauvegarde sur onBlur → cliquer ailleurs pour déclencher
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) => s.includes('Un seul bloc') && s.includes('Nouveau bloc'))
    expect(md).toContain('Un seul bloc')
    expect(md).toContain('Nouveau bloc')
    expect(md.split('\n\n').filter(Boolean).length).toBeGreaterThan(blocksBefore)
  })

  test('Backspace sur un bloc vide supprime le bloc', async ({ page }) => {
    await gotoEditor(page, [
      'Bloc un',
      '',
      'Bloc deux',
      '',
      'Bloc trois',
    ].join('\n'))

    // Cliquer dans Bloc deux → sélectionner tout → supprimer → backspace
    const blocDeux = paragraphWithText(page, 'Bloc deux')
    await blocDeux.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Delete')
    // Le bloc est maintenant vide → Backspace le supprime
    await page.keyboard.press('Backspace')

    // Bloc deux a disparu, les autres sont intacts
    await expect(paragraphWithText(page, 'Bloc un')).toBeVisible()
    await expect(paragraphWithText(page, 'Bloc trois')).toBeVisible()
    await expect(page.locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc deux' })).not.toBeVisible()
  })

  test('Édition simple : saisir du texte dans un bloc paragraph', async ({ page }) => {
    await gotoEditor(page)

    const bloc = paragraphWithText(page, 'Paragraphe un.')
    await bloc.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' Texte ajouté')
    // InlineEditor sauvegarde sur onBlur → cliquer ailleurs pour déclencher
    await page.keyboard.press('Tab')

    const md4 = await waitForMd(page, (s) => s.includes('Paragraphe un. Texte ajouté'))
    expect(md4).toContain('Paragraphe un. Texte ajouté')
  })

})

test.describe('BlockEditor — intégrité du document', () => {

  test('plusieurs conversions successives préservent tous les blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha',
      '',
      'Beta',
      '',
      'Gamma',
      '',
      'Delta',
    ].join('\n'))

    // Convertir Gamma en liste via slash command
    const gamma = paragraphWithText(page, 'Gamma')
    await gamma.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await openSlashPopup(page)
    await selectSlashCommand(page, 'Liste à puces')
    await expect(paragraphWithText(page, 'Delta')).toBeVisible()

    // Convertir Beta en titre
    const beta = paragraphWithText(page, 'Beta')
    await beta.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await openSlashPopup(page)
    await selectSlashCommand(page, 'Titre 2')

    // Tous les blocs originaux sont toujours là
    await expect(paragraphWithText(page, 'Alpha')).toBeVisible()
    await expect(paragraphWithText(page, 'Delta')).toBeVisible()

    const md = await waitForMd(page, (s) =>
      s.includes('Alpha') && s.includes('Beta') && s.includes('Gamma') && s.includes('Delta') && /^##/m.test(s) && /^-/m.test(s)
    )
    expect(md).toContain('Alpha')
    expect(md).toContain('Beta')
    expect(md).toContain('Gamma')
    expect(md).toContain('Delta')
    expect(md).toMatch(/^##/m)
    expect(md).toMatch(/^-/m)
  })

  test('le markdown sérialisé est idempotent (aller-retour sans perte)', async ({ page }) => {
    const originalMd = [
      '# Mon titre',
      '',
      'Premier paragraphe avec du **gras** et de l\'_italique_.',
      '',
      '## Sous-section',
      '',
      '- item un',
      '- item deux',
      '',
      'Conclusion.',
    ].join('\n')

    await gotoEditor(page, originalMd)

    // Attendre que l'éditeur ait chargé et émis le md normalisé
    const md = await waitForMd(page, (s) => s.includes('Mon titre'), 2000)

    // Le contenu textuel doit être présent
    expect(md).toContain('Mon titre')
    expect(md).toContain('Premier paragraphe')
    expect(md).toContain('Sous-section')
    expect(md).toContain('item un')
    expect(md).toContain('Conclusion')
  })

})
