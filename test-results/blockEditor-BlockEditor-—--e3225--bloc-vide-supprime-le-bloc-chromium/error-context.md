# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blockEditor.spec.ts >> BlockEditor — navigation et structure >> Backspace sur un bloc vide supprime le bloc
- Location: tests/e2e/blockEditor.spec.ts:277:3

# Error details

```
Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc deux' }) resolved to 2 elements:
    1) <div data-block-id="b2" data-block-type="paragraph" class="group/block relative">…</div> aka locator('div').filter({ hasText: 'Bloc deux' }).nth(3)
    2) <div data-empty="false" class="outline-none" contenteditable="true" data-block-type="paragraph" data-placeholder="Commencez à taper…">Bloc deux</div> aka getByTestId('block-editor').getByText('Bloc deux')

Call log:
  - waiting for locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc deux' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic "Sélectionner le bloc" [ref=e6] [cursor=pointer]
    - generic [ref=e8]: Bloc un
  - generic [ref=e9]:
    - generic "Sélectionner le bloc" [ref=e10] [cursor=pointer]
    - generic [ref=e12]: Bloc deux
  - generic [ref=e13]:
    - generic "Sélectionner le bloc" [ref=e14] [cursor=pointer]
    - generic [ref=e16]: Bloc trois
```

# Test source

```ts
  188 | 
  189 |     // Le popup est fermé
  190 |     await expect(page.locator('[data-testid="slash-popup"]')).not.toBeVisible()
  191 | 
  192 |     // Le contenu original est intact
  193 |     await expect(paragraphWithText(page, 'Mon paragraphe')).toBeVisible()
  194 |   })
  195 | 
  196 | })
  197 | 
  198 | test.describe('BlockEditor — raccourcis markdown', () => {
  199 | 
  200 |   test('- espace au début d\'un bloc vide crée une liste à puces', async ({ page }) => {
  201 |     await gotoEditor(page, 'Paragraphe\n')
  202 | 
  203 |     const bloc = paragraphWithText(page, 'Paragraphe')
  204 |     await bloc.click()
  205 |     await page.keyboard.press('End')
  206 |     await page.keyboard.press('Enter')
  207 |     // Bloc vide focalisé
  208 |     await page.keyboard.type('- ')
  209 | 
  210 |     // Le bloc doit être converti en liste
  211 |     const md = await getCurrentMd(page)
  212 |     expect(md).toMatch(/^- /m)
  213 |     await expect(paragraphWithText(page, 'Paragraphe')).toBeVisible()
  214 |   })
  215 | 
  216 |   test('# espace au début d\'un bloc vide crée un titre H1', async ({ page }) => {
  217 |     await gotoEditor(page, 'Intro\n')
  218 | 
  219 |     const bloc = paragraphWithText(page, 'Intro')
  220 |     await bloc.click()
  221 |     await page.keyboard.press('End')
  222 |     await page.keyboard.press('Enter')
  223 |     await page.keyboard.type('# ')
  224 | 
  225 |     const md = await getCurrentMd(page)
  226 |     expect(md).toMatch(/^# /m)
  227 |   })
  228 | 
  229 |   test('## espace crée un titre H2', async ({ page }) => {
  230 |     await gotoEditor(page, 'Intro\n')
  231 | 
  232 |     const bloc = paragraphWithText(page, 'Intro')
  233 |     await bloc.click()
  234 |     await page.keyboard.press('End')
  235 |     await page.keyboard.press('Enter')
  236 |     await page.keyboard.type('## ')
  237 | 
  238 |     const md = await getCurrentMd(page)
  239 |     expect(md).toMatch(/^## /m)
  240 |   })
  241 | 
  242 |   test('1. espace crée une liste ordonnée', async ({ page }) => {
  243 |     await gotoEditor(page, 'Intro\n')
  244 | 
  245 |     const bloc = paragraphWithText(page, 'Intro')
  246 |     await bloc.click()
  247 |     await page.keyboard.press('End')
  248 |     await page.keyboard.press('Enter')
  249 |     await page.keyboard.type('1. ')
  250 | 
  251 |     const md = await getCurrentMd(page)
  252 |     expect(md).toMatch(/^1\. /m)
  253 |   })
  254 | 
  255 | })
  256 | 
  257 | test.describe('BlockEditor — navigation et structure', () => {
  258 | 
  259 |   test('Enter en fin de bloc crée un nouveau paragraphe', async ({ page }) => {
  260 |     await gotoEditor(page, 'Un seul bloc\n')
  261 | 
  262 |     const md0 = await getCurrentMd(page)
  263 |     const blocksBefore = md0.split('\n\n').filter(Boolean).length
  264 | 
  265 |     const bloc = paragraphWithText(page, 'Un seul bloc')
  266 |     await bloc.click()
  267 |     await page.keyboard.press('End')
  268 |     await page.keyboard.press('Enter')
  269 |     await page.keyboard.type('Nouveau bloc')
  270 | 
  271 |     const md = await getCurrentMd(page)
  272 |     expect(md).toContain('Un seul bloc')
  273 |     expect(md).toContain('Nouveau bloc')
  274 |     expect(md.split('\n\n').filter(Boolean).length).toBeGreaterThan(blocksBefore)
  275 |   })
  276 | 
  277 |   test('Backspace sur un bloc vide supprime le bloc', async ({ page }) => {
  278 |     await gotoEditor(page, [
  279 |       'Bloc un',
  280 |       '',
  281 |       'Bloc deux',
  282 |       '',
  283 |       'Bloc trois',
  284 |     ].join('\n'))
  285 | 
  286 |     // Cliquer dans Bloc deux → sélectionner tout → supprimer → backspace
  287 |     const blocDeux = paragraphWithText(page, 'Bloc deux')
> 288 |     await blocDeux.click()
      |                    ^ Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc deux' }) resolved to 2 elements:
  289 |     await page.keyboard.press('Control+A')
  290 |     await page.keyboard.press('Delete')
  291 |     // Le bloc est maintenant vide → Backspace le supprime
  292 |     await page.keyboard.press('Backspace')
  293 | 
  294 |     // Bloc deux a disparu, les autres sont intacts
  295 |     await expect(paragraphWithText(page, 'Bloc un')).toBeVisible()
  296 |     await expect(paragraphWithText(page, 'Bloc trois')).toBeVisible()
  297 |     await expect(page.locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc deux' })).not.toBeVisible()
  298 |   })
  299 | 
  300 |   test('Édition simple : saisir du texte dans un bloc paragraph', async ({ page }) => {
  301 |     await gotoEditor(page)
  302 | 
  303 |     const bloc = paragraphWithText(page, 'Paragraphe un.')
  304 |     await bloc.click()
  305 |     await page.keyboard.press('End')
  306 |     await page.keyboard.type(' Texte ajouté')
  307 | 
  308 |     const md = await getCurrentMd(page)
  309 |     expect(md).toContain('Paragraphe un. Texte ajouté')
  310 |   })
  311 | 
  312 | })
  313 | 
  314 | test.describe('BlockEditor — intégrité du document', () => {
  315 | 
  316 |   test('plusieurs conversions successives préservent tous les blocs', async ({ page }) => {
  317 |     await gotoEditor(page, [
  318 |       'Alpha',
  319 |       '',
  320 |       'Beta',
  321 |       '',
  322 |       'Gamma',
  323 |       '',
  324 |       'Delta',
  325 |     ].join('\n'))
  326 | 
  327 |     // Convertir Gamma en liste via slash command
  328 |     const gamma = paragraphWithText(page, 'Gamma')
  329 |     await gamma.click()
  330 |     await page.keyboard.press('End')
  331 |     await page.keyboard.press('Enter')
  332 |     await openSlashPopup(page)
  333 |     await selectSlashCommand(page, 'Liste à puces')
  334 |     await expect(paragraphWithText(page, 'Delta')).toBeVisible()
  335 | 
  336 |     // Convertir Beta en titre
  337 |     const beta = paragraphWithText(page, 'Beta')
  338 |     await beta.click()
  339 |     await page.keyboard.press('End')
  340 |     await page.keyboard.press('Enter')
  341 |     await openSlashPopup(page)
  342 |     await selectSlashCommand(page, 'Titre 2')
  343 | 
  344 |     // Tous les blocs originaux sont toujours là
  345 |     await expect(paragraphWithText(page, 'Alpha')).toBeVisible()
  346 |     await expect(paragraphWithText(page, 'Delta')).toBeVisible()
  347 | 
  348 |     const md = await getCurrentMd(page)
  349 |     expect(md).toContain('Alpha')
  350 |     expect(md).toContain('Beta')
  351 |     expect(md).toContain('Gamma')
  352 |     expect(md).toContain('Delta')
  353 |     expect(md).toMatch(/^## /m)
  354 |     expect(md).toMatch(/^- /m)
  355 |   })
  356 | 
  357 |   test('le markdown sérialisé est idempotent (aller-retour sans perte)', async ({ page }) => {
  358 |     const originalMd = [
  359 |       '# Mon titre',
  360 |       '',
  361 |       'Premier paragraphe avec du **gras** et de l\'_italique_.',
  362 |       '',
  363 |       '## Sous-section',
  364 |       '',
  365 |       '- item un',
  366 |       '- item deux',
  367 |       '',
  368 |       'Conclusion.',
  369 |     ].join('\n')
  370 | 
  371 |     await gotoEditor(page, originalMd)
  372 | 
  373 |     // Juste attendre que l'éditeur ait chargé et émis le md normalisé
  374 |     await page.waitForTimeout(200)
  375 | 
  376 |     const md = await getCurrentMd(page)
  377 |     // Le contenu textuel doit être présent
  378 |     expect(md).toContain('Mon titre')
  379 |     expect(md).toContain('Premier paragraphe')
  380 |     expect(md).toContain('Sous-section')
  381 |     expect(md).toContain('item un')
  382 |     expect(md).toContain('Conclusion')
  383 |   })
  384 | 
  385 | })
  386 | 
```