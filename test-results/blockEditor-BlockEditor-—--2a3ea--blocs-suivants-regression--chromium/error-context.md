# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blockEditor.spec.ts >> BlockEditor — slash commands >> list-bullet en milieu de doc ne fait pas disparaître les blocs suivants (regression)
- Location: tests/e2e/blockEditor.spec.ts:65:3

# Error details

```
Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc B' }) resolved to 2 elements:
    1) <div data-block-id="b2" data-block-type="paragraph" class="group/block relative">…</div> aka locator('div').filter({ hasText: 'Bloc B' }).nth(3)
    2) <div data-empty="false" class="outline-none" contenteditable="true" data-block-type="paragraph" data-placeholder="Commencez à taper…">Bloc B</div> aka getByTestId('block-editor').getByText('Bloc B')

Call log:
  - waiting for locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc B' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic "Sélectionner le bloc" [ref=e6] [cursor=pointer]
    - generic [ref=e8]: Bloc A
  - generic [ref=e9]:
    - generic "Sélectionner le bloc" [ref=e10] [cursor=pointer]
    - generic [ref=e12]: Bloc B
  - generic [ref=e13]:
    - generic "Sélectionner le bloc" [ref=e14] [cursor=pointer]
    - generic [ref=e16]: Bloc C
  - generic [ref=e17]:
    - generic "Sélectionner le bloc" [ref=e18] [cursor=pointer]
    - generic [ref=e20]: Bloc D
```

# Test source

```ts
  1   | /**
  2   |  * blockEditor.spec.ts — Batterie de tests E2E pour BlockEditor
  3   |  *
  4   |  * Couvre les interactions critiques de l'éditeur :
  5   |  *   - Commandes slash (bug regression : contenu suivant ne doit pas disparaître)
  6   |  *   - Raccourcis markdown (- espace → liste, # espace → titre)
  7   |  *   - Navigation inter-blocs (Enter, Backspace)
  8   |  *   - Conversions de type en milieu et fin de document
  9   |  */
  10  | 
  11  | import { test, expect, Page } from '@playwright/test'
  12  | 
  13  | // ─── Helpers ─────────────────────────────────────────────────────────────────
  14  | 
  15  | const FIXTURE_URL = '/tests/fixtures/editor.html'
  16  | 
  17  | /** Markdown courant selon le spy #pw-md-output */
  18  | async function getCurrentMd(page: Page): Promise<string> {
  19  |   return page.locator('#pw-md-output').textContent() ?? ''
  20  | }
  21  | 
  22  | /** Attends que le BlockEditor soit prêt */
  23  | async function waitForEditor(page: Page) {
  24  |   await page.waitForSelector('[data-testid="block-editor"]', { timeout: 10_000 })
  25  | }
  26  | 
  27  | /**
  28  |  * Navigue vers la fixture avec un markdown initial personnalisé.
  29  |  * Le markdown est injecté via window.__PW_MD__ AVANT le chargement du script React.
  30  |  */
  31  | async function gotoEditor(page: Page, markdown?: string) {
  32  |   if (markdown) {
  33  |     await page.addInitScript((md) => { (window as any).__PW_MD__ = md }, markdown)
  34  |   }
  35  |   await page.goto(FIXTURE_URL)
  36  |   await waitForEditor(page)
  37  | }
  38  | 
  39  | /** Trouve un bloc paragraph par son contenu texte */
  40  | function paragraphWithText(page: Page, text: string) {
  41  |   return page.locator('[data-block-type="paragraph"]').filter({ hasText: text })
  42  | }
  43  | 
  44  | /**
  45  |  * Ouvre la slash command depuis un bloc paragraph vide focalisé.
  46  |  * Présuppose que le curseur est déjà dans un bloc vide.
  47  |  */
  48  | async function openSlashPopup(page: Page) {
  49  |   await page.keyboard.type('/')
  50  |   await page.waitForSelector('[data-testid="slash-popup"]', { timeout: 3_000 })
  51  | }
  52  | 
  53  | /** Sélectionne une commande slash par son label */
  54  | async function selectSlashCommand(page: Page, label: string) {
  55  |   // Taper le début du label pour filtrer et réduire le risque d'ambiguïté
  56  |   const query = label.split(' ')[0]
  57  |   await page.keyboard.type(query)
  58  |   await page.getByRole('button', { name: label }).first().click()
  59  | }
  60  | 
  61  | // ─── Tests ───────────────────────────────────────────────────────────────────
  62  | 
  63  | test.describe('BlockEditor — slash commands', () => {
  64  | 
  65  |   test('list-bullet en milieu de doc ne fait pas disparaître les blocs suivants (regression)', async ({ page }) => {
  66  |     await gotoEditor(page, [
  67  |       'Bloc A',
  68  |       '',
  69  |       'Bloc B',
  70  |       '',
  71  |       'Bloc C',
  72  |       '',
  73  |       'Bloc D',
  74  |     ].join('\n'))
  75  | 
  76  |     // Cliquer dans Bloc B → fin → Enter → nouveau bloc vide
  77  |     const blocB = paragraphWithText(page, 'Bloc B')
> 78  |     await blocB.click()
      |                 ^ Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Bloc B' }) resolved to 2 elements:
  79  |     await page.keyboard.press('End')
  80  |     await page.keyboard.press('Enter')
  81  | 
  82  |     // Le nouveau bloc vide est focalisé — ouvrir le popup slash
  83  |     await openSlashPopup(page)
  84  |     await selectSlashCommand(page, 'Liste à puces')
  85  | 
  86  |     // Vérifier que Bloc C et Bloc D sont toujours là
  87  |     await expect(paragraphWithText(page, 'Bloc C')).toBeVisible()
  88  |     await expect(paragraphWithText(page, 'Bloc D')).toBeVisible()
  89  | 
  90  |     // Vérifier le markdown sérialisé
  91  |     const md = await getCurrentMd(page)
  92  |     expect(md).toContain('Bloc C')
  93  |     expect(md).toContain('Bloc D')
  94  |     expect(md).toMatch(/^- /m) // au moins un item de liste à puces
  95  |   })
  96  | 
  97  |   test('list-bullet en fin de doc ajoute un paragraphe vide après', async ({ page }) => {
  98  |     await gotoEditor(page, 'Seul bloc\n')
  99  | 
  100 |     const bloc = paragraphWithText(page, 'Seul bloc')
  101 |     await bloc.click()
  102 |     await page.keyboard.press('End')
  103 |     await page.keyboard.press('Enter')
  104 | 
  105 |     await openSlashPopup(page)
  106 |     await selectSlashCommand(page, 'Liste à puces')
  107 | 
  108 |     // Le doc doit contenir la liste ET un paragraphe vide après
  109 |     const md = await getCurrentMd(page)
  110 |     expect(md).toMatch(/^- /m)
  111 |     // La liste n'est pas le dernier caractère (paragraphe vide ajouté)
  112 |     expect(md.trimEnd()).not.toMatch(/\n- \s*$/)
  113 |   })
  114 | 
  115 |   test('heading-1 en milieu de doc préserve les blocs suivants', async ({ page }) => {
  116 |     await gotoEditor(page, [
  117 |       'Intro',
  118 |       '',
  119 |       'Milieu',
  120 |       '',
  121 |       'Fin',
  122 |     ].join('\n'))
  123 | 
  124 |     const milieu = paragraphWithText(page, 'Milieu')
  125 |     await milieu.click()
  126 |     await page.keyboard.press('End')
  127 |     await page.keyboard.press('Enter')
  128 | 
  129 |     await openSlashPopup(page)
  130 |     await selectSlashCommand(page, 'Titre 1')
  131 | 
  132 |     await expect(paragraphWithText(page, 'Fin')).toBeVisible()
  133 |     const md = await getCurrentMd(page)
  134 |     expect(md).toContain('Fin')
  135 |     expect(md).toMatch(/^# /m)
  136 |   })
  137 | 
  138 |   test('table en milieu de doc préserve les blocs suivants', async ({ page }) => {
  139 |     await gotoEditor(page, [
  140 |       'Avant',
  141 |       '',
  142 |       'Milieu',
  143 |       '',
  144 |       'Après',
  145 |     ].join('\n'))
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
```