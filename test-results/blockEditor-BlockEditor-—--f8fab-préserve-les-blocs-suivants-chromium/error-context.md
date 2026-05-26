# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blockEditor.spec.ts >> BlockEditor — slash commands >> checklist en milieu de doc préserve les blocs suivants
- Location: tests/e2e/blockEditor.spec.ts:158:3

# Error details

```
Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Milieu' }) resolved to 2 elements:
    1) <div data-block-id="b2" data-block-type="paragraph" class="group/block relative">…</div> aka locator('div').filter({ hasText: 'Milieu' }).nth(3)
    2) <div data-empty="false" class="outline-none" contenteditable="true" data-block-type="paragraph" data-placeholder="Commencez à taper…">Milieu</div> aka getByTestId('block-editor').getByText('Milieu')

Call log:
  - waiting for locator('[data-block-type="paragraph"]').filter({ hasText: 'Milieu' })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - generic [ref=e5]:
    - generic "Sélectionner le bloc" [ref=e6] [cursor=pointer]
    - generic [ref=e8]: Intro
  - generic [ref=e9]:
    - generic "Sélectionner le bloc" [ref=e10] [cursor=pointer]
    - generic [ref=e12]: Milieu
  - generic [ref=e13]:
    - generic "Sélectionner le bloc" [ref=e14] [cursor=pointer]
    - generic [ref=e16]: Conclusion
```

# Test source

```ts
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
  78  |     await blocB.click()
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
> 168 |     await milieu.click()
      |                  ^ Error: locator.click: Error: strict mode violation: locator('[data-block-type="paragraph"]').filter({ hasText: 'Milieu' }) resolved to 2 elements:
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
```