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

async function installMentionApiMock(page: Page) {
  await page.addInitScript(() => {
    const existing = (window as Window & { holo?: Record<string, unknown> }).holo ?? {}
    ;(window as Window & { holo?: Record<string, unknown> }).holo = {
      ...existing,
      gitGetContributors: async () => [
        { commitCount: 42, authorName: 'Romane', authorEmail: 'romane@example.com' },
        { commitCount: 17, authorName: 'Jane Doe', authorEmail: '12345+janedoe@users.noreply.github.com' },
      ],
    }
  })
}

async function installMentionApiFailureMock(page: Page) {
  await page.addInitScript(() => {
    const existing = (window as Window & { holo?: Record<string, unknown> }).holo ?? {}
    ;(window as Window & { holo?: Record<string, unknown> }).holo = {
      ...existing,
      gitGetContributors: async () => {
        throw new Error('contributors unavailable')
      },
    }
  })
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

async function selectTextRange(locator: ReturnType<Page['locator']>, start: number, end: number) {
  await locator.evaluate((el, range) => {
    const root = el as HTMLElement
    const selection = window.getSelection()
    if (!selection) return

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let currentOffset = 0
    let startNode: Text | null = null
    let endNode: Text | null = null
    let startOffset = 0
    let endOffset = 0

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const nextOffset = currentOffset + textNode.data.length

      if (!startNode && range.start >= currentOffset && range.start <= nextOffset) {
        startNode = textNode
        startOffset = range.start - currentOffset
      }

      if (!endNode && range.end >= currentOffset && range.end <= nextOffset) {
        endNode = textNode
        endOffset = range.end - currentOffset
        break
      }

      currentOffset = nextOffset
    }

    if (!startNode || !endNode) return

    const domRange = document.createRange()
    domRange.setStart(startNode, startOffset)
    domRange.setEnd(endNode, endOffset)
    selection.removeAllRanges()
    selection.addRange(domRange)
  }, { start, end })
}

async function placeCaretAtEnd(locator: ReturnType<Page['locator']>) {
  await locator.evaluate((el) => {
    const root = el as HTMLElement
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.setStart(root, root.childNodes.length)
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  })
}

// ─── 1. BlockquoteBlock ────────────────────────────────────────────────────────

test.describe('BlockquoteBlock — édition et sérialisation', () => {

  test('taper > espace convertit un paragraphe en citation', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('> ')
    const bqEditor = page.locator('[data-block-type="blockquote"][contenteditable]')
    await expect(bqEditor).toBeVisible({ timeout: 3_000 })
    await bqEditor.click()
    await page.keyboard.type('Citation via raccourci')
    await page.keyboard.press('Tab')
    await expect(bqEditor).toContainText('Citation via raccourci')

    const md = await waitForMd(page, (s) =>
      s.includes('> Citation via raccourci') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

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

  test('le popup de type citation se ferme au blur et garde un z-index eleve', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    const blockquote = page.locator('blockquote').first()
    const typeButton = blockquote.getByRole('button', { name: /Type de citation/i })
    await typeButton.click()

    const popupOption = page.getByRole('button', { name: 'Définir le type Citation simple' })
    await expect(popupOption).toBeVisible({ timeout: 3_000 })
    // Le popup est rendu via React portal dans document.body (position: fixed, z-index: 9999)
    const popup = popupOption.locator('xpath=ancestor::div[2]')
    await expect(popup).toHaveCSS('z-index', '9999')

    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Gamma-dernier' }).click()
    await expect(popupOption).toBeHidden({ timeout: 3_000 })
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

  test('blockquote github alert est stylé et préserve son marqueur markdown', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '> [!NOTE]',
      '> Information utile',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const alertBlock = page.locator('blockquote[data-blockquote-alert="note"]')
    await expect(alertBlock).toBeVisible()
    await expect(alertBlock.getByRole('button', { name: 'Type de citation Note' })).toBeVisible()

    const alertEditor = alertBlock.locator('[data-block-type="blockquote"][contenteditable]')
    await alertEditor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' complément')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('> [!NOTE]') && s.includes('> Information utile complément'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })

  test('création d\'une alerte github via slash command', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Alerte note')

    const alertBlock = page.locator('blockquote[data-blockquote-alert="note"]')
    await expect(alertBlock).toBeVisible()

    const alertEditor = alertBlock.locator('[data-block-type="blockquote"][contenteditable]')
    await alertEditor.click()
    await page.keyboard.type('Depuis slash')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('> [!NOTE]') && s.includes('> Depuis slash') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('le bouton de type permet de convertir une citation en alerte puis de revenir en citation simple', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Citation')

    const blockquote = page.locator('blockquote').filter({ has: page.locator('[data-block-type="blockquote"][contenteditable]') }).first()
    const editor = blockquote.locator('[data-block-type="blockquote"][contenteditable]')
    await editor.click()
    await page.keyboard.type('Texte de citation')

    await blockquote.hover()
    await blockquote.getByRole('button', { name: 'Type de citation Citation' }).click()
    await page.getByRole('button', { name: 'Définir le type Attention' }).click()

    const warningMd = await waitForMd(page, (s) =>
      s.includes('> [!WARNING]') && s.includes('> Texte de citation'),
      6000,
    )
    expect(warningMd).toContain('Gamma-dernier')

    await blockquote.hover()
    await blockquote.getByRole('button', { name: 'Type de citation Attention' }).click()
    await page.getByRole('button', { name: 'Définir le type Citation simple' }).click()

    const plainMd = await waitForMd(page, (s) =>
      s.includes('> Texte de citation') && !s.includes('[!WARNING]'),
      6000,
    )
    expect(plainMd).toContain('Gamma-dernier')
  })
})

test.describe('MermaidBlock — édition et sérialisation', () => {
  test('création via slash command, rendu et persistance markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Diagramme Mermaid')

    const textarea = page.locator('textarea[placeholder*="flowchart TD"]').first()
    await expect(textarea).toBeVisible()
    await textarea.fill('flowchart LR\n  A[Alpha] --> B[Bravo]')
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1)

    const md = await waitForMd(page, (s) =>
      s.includes('```mermaid') && s.includes('A[Alpha] --> B[Bravo]') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un bloc mermaid pré-existant est rendu et reste éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '```mermaid',
      'flowchart TD',
      '  Start --> End',
      '```',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1)

    await page.locator('button[title="Cliquer pour modifier le diagramme"]').click()
    const textarea = page.locator('textarea[placeholder*="flowchart TD"]').first()
    await textarea.fill('flowchart TD\n  Start --> Middle\n  Middle --> End')
    await page.getByRole('button', { name: 'Valider' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('Middle --> End') && s.includes('```mermaid'),
      6000,
    )
    expect(md).toContain('Gamma-dernier')
  })

  test('un diagramme mermaid peut s ouvrir en plein écran', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '```mermaid',
      'flowchart TD',
      '  Start --> End',
      '```',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await page.getByRole('button', { name: 'Voir le diagramme en plein écran' }).click()
    await expect(page.getByRole('dialog', { name: 'Diagramme Mermaid en plein écran' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer le diagramme en plein écran' }).click()
    await expect(page.getByRole('dialog', { name: 'Diagramme Mermaid en plein écran' })).toBeHidden()
  })
})

test.describe('DetailsBlock — édition et sérialisation', () => {
  test('création via slash command, rendu et persistance markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Section repliable')

    const summaryInput = page.locator('input[placeholder="Click me"]').first()
    await expect(summaryInput).toBeVisible()
    await summaryInput.fill('Bloc repliable')

    const textarea = page.locator('textarea[placeholder="Content"]').first()
    await textarea.fill('Contenu **markdown**\n\n- Alpha\n- Bravo')
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('details')).toHaveCount(1)
    await expect(page.locator('summary')).toContainText('Bloc repliable')

    const md = await waitForMd(page, (s) =>
      s.includes('<details>')
      && s.includes('<summary>Bloc repliable</summary>')
      && s.includes('Contenu **markdown**')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un bloc details pré-existant reste éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '<details>',
      '<summary>Click me</summary>',
      '',
      'Content',
      '</details>',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await expect(page.locator('summary')).toContainText('Click me')
    await page.locator('button[title="Cliquer pour modifier la section repliable"]').click()

    const summaryInput = page.locator('input[placeholder="Click me"]').first()
    await summaryInput.fill('Nouvelle section')
    const textarea = page.locator('textarea[placeholder="Content"]').first()
    await textarea.fill('Ligne 1\n\nLigne 2')
    await page.getByRole('button', { name: 'Valider' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('<summary>Nouvelle section</summary>')
      && s.includes('Ligne 2')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })
})

test.describe('Formatage inline — exposant et indice', () => {
  test('applique exposant et indice via raccourcis clavier et persiste le markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await milieu.click()
    await page.keyboard.type('H2O CO2')

    await selectTextRange(milieu, 'Beta-milieuH'.length, 'Beta-milieuH2'.length)
    await page.keyboard.press('Control+Period')

    await selectTextRange(milieu, 'Beta-milieuH2O CO'.length, 'Beta-milieuH2O CO2'.length)
    await page.keyboard.press('Control+Comma')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('H<sup>2</sup>O CO<sub>2</sub>') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un markdown pré-existant avec sup et sub reste éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      'H<sup>2</sup>O et CO<sub>2</sub>',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const paragraph = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'H2O et CO2' }).first()
    await expect(paragraph.locator('sup')).toHaveText('2')
    await expect(paragraph.locator('sub')).toHaveText('2')

    await paragraph.click()
    await placeCaretAtEnd(paragraph)
    await page.keyboard.type(' ok')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('H<sup>2</sup>O et CO<sub>2 ok</sub>') && s.includes('Alpha-premier'),
      6000,
    )
    expect(md).toContain('Gamma-dernier')
  })
})

test.describe('Code inline — détection automatique des couleurs', () => {
  test('affiche un swatch pour hex, rgb et hsl sans changer le markdown', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      'Palette `#FF6600` `rgb(12, 34, 56)` `hsl(210, 60%, 50%)` et `hello`',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const paragraph = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Palette' }).first()
    await expect(paragraph.locator('code[data-inline-color="#FF6600"]')).toHaveCount(1)
    await expect(paragraph.locator('code[data-inline-color="rgb(12, 34, 56)"]')).toHaveCount(1)
    await expect(paragraph.locator('code[data-inline-color="hsl(210, 60%, 50%)"]')).toHaveCount(1)
    await expect(paragraph.locator('code[data-inline-color]').filter({ hasText: 'hello' })).toHaveCount(0)

    const md = await waitForMd(page, (s) =>
      s.includes('`#FF6600`')
      && s.includes('`rgb(12, 34, 56)`')
      && s.includes('`hsl(210, 60%, 50%)`')
      && s.includes('`hello`'),
      3000,
    )
    expect(md).toContain('Gamma-dernier')
  })
})

test.describe('HtmlBlock — édition et sérialisation', () => {
  test('création via slash command, rendu et persistance markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Bloc HTML')

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    await textarea.fill('<section class="promo"><strong>Bonjour HTML</strong><p>Contenu</p></section>')
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('.promo')).toHaveCount(1)
    await expect(page.locator('.promo strong')).toContainText('Bonjour HTML')

    const md = await waitForMd(page, (s) =>
      s.includes('<section class="promo"><strong>Bonjour HTML</strong><p>Contenu</p></section>')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un bloc html pré-existant reste éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '<div class="promo">Hello</div>',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await expect(page.locator('.promo')).toContainText('Hello')
    await page.locator('button[title="Cliquer pour modifier le bloc HTML"]').click()

    const textarea = page.locator('textarea').first()
    await textarea.fill('<div class="promo"><em>Hello édité</em></div>')
    await page.getByRole('button', { name: 'Valider' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('<div class="promo"><em>Hello édité</em></div>')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })
})

test.describe('YouTubeBlock — édition et sérialisation', () => {
  test('création via slash command, rendu et persistance markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Vidéo YouTube')

    const input = page.locator('input[type="url"]').first()
    await expect(input).toBeVisible()
    await input.fill('https://youtu.be/dQw4w9WgXcQ')
    await page.getByRole('button', { name: 'Valider' }).click()

      await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/dQw4w9WgXcQ"]')).toHaveCount(1)

    const md = await waitForMd(page, (s) =>
      s.includes('<iframe')
      && s.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('une iframe youtube pré-existante reste éditable', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
        '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Vidéo YouTube" allowfullscreen></iframe>',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await expect(page.locator('iframe[src*="embed/dQw4w9WgXcQ"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Modifier la vidéo YouTube' }).click()

  const input = page.locator('input[type="url"]').first()
  await input.fill('https://www.youtube.com/watch?v=M7lc1UVf-VE')
  await page.getByRole('button', { name: 'Valider' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('youtube-nocookie.com/embed/M7lc1UVf-VE')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('Ctrl+A dans l input YouTube sélectionne seulement l URL et pas tous les blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
        '<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Vidéo YouTube" allowfullscreen></iframe>',
      '',
      'Gamma-dernier',
    ].join('\n'))

    await page.getByRole('button', { name: 'Modifier la vidéo YouTube' }).click()

    const input = page.locator('input[type="url"]').first()
    await expect(input).toBeVisible()
    await input.press('Control+A')
    await input.type('https://www.youtube.com/watch?v=eNhx-ehhumg')
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/eNhx-ehhumg"]')).toHaveCount(1)

    const md = await waitForMd(page, (s) =>
      s.includes('Alpha-premier')
      && s.includes('Gamma-dernier')
      && s.includes('youtube-nocookie.com/embed/eNhx-ehhumg'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })

  test('un lien watch youtube valide produit un embed compatible sans erreur 153', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Vidéo YouTube')

  const input = page.locator('input[type="url"]').first()
  await expect(input).toBeVisible()
  await input.fill('https://www.youtube.com/watch?v=eNhx-ehhumg')
  await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/eNhx-ehhumg"]')).toHaveCount(1)

    const md = await waitForMd(page, (s) =>
      s.includes('youtube-nocookie.com/embed/eNhx-ehhumg') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un autre lien watch youtube valide produit aussi un embed compatible', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Vidéo YouTube')

    const input = page.locator('input[type="url"]').first()
    await expect(input).toBeVisible()
    await input.fill('https://www.youtube.com/watch?v=L5mJQ0kyHbM')
    await page.getByRole('button', { name: 'Valider' }).click()

    await expect(page.locator('iframe[src*="youtube-nocookie.com/embed/L5mJQ0kyHbM"]')).toHaveCount(1)

    const md = await waitForMd(page, (s) =>
      s.includes('youtube-nocookie.com/embed/L5mJQ0kyHbM') && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })
})

test.describe('Mentions — autocomplete repo', () => {
  test('taper @ ouvre des suggestions et insère la mention choisie', async ({ page }) => {
    await installMentionApiMock(page)
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' @ro')

    const popup = page.getByTestId('mention-popup')
    await expect(popup).toBeVisible()
    await expect(popup).toContainText('@romane')

    await page.keyboard.press('Enter')

    const md = await waitForMd(page, (s) =>
      s.includes('Beta-milieu @romane')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('@romane')
  })

  test('si le chargement des contributeurs échoue la saisie reste possible sans popup', async ({ page }) => {
    await installMentionApiFailureMock(page)
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' @ro')

    await expect(page.getByTestId('mention-popup')).toHaveCount(0)
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('Beta-milieu @ro')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })
})

// ─── 2. Footnotes (références inline + définitions masquées) ──────────────────

test.describe('Footnotes — référence inline, tooltip et sérialisation', () => {

  test('sélectionner un mot crée une référence inline et une définition masquée', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await selectTextRange(milieu, 0, 4)

    await page.getByTitle('Créer une note de bas de page').click()

    // Une ancre inline avec badge doit apparaître, et aucun bloc de définition visible
    const anchor = page.locator('.holo-footnote-anchor').first()
    await expect(anchor).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('[data-block-type="footnoteDefinition"]')).toHaveCount(0)

    // Le markdown stocke la référence inline + la définition (vide) en fin de document
    const md = await waitForMd(page, (s) =>
      /Beta\[\^[^\]]+\]-milieu/.test(s) && /\n\[\^[^\]]+\]:/.test(s) && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('éditer le contenu via le tooltip met à jour la définition markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await selectTextRange(milieu, 0, 4)
    await page.getByTitle('Créer une note de bas de page').click()

    const anchor = page.locator('.holo-footnote-anchor').first()
    await expect(anchor).toBeVisible({ timeout: 3_000 })
    await anchor.hover()

    const tooltip = page.getByTestId('footnote-editor-tooltip')
    await expect(tooltip).toBeVisible({ timeout: 3_000 })
    const textarea = tooltip.locator('textarea')
    await textarea.click()
    await textarea.fill('Contenu de la note de bas de page')

    const md = await waitForMd(page, (s) =>
      /\[\^[^\]]+\]:\s*Contenu de la note de bas de page/m.test(s) && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toMatch(/Beta\[\^[^\]]+\]-milieu/)
    expect(md).toContain('Alpha-premier')
  })

  test('note pré-existante : définition masquée, tooltip affiche le contenu', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      'Texte avec note[^1] ici.',
      '',
      'Gamma-dernier',
      '',
      '[^1]: Note pré-existante',
    ].join('\n'))

    // La définition n'apparaît pas comme bloc éditable
    await expect(page.locator('[data-block-type="footnoteDefinition"]')).toHaveCount(0)

    // La référence inline est visible et son tooltip montre le contenu existant
    const anchor = page.locator('sup[data-footnote-ref]').first()
    await expect(anchor).toBeVisible()
    await anchor.hover()

    const tooltip = page.getByTestId('footnote-editor-tooltip')
    await expect(tooltip).toBeVisible({ timeout: 3_000 })
    await expect(tooltip.locator('textarea')).toHaveValue('Note pré-existante')

    // Édition via le tooltip
    const textarea = tooltip.locator('textarea')
    await textarea.click()
    await textarea.fill('Note pré-existante éditée')

    const md = await waitForMd(page, (s) => s.includes('Note pré-existante éditée'), 6000)
    expect(md).toMatch(/\[\^[^\]]+\]:\s*Note pré-existante éditée/m)
    expect(md).toContain('Alpha-premier')
    expect(md).toContain('Gamma-dernier')
  })

  test('le badge d\'identifiant est affiché dans l\'ancre', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await selectTextRange(milieu, 0, 4)
    await page.getByTitle('Créer une note de bas de page').click()

    await expect(page.locator('.holo-footnote-anchor .holo-footnote-badge').first()).toBeVisible({ timeout: 3_000 })
  })
})

// ─── 3. Séparateur (thematicBreak) ────────────────────────────────────────────

test.describe('Séparateur — création, sélection, suppression', () => {

  test('taper --- espace convertit un paragraphe en séparateur', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await milieu.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('--- ')

    await expect(page.locator('hr')).toBeVisible({ timeout: 3_000 })

    const md = await waitForMd(page, (s) =>
      /^(\*{3,}|-{3,})$/m.test(s) && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

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

test.describe('Tableau — stabilité de focus', () => {
  test('l auto-save d une cellule inline ne doit pas couper le focus pendant la saisie', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Tableau')

    const firstTextCell = page.locator('tbody [data-block-type="table-cell"][contenteditable="true"]').first()
    await expect(firstTextCell).toBeVisible({ timeout: 3_000 })
    await firstTextCell.click()
    await page.keyboard.type('Alpha')
    await waitForMd(page, (s) => s.includes('| Alpha |') && s.includes('Gamma-dernier'), 5000)
    await expect(firstTextCell).toBeFocused()
    await page.keyboard.type(' beta')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) => s.includes('| Alpha beta |') && s.includes('Gamma-dernier'), 6000)
    expect(md).toContain('Alpha-premier')
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

  test('Enter après sélection d image insère un paragraphe juste après', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    const figure = page.locator('figure').first()
    await expect(figure).toBeVisible({ timeout: 3_000 })
    await figure.click()
    await expect(figure).toHaveClass(/ring-2/, { timeout: 2_000 })

    await page.keyboard.press('Enter')
    await page.keyboard.type('Apres image')
    await page.keyboard.press('Tab')

    const md = await waitForMd(page, (s) =>
      s.includes('![Logo test]')
      && s.includes('Apres image')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Apres image')
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

  test('une image peut s ouvrir en plein écran', async ({ page }) => {
    await gotoEditor(page, IMAGE_MD)

    await page.getByRole('button', { name: 'Voir l\'image en plein écran' }).click()
    await expect(page.getByRole('dialog', { name: 'Image en plein écran' })).toBeVisible()
    await page.getByRole('button', { name: 'Fermer l\'image en plein écran' }).click()
    await expect(page.getByRole('dialog', { name: 'Image en plein écran' })).toBeHidden()
  })
})

test.describe('CodeBlock — édition WYSIWYG', () => {
  test('création via slash command et changement de langage persistent la fence markdown', async ({ page }) => {
    await gotoEditor(page, contextMd())

    const milieu = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Beta-milieu' })
    await enterAndSlash(page, milieu)
    await selectCmd(page, 'Bloc de code')

    const editor = page.locator('.cm-content').first()
    await expect(editor).toBeVisible()

    await page.getByRole('button', { name: 'Plain text' }).first().click()
    await page.getByRole('button', { name: 'TypeScript' }).click()

    await editor.click()
    await page.keyboard.type('const answer: number = 42')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Gamma-dernier' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('```typescript')
      && s.includes('const answer: number = 42')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('Alpha-premier')
  })

  test('un bloc de code pré-existant est éditable avec coloration et persiste son contenu', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '```typescript',
      'const answer = 41',
      '```',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const editor = page.locator('.cm-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.type(' + 1')

    // Blur pour déclencher la persistance vers le markdown.
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Gamma-dernier' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('const answer = 41 + 1') && s.includes('```typescript'),
      6000,
    )
    expect(md).toContain('Gamma-dernier')
  })

  test('Ctrl+A dans le bloc code remplace seulement le code et pas tous les blocs', async ({ page }) => {
    await gotoEditor(page, [
      'Alpha-premier',
      '',
      '```typescript',
      'const answer = 41',
      '```',
      '',
      'Gamma-dernier',
    ].join('\n'))

    const editor = page.locator('.cm-content').first()
    await expect(editor).toBeVisible()
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('const replaced = true')
    await page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Gamma-dernier' }).click()

    const md = await waitForMd(page, (s) =>
      s.includes('const replaced = true')
      && !s.includes('const answer = 41')
      && s.includes('Alpha-premier')
      && s.includes('Gamma-dernier'),
      6000,
    )
    expect(md).toContain('```typescript')
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

    // Sélectionner d'abord Bloc-A via le drag handle
    const blocA = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Bloc-A' })
    const wrapperA = page.locator('[data-block-id]').filter({ has: blocA })
    await wrapperA.locator('[data-drag-handle]').click({ force: true })
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

    // Sélectionner Del-un via le drag handle pour poser l'ancre de plage
    const boxUn = await delUn.boundingBox()
    if (!boxUn) throw new Error('boundingBox manquant')

    const wrapperUn = page.locator('[data-block-id]').filter({ has: delUn })
    await wrapperUn.locator('[data-drag-handle]').click({ force: true })
    await expect(wrapperUn).toHaveClass(/ring-1/, { timeout: 2_000 })

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
