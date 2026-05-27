import { test, expect, type Page } from '@playwright/test'

/**
 * Test pour reproduire le bug des listes imbriquées qui perdent leur contenu
 * Scénario: 
 * 1. Créer une liste imbriquée
 * 2. Sauvegarder
 * 3. Ouvrir un autre fichier + modif dummy
 * 4. Retourner au premier fichier
 * 5. Vérifier que le contenu est toujours là
 */

const FULL_DOC_MD = `# Document de test

Avant les listes.
`

const NESTED_LIST_MD = `# Listes imbriquées

- Item 1
  - Sub 1.1
    - Sub 1.1.1
  - Sub 1.2
- Item 2
  - Sub 2.1

Après les listes.
`

async function gotoEditor(page: Page, markdown?: string) {
  await page.goto('/tests/fixtures/editor.html')
  if (markdown) {
    await page.addInitScript(({ md }) => {
      window.__PW_MD__ = md
    }, { md: markdown })
  }
  await page.reload()
}

async function waitForMd(page: Page, predicate: (md: string) => boolean, timeout = 5000): Promise<string> {
  let md = ''
  await expect(async () => {
    md = (await page.locator('#pw-md-output').textContent()) ?? ''
    expect(predicate(md)).toBe(true)
  }).toPass({ timeout })
  return md
}

async function waitForMdOutput(page: Page, timeout = 5000): Promise<string> {
  return waitForMd(page, (md) => md.length > 0, timeout)
}

test('Nested list: create and edit', async ({ page }) => {
  // Setup initial markdown avec une liste imbriquée
  await gotoEditor(page, NESTED_LIST_MD)
  
  // Vérifier que la liste initiale est là
  const initialMd = await waitForMdOutput(page)
  expect(initialMd).toContain('- Item 1')
  expect(initialMd).toContain('- Sub 1.1')
  expect(initialMd).toContain('- Sub 1.1.1')
  expect(initialMd).toContain('- Item 2')
  
  // Cliquer sur le dernier item pour le modifier
  const lastItem = page.locator('[data-list-text]').last()
  await lastItem.click()
  await lastItem.focus()
  
  // Appuyer sur End pour aller à la fin, puis ajouter du texte
  await page.keyboard.press('End')
  await page.keyboard.type(' - MODIFIED')
  
  // Trigger blur to save (ArrowDown déclenche le blur sur le dernier item)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  
  // Attendre que le markdown soit mis à jour avec la modification
  const updatedMd = await waitForMd(page, (md) => md.includes('Sub 2.1 - MODIFIED'))
  expect(updatedMd).toContain('Sub 2.1 - MODIFIED')
  
  // Vérifier que les autres items sont toujours intacts
  expect(updatedMd).toContain('- Item 1')
  expect(updatedMd).toContain('- Sub 1.1')
  expect(updatedMd).toContain('- Sub 1.1.1')
  expect(updatedMd).toContain('- Item 2')
})

test('Nested list: press Enter to create new item', async ({ page }) => {
  await gotoEditor(page, NESTED_LIST_MD)
  
  const initialMd = await waitForMdOutput(page)
  expect(initialMd).toContain('- Sub 1.1')
  
  // Cliquer sur Sub 1.1 et aller à la fin
  const subItem = page.locator('[data-list-text]').filter({ hasText: 'Sub 1.1' }).first()
  await subItem.click()
  await subItem.focus()
  await page.keyboard.press('End')
  
  // Appuyer sur Enter: le contenu de Sub 1.1 doit être préservé, un nouvel item créé
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100) // Laisser le RAF/focus se déclencher
  
  // Cliquer sur le nouvel item créé pour garantir le focus
  const newItem = page.locator('[data-list-text]').nth(2) // après Sub 1.1
  await expect(newItem).toBeVisible()
  await newItem.click()
  
  // Taper du contenu dans le nouvel item créé
  await page.keyboard.type('New nested item')
  
  // ArrowDown pour blur et déclencher save
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  
  // Enter déclenche handleItemEnter: waitForMd avec prédicat
  const updatedMd = await waitForMd(page, (md) => md.includes('New nested item'))
  
  // Vérifier que le nouvel item est bien créé
  expect(updatedMd).toContain('New nested item')
  
  // Vérifier que l'ancien item n'a pas perdu son contenu
  expect(updatedMd).toContain('- Sub 1.1')
  
  // Vérifier que les autres niveaux sont intacts
  expect(updatedMd).toContain('- Sub 1.1.1')
  expect(updatedMd).toContain('- Item 1')
})

test('Nested list: multiple Enter presses', async ({ page }) => {
  /**
   * Test de stress: appuyer sur Enter plusieurs fois dans une sous-liste
   * Le contenu de chaque item doit être préservé
   */
  await gotoEditor(page, `# Test\n\n- Item\n  - Sub A\n\nFin du document\n`)
  
  // Cliquer sur Sub A et aller à la fin pour appuyer Enter
  const subItem = page.locator('[data-list-text]').filter({ hasText: 'Sub A' }).first()
  await subItem.click()
  await subItem.focus()
  await page.keyboard.press('End')
  
  // Enter pour créer nouvel item
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100) // Laisser le RAF/focus se déclencher
  const secondItem = page.locator('[data-list-text]').nth(2)
  await expect(secondItem).toBeVisible()
  await secondItem.click()
  await page.keyboard.type('Sub B')
  await page.keyboard.press('End')
  
  // Enter pour créer encore un nouvel item
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100) // Laisser le RAF/focus se déclencher
  const thirdItem = page.locator('[data-list-text]').nth(3)
  await expect(thirdItem).toBeVisible()
  await thirdItem.click()
  await page.keyboard.type('Sub C')
  
  // ArrowDown pour blur et déclencher save
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  
  // Attendre la mise à jour (Sub C a été tapé, handleItemEnter emit déjà)
  const finalMd = await waitForMd(page, (md) => md.includes('Sub C'))
  
  // Vérifier que tous les items ont leur contenu
  expect(finalMd).toContain('- Sub A')
  expect(finalMd).toContain('- Sub B')
  expect(finalMd).toContain('- Sub C')
  
  // Pas de tirets vides
  const emptyBullets = finalMd.match(/^\s*-\s*$/gm)
  expect(emptyBullets?.length || 0).toBeLessThan(2) // Accepte max 1 vide (dernier item)
})

test('Nested list: verify no content loss after multiple operations', async ({ page }) => {
  /**
   * Scénario: modifier un item dans une liste imbriquée, puis Enter → nouveau item
   * Tous les items doivent conserver leur contenu
   */
  const initialContent = `# Test\n\n- A\n  - A1\n    - A1a\n  - A2\n- B\n`
  await gotoEditor(page, initialContent)
  
  let md = await waitForMdOutput(page)
  expect(md).toContain('- A1a')
  
  // Modifier A1a (cliquer et aller à la fin)
  const deepItem = page.locator('[data-list-text]').filter({ hasText: 'A1a' }).first()
  await deepItem.click()
  await deepItem.focus()
  await page.keyboard.press('End')
  await page.keyboard.type(' [edited]')
  
  // Appuyer sur Enter: handleItemEnter va émettre avec beforeInlines = 'A1a [edited]'
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100) // Laisser le RAF/focus se déclencher
  const newDeepItem = page.locator('[data-list-text]').nth(3) // après A1a
  await expect(newDeepItem).toBeVisible()
  await newDeepItem.click()
  await page.keyboard.type('A1b')
  
  // ArrowDown pour blur et déclencher save
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(300)
  
  // Attendre que A1b apparaisse (handleItemEnter l'a émis)
  md = await waitForMd(page, (md) => md.includes('A1b'))
  
  // Vérifier que TOUT est intègre
  expect(md).toContain('- A1')
  expect(md).toContain('A1a') // "A1a [edited]" ou "A1a \[edited\]" selon l'échappement
  expect(md).not.toContain('- A1a\n- A1b') // A1a et A1b doivent être séparés proprement
  expect(md).toContain('- A1b')
  expect(md).toContain('- A2')
  expect(md).toContain('- B')
})
