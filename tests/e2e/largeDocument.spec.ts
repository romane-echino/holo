/**
 * largeDocument.spec.ts — Réactivité sur un gros document (2 000 blocs)
 *
 * Mesure, seul puis en direct à deux : le délai entre une frappe et l'image
 * suivante (médiane, p95) et la plus longue tâche bloquante (dont
 * l'enregistrement qui suit une pause de saisie). Échoue au-delà de seuils
 * larges : il s'agit de repérer une régression nette, pas de chronométrer.
 *
 * Lancé à la demande : `HOLO_PERF=1 npx playwright test largeDocument`
 * (en direct : runtime Codenotch local avec le projet holo-realtime).
 *
 * Les tests tournent avec React en mode développement, 3 à 4 fois plus lent
 * que l'application installée. Mesures du 4 novembre 2026 (Mac M-series) :
 * - ici : frappe médiane 12-14 ms, p95 ~210 ms ; plus longue tâche 470-630 ms
 *   (l'enregistrement après une pause : rendu de tous les blocs, document
 *   entier converti en markdown) ;
 * - application installée (0.9.2), 2 000 blocs : médiane 12 ms, p95 19 ms,
 *   plus longue tâche 168 ms ; 200 blocs : aucune tâche de plus de 50 ms.
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

const ENABLED = Boolean(process.env.HOLO_PERF)
const DOCUMENT = 'Gros.md'
// Seuils pour le mode développement (voir ci-dessus), avec de la marge.
const KEYSTROKE_P95_MAX_MS = 400
const LONG_TASK_MAX_MS = 1500

/** ~2 000 blocs : paragraphes, titres, listes, tableaux. */
function largeDocument(): string {
  const parts: string[] = ['# Gros document', '']
  for (let section = 1; section <= 100; section += 1) {
    parts.push(`## Section ${section}`, '')
    for (let index = 1; index <= 16; index += 1) parts.push(`Paragraphe ${section}.${index} avec du **gras**, un [lien](https://echino.com) et du texte ordinaire pour la longueur.`, '')
    parts.push(`- Point ${section}.a`, `- Point ${section}.b`, `- [ ] Tâche ${section}`, '')
    if (section % 2 === 0) parts.push('| Poste | Montant |', '| --- | --- |', `| Ligne ${section} | ${section * 10} |`, `| Autre ${section} | ${section * 3} |`, '')
  }
  parts.push('Para final.', '')
  return parts.join('\n')
}

type Measures = { openMs: number; keystrokeP50: number; keystrokeP95: number; longestTaskMs: number }

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0)
}

/** Tape au milieu du document et mesure. */
async function measureTyping(page: Page): Promise<Omit<Measures, 'openMs'>> {
  const field = page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Paragraphe 50.8 ' })
  await field.scrollIntoViewIfNeeded()
  await field.click()
  await page.keyboard.press('End')
  await page.evaluate(() => {
    const state = { latencies: [] as number[], longest: 0 }
    ;(window as unknown as { __perf: typeof state }).__perf = state
    document.addEventListener('keydown', () => {
      const start = performance.now()
      requestAnimationFrame(() => setTimeout(() => state.latencies.push(performance.now() - start), 0))
    }, true)
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.longest = Math.max(state.longest, entry.duration)
    }).observe({ type: 'longtask', buffered: false })
  })
  // Trois rafales séparées par une pause : chaque pause déclenche l'enregistrement.
  for (let burst = 0; burst < 3; burst += 1) {
    await page.keyboard.type(` rafale${burst} abcdefghij`, { delay: 35 })
    await page.waitForTimeout(1_200)
  }
  const state = await page.evaluate(() => (window as unknown as { __perf: { latencies: number[]; longest: number } }).__perf)
  return { keystrokeP50: percentile(state.latencies, 0.5), keystrokeP95: percentile(state.latencies, 0.95), longestTaskMs: Math.round(state.longest) }
}

async function open(root: string, person: string, relayUrl?: string): Promise<{ launched: Launched; openMs: number }> {
  const started = Date.now()
  const launched = await launchHolo(root, path.join(root, DOCUMENT), person, `${person}@example.com`, { relayUrl })
  await expect(launched.page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'Para final.' })).toBeAttached({ timeout: 60_000 })
  return { launched, openMs: Date.now() - started }
}

test.describe('Gros document', () => {
  test.setTimeout(300_000)

  test('2 000 blocs : frappe et enregistrement restent réactifs, seul puis en direct', async () => {
    test.skip(!ENABLED, 'Mesure lancée à la demande (HOLO_PERF=1)')
    const live = await relayAvailable()
    const repository = await setupSharedRepository(['alice', 'bob'], { [DOCUMENT]: largeDocument() })
    const launched: Launched[] = []
    const results: Record<string, Measures> = {}
    try {
      // Seul : temps réel désactivé (adresse de relais injoignable).
      const solo = await open(repository.clones.alice, 'alice', 'http://127.0.0.1:9/holo-realtime')
      launched.push(solo.launched)
      results.seul = { openMs: solo.openMs, ...(await measureTyping(solo.launched.page)) }
      await solo.launched.app.close()
      launched.pop()

      if (live) {
        const alice = await open(repository.clones.alice, 'alice')
        launched.push(alice.launched)
        const bob = await open(repository.clones.bob, 'bob')
        launched.push(bob.launched)
        for (const instance of [alice, bob]) {
          await expect(instance.launched.page.getByTestId('realtime-presence').first()).toHaveAttribute('data-status', 'live', { timeout: 60_000 })
        }
        results['en direct'] = { openMs: alice.openMs, ...(await measureTyping(alice.launched.page)) }
        await expect(bob.launched.page.locator('[data-block-type="paragraph"][contenteditable]').filter({ hasText: 'rafale2 abcdefghij' })).toBeVisible({ timeout: 30_000 })
      }
      for (const [label, measures] of Object.entries(results)) {
        console.log(`[perf] ${label} : ouverture ${measures.openMs} ms ; frappe médiane ${measures.keystrokeP50} ms, p95 ${measures.keystrokeP95} ms ; plus longue tâche ${measures.longestTaskMs} ms`)
      }
      for (const measures of Object.values(results)) {
        expect(measures.keystrokeP95).toBeLessThan(KEYSTROKE_P95_MAX_MS)
        expect(measures.longestTaskMs).toBeLessThan(LONG_TASK_MAX_MS)
      }
    } finally {
      for (const instance of launched) await instance.app.close().catch(() => {})
      await repository.cleanup()
    }
  })
})
