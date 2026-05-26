# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blockEditor.spec.ts >> BlockEditor — raccourcis markdown >> 1. espace crée une liste ordonnée
- Location: tests/e2e/blockEditor.spec.ts:242:3

# Error details

```
Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Intro' }) resolved to 2 elements:
    1) <div data-block-id="b1" data-block-type="paragraph" class="group/block relative">…</div> aka locator('div').nth(3)
    2) <div data-empty="false" class="outline-none" contenteditable="true" data-block-type="paragraph" data-always-placeholder="true" data-placeholder="Commencez à taper  —  / ou Ctrl+Espace pour les commandes">Intro</div> aka getByTestId('block-editor').getByText('Intro')

Call log:
  - waiting for locator('[data-block-type="paragraph"]').filter({ hasText: 'Intro' })

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - generic "Sélectionner le bloc" [ref=e6] [cursor=pointer]
  - generic [ref=e8]: Intro
```

# Test source

```ts
  146 | 
  147 |     const milieu = paragraphWithText(page, 'Milieu')
  148 |     await milieu.click()
  149 |     await page.keyboard.press('End')
  150 |     await page.keyboard.press('Enter')
  151 | 
  152 |     await openSlashPopup(page)
  153 |     await selectSlashCommand(page, 'Tableau')
  154 | 
  155 |     await expect(paragraphWithText(page, 'Après')).toBeVisible()
  156 |   })
  157 | 
  158 |   test('checklist en milieu de doc préserve les blocs suivants', async ({ page }) => {
  159 |     await gotoEditor(page, [
  160 |       'Intro',
  161 |       '',
  162 |       'Milieu',
  163 |       '',
  164 |       'Conclusion',
  165 |     ].join('\n'))
  166 | 
  167 |     const milieu = paragraphWithText(page, 'Milieu')
  168 |     await milieu.click()
  169 |     await page.keyboard.press('End')
  170 |     await page.keyboard.press('Enter')
  171 | 
  172 |     await openSlashPopup(page)
  173 |     await selectSlashCommand(page, 'Checklist')
  174 | 
  175 |     await expect(paragraphWithText(page, 'Conclusion')).toBeVisible()
  176 |   })
  177 | 
  178 |   test('Échap ferme le popup sans modifier le contenu', async ({ page }) => {
  179 |     await gotoEditor(page, 'Mon paragraphe\n')
  180 | 
  181 |     const bloc = paragraphWithText(page, 'Mon paragraphe')
  182 |     await bloc.click()
  183 |     await page.keyboard.press('End')
  184 |     await page.keyboard.press('Enter')
  185 | 
  186 |     await openSlashPopup(page)
  187 |     await page.keyboard.press('Escape')
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
> 246 |     await bloc.click()
      |                ^ Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Intro' }) resolved to 2 elements:
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
  288 |     await blocDeux.click()
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
```