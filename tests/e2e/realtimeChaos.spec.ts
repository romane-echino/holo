/**
 * realtimeChaos.spec.ts — Trois personnes, actions au hasard, réseau coupé, plantage
 *
 * Trois instances Holo (Alice, Bob, Chloé) sur un même document en direct
 * agissent au hasard pendant HOLO_CHAOS_SECONDS (90 s par défaut) :
 * saisie en fin de paragraphe, nouveau paragraphe, cellule de tableau, élément
 * de liste, suppression de ses propres mots, annuler puis rétablir.
 * Pendant ce temps :
 * - Bob perd régulièrement l'accès au relais (8 à 15 s) et continue de taper ;
 * - Holo de Chloé est tué en pleine session (SIGKILL), puis relancé.
 *
 * Chaque mot tapé est un jeton unique. À la fin : les trois documents sont
 * identiques, chaque jeton est présent exactement une fois (ni perdu ni
 * dupliqué), les jetons supprimés ont disparu. Seuls les jetons tapés dans la
 * seconde qui précède le plantage peuvent manquer.
 *
 * Lancé à la demande : `HOLO_CHAOS_SECONDS=90 npx playwright test realtimeChaos`
 * (graine fixe, modifiable avec HOLO_CHAOS_SEED). Nécessite un runtime
 * Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`).
 */
import { test, expect, type Page, type Locator } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { launchHolo, relayAvailable, setRelayReachable, setupSharedRepository, type Launched } from './support/realtimeHarness'

// Test long, lancé à la demande : HOLO_CHAOS_SECONDS=90 npx playwright test realtimeChaos
const CHAOS_ENABLED = Boolean(process.env.HOLO_CHAOS_SECONDS)
const DURATION_MS = Number(process.env.HOLO_CHAOS_SECONDS ?? 90) * 1000
const SEED = Number(process.env.HOLO_CHAOS_SEED ?? 20261103)
const DOCUMENT = 'Chaos.md'
const INITIAL = [
  '# Chaos',
  '',
  'Para un.',
  '',
  'Para deux.',
  '',
  'Para trois.',
  '',
  '| A | B | C |',
  '| --- | --- | --- |',
  '|  |  |  |',
  '|  |  |  |',
  '',
  '- Item un',
  '- Item deux',
  '',
  'Para fin.',
  '',
].join('\n')

type Person = 'alice' | 'bob' | 'chloe'
const PEOPLE: Person[] = ['alice', 'bob', 'chloe']
const NAMES: Record<Person, string> = { alice: 'Alice Martin', bob: 'Bob Keller', chloe: 'Chloé Durand' }
const PREFIX: Record<Person, string> = { alice: 'al', bob: 'bo', chloe: 'ch' }

function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

type Ledger = {
  typed: Map<string, number>
  /** Action qui a tapé chaque jeton (diagnostic) */
  origin: Map<string, string>
  deleted: Set<string>
  /** Saisie interrompue (plantage, action échouée) : peut manquer */
  uncertain: Set<string>
  actions: Record<string, number>
}

/** Curseur à la fin de l'élément éditable (un clic au milieu d'un long paragraphe couperait un mot). */
async function focusEnd(page: Page, locator: Locator) {
  await locator.click({ timeout: 5_000 })
  // Annule la sélection de tout le contenu au clic dans une cellule.
  await page.keyboard.press('ArrowRight')
  await locator.evaluate((element) => {
    const editable = (element.matches('[contenteditable="true"]') ? element : element.querySelector('[contenteditable="true"]')) as HTMLElement | null
    const target = editable ?? (element as HTMLElement)
    target.focus()
    const range = document.createRange()
    range.selectNodeContents(target)
    range.collapse(false)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
  }, undefined, { timeout: 5_000 })
}

/** Journal de session (jonctions, redémarrages) de chaque instance, joint au rapport. */
function captureSessionLogs(page: Page, person: Person, log: string[]) {
  void page.evaluate(() => { (globalThis as { __HOLO_RT_DEBUG__?: boolean }).__HOLO_RT_DEBUG__ = true }).catch(() => undefined)
  page.on('console', (message) => {
    if (message.text().includes('[holo-realtime]')) log.push(`${person} : ${message.text()}`)
  })
}

async function pick(locator: Locator, next: () => number): Promise<Locator | null> {
  const count = await locator.count()
  if (count === 0) return null
  return locator.nth(Math.floor(next() * count))
}

/** Sélectionne un jeton dans le document et le supprime. */
async function deleteToken(page: Page, token: string): Promise<boolean> {
  const selected = await page.evaluate((target) => {
    for (const editable of Array.from(document.querySelectorAll<HTMLElement>('[contenteditable="true"]'))) {
      const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.textContent?.indexOf(target) ?? -1
        if (index === -1) continue
        editable.focus()
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + target.length)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
        return true
      }
    }
    return false
  }, token)
  if (!selected) return false
  await page.keyboard.press('Backspace')
  return true
}

async function act(page: Page, person: Person, ledger: Ledger, next: () => number, counter: { value: number }) {
  const token = () => `${PREFIX[person]}${++counter.value}q`
  const typeToken = async (value: string, leadingSpace = true) => {
    ledger.typed.set(value, Date.now())
    try {
      await page.keyboard.type(`${leadingSpace ? ' ' : ''}${value}`, { delay: 15 + Math.floor(next() * 30) })
    } catch (error) {
      ledger.uncertain.add(value)
      throw error
    }
  }
  const roll = next()
  const count = (name: string) => {
    ledger.actions[name] = (ledger.actions[name] ?? 0) + 1
    const last = [...ledger.typed.keys()].pop()
    if (last && !ledger.origin.has(last)) ledger.origin.set(last, name)
    else if (last && name === 'annuler-rétablir') ledger.origin.set(last, `${ledger.origin.get(last)} + annuler-rétablir`)
  }
  const paragraphs = page.locator('[data-block-type="paragraph"][contenteditable]')
  if (roll < 0.28) {
    const target = await pick(paragraphs, next)
    if (!target) return
    await focusEnd(page, target)
    await typeToken(token())
    count('paragraphe')
    if (next() < 0.25) {
      // Annuler puis rétablir : effet nul attendu.
      await page.keyboard.press('ControlOrMeta+z')
      await page.waitForTimeout(150)
      await page.keyboard.press('ControlOrMeta+Shift+z')
      count('annuler-rétablir')
    }
  } else if (roll < 0.43) {
    const target = await pick(paragraphs, next)
    if (!target) return
    await focusEnd(page, target)
    await page.keyboard.press('Enter')
    await typeToken(token(), false)
    count('nouveau paragraphe')
  } else if (roll < 0.63) {
    const target = await pick(page.locator('table td[data-table-cell-key] [contenteditable="true"]'), next)
    if (!target) return
    await focusEnd(page, target)
    await typeToken(token())
    count('cellule')
  } else if (roll < 0.8) {
    const target = await pick(page.locator('[data-list-text]'), next)
    if (!target) return
    await focusEnd(page, target)
    await typeToken(token())
    count('liste')
  } else {
    const candidates = [...ledger.typed.keys()].filter((value) => !ledger.deleted.has(value) && !ledger.uncertain.has(value))
    if (candidates.length === 0) return
    const victim = candidates[Math.floor(next() * candidates.length)]
    if (await deleteToken(page, victim)) {
      ledger.deleted.add(victim)
      count('suppression')
    }
  }
}

test.describe('Chaos à trois en direct (relais Codenotch)', () => {
  test.setTimeout(DURATION_MS + 300_000)

  test('actions au hasard, coupures réseau et plantage : rien de perdu, rien de dupliqué', async () => {
    test.skip(!CHAOS_ENABLED, 'Test de chaos lancé à la demande (HOLO_CHAOS_SECONDS)')
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const repository = await setupSharedRepository([...PEOPLE], { [DOCUMENT]: INITIAL })
    const launched: Partial<Record<Person, Launched>> = {}
    const ledgers: Record<Person, Ledger> = Object.fromEntries(PEOPLE.map((person) => [person, { typed: new Map(), origin: new Map(), deleted: new Set(), uncertain: new Set(), actions: {} }])) as Record<Person, Ledger>
    const log: string[] = []
    try {
      for (const person of PEOPLE) {
        const root = repository.clones[person]
        launched[person] = await launchHolo(root, path.join(root, DOCUMENT), NAMES[person], `${person}@example.com`)
        captureSessionLogs(launched[person]!.page, person, log)
        await expect(launched[person]!.page.getByTestId('realtime-presence').first()).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
      }

      const deadline = Date.now() + DURATION_MS
      let crashing = false
      const counters: Record<Person, { value: number }> = { alice: { value: 0 }, bob: { value: 0 }, chloe: { value: 0 } }
      const workers = PEOPLE.map(async (person, index) => {
        const next = random(SEED + index * 7919)
        while (Date.now() < deadline) {
          if (person === 'chloe' && crashing) {
            await new Promise((resolve) => setTimeout(resolve, 200))
            continue
          }
          const page = launched[person]!.page
          try {
            await act(page, person, ledgers[person], next, counters[person])
          } catch (error) {
            if (!(person === 'chloe' && crashing)) log.push(`${person} : action échouée (${String(error).split('\n')[0]})`)
          }
          await page.waitForTimeout(200 + Math.floor(next() * 400)).catch(() => undefined)
        }
      })

      // Bob perd régulièrement le relais et continue de taper hors ligne.
      const network = (async () => {
        const next = random(SEED + 101)
        while (Date.now() < deadline - 20_000) {
          await new Promise((resolve) => setTimeout(resolve, 12_000 + next() * 10_000))
          if (Date.now() > deadline - 20_000) break
          const offline = 8_000 + next() * 7_000
          log.push(`bob hors ligne ${Math.round(offline / 1000)} s`)
          await setRelayReachable(launched.bob!, false).catch((error) => log.push(`coupure impossible : ${error}`))
          await new Promise((resolve) => setTimeout(resolve, offline))
          await setRelayReachable(launched.bob!, true).catch((error) => log.push(`rétablissement impossible : ${error}`))
        }
      })()

      // Holo de Chloé est tué au milieu de la session, puis relancé.
      const crash = (async () => {
        await new Promise((resolve) => setTimeout(resolve, DURATION_MS * 0.45))
        crashing = true
        const crashedAt = Date.now()
        const chloe = launched.chloe!
        chloe.app.process().kill('SIGKILL')
        // Ce qui a été tapé dans les 1,5 s précédentes a pu ne pas partir.
        for (const [value, at] of ledgers.chloe.typed) if (crashedAt - at < 1_500) ledgers.chloe.uncertain.add(value)
        log.push(`chloé plantée (${ledgers.chloe.uncertain.size} jeton(s) incertain(s))`)
        await new Promise((resolve) => setTimeout(resolve, 3_000))
        const root = repository.clones.chloe
        launched.chloe = await launchHolo(root, path.join(root, DOCUMENT), NAMES.chloe, 'chloe@example.com', { configHome: chloe.configHome })
        captureSessionLogs(launched.chloe.page, 'chloe', log)
        await expect(launched.chloe.page.getByTestId('realtime-presence').first()).toHaveAttribute('data-status', 'live', { timeout: 30_000 })
        log.push('chloé relancée')
        crashing = false
      })()

      // Surveillance : photographie des trois fichiers, pour retrouver le moment
      // exact où une structure (le tableau) est cassée.
      const snapshots: Record<Person, Array<{ at: number; content: string }>> = { alice: [], bob: [], chloe: [] }
      let monitoring = true
      const monitor = (async () => {
        while (monitoring) {
          for (const person of PEOPLE) {
            const content = await fs.readFile(path.join(repository.clones[person], DOCUMENT), 'utf8').catch(() => null)
            const list = snapshots[person]
            if (content !== null && list[list.length - 1]?.content !== content) list.push({ at: Date.now(), content })
          }
          await new Promise((resolve) => setTimeout(resolve, 300))
        }
      })()
      const startedAt = Date.now()

      await Promise.all([...workers, network, crash])
      monitoring = false
      await monitor
      for (const person of PEOPLE) {
        const list = snapshots[person]
        const broken = list.findIndex((entry) => !/^\| A \| B \| C \|$/m.test(entry.content))
        if (broken > 0) {
          log.push(`tableau cassé chez ${person} à ${Math.round((list[broken].at - startedAt) / 1000)} s :\n--- avant ---\n${list[broken - 1].content}\n--- après ---\n${list[broken].content}`)
          break
        }
      }
      await setRelayReachable(launched.bob!, true).catch(() => undefined)

      // Convergence des trois documents sur disque.
      const readDocument = (person: Person) => fs.readFile(path.join(repository.clones[person], DOCUMENT), 'utf8')
      await expect.poll(async () => {
        const contents = await Promise.all(PEOPLE.map(readDocument))
        return contents.every((content) => content === contents[0])
      }, { timeout: 60_000, intervals: [2_000] }).toBe(true)
      const final = await readDocument('alice')

      const problems: string[] = []
      for (const person of PEOPLE) {
        const ledger = ledgers[person]
        for (const value of ledger.typed.keys()) {
          const occurrences = final.split(value).length - 1
          if (ledger.deleted.has(value)) {
            if (occurrences !== 0) problems.push(`${value} supprimé mais encore présent (${occurrences})`)
          } else if (ledger.uncertain.has(value)) {
            if (occurrences > 1) problems.push(`${value} dupliqué (${occurrences})`)
          } else if (occurrences !== 1) {
            problems.push(`${value} ${occurrences === 0 ? 'perdu' : `dupliqué (${occurrences})`} [${ledger.origin.get(value) ?? '?'}]`)
          }
        }
      }
      // Pour chaque jeton perdu : le moment où il a disparu du fichier d'Alice (ligne avant / après).
      for (const problem of problems.slice(0, 8)) {
        const value = problem.split(' ')[0]
        for (const person of PEOPLE) {
          const list = snapshots[person]
          const last = list.map((entry) => entry.content.includes(value)).lastIndexOf(true)
          if (last === -1 || last === list.length - 1) continue
          const lineBefore = list[last].content.split('\n').find((line) => line.includes(value)) ?? ''
          const anchor = lineBefore.split(value)[0].trim().split(/\s+/).slice(-2).join(' ')
          const lineAfter = list[last + 1].content.split('\n').find((line) => anchor && line.includes(anchor)) ?? '(ligne introuvable)'
          log.push(`${value} disparu chez ${person} à ${Math.round((list[last + 1].at - startedAt) / 1000)} s\n  avant : ${lineBefore}\n  après : ${lineAfter}`)
          break
        }
      }
      // Suppressions locales qui ont emporté un jeton perdu (et qui ne sont pas celles de son auteur).
      const lostTokens = problems.map((problem) => problem.split(' ')[0])
      // Parcours détaillé des deux premiers jetons perdus (émis par l'éditeur, envoyés, retirés…).
      for (const value of lostTokens.slice(0, 2)) {
        const stem = value.slice(0, -1)
        const trail = log.filter((line) => line.includes(stem) && /éditeur émet|envoi|version reçue retire|saisie enregistrée|bloc redessiné/.test(line))
        log.push(`── parcours de ${value} ──`, ...trail.slice(0, 25).map((line) => `  ${line.slice(0, 300)}`))
      }
      // Dans ce test, une suppression normale retire exactement un jeton de son auteur ;
      // toute autre suppression est suspecte.
      const relevant = log.filter((line) => {
        if (line.startsWith('  ')) return true
        if (/éditeur émet|\] envoi |saisie enregistrée|bloc redessiné/.test(line)) return false
        if (line.includes('version reçue retire')) {
          // Normal : la suppression d'un jeton par son auteur. Suspect : tout le reste.
          const removed = /"removed":"((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? ''
          return lostTokens.some((value) => removed.includes(value.slice(0, 3)) && (removed.includes(value) || value.startsWith(removed.trim())))
            || /(al|bo|ch)\d+(?!\d*q)/.test(removed)
        }
        if (!line.includes('suppression locale')) return true
        const author = line.split(' : ')[0] as Person
        const removed = /"removed":"((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? ''
        const inserted = /"inserted":"((?:[^"\\]|\\.)*)"/.exec(line)?.[1] ?? ''
        const ownWholeToken = new RegExp(`^${PREFIX[author]}\\d+q$`).test(removed) && inserted === ''
        const typingOverSpace = /^\s*$/.test(removed) && inserted.trim().startsWith(PREFIX[author])
        return !ownWholeToken && !typingOverSpace
      })
      log.length = 0
      log.push(...relevant)
      const summary = PEOPLE.map((person) => `${person} : ${ledgers[person].typed.size} jetons, ${JSON.stringify(ledgers[person].actions)}`).join('\n')
      console.log(`Chaos ${DURATION_MS / 1000} s, graine ${SEED}\n${summary}\n${log.join('\n')}`)
      expect(problems, `${problems.join('\n')}\n\n${summary}\n${log.join('\n')}\n\n${final}`).toEqual([])
      expect(final).toContain('# Chaos')

      for (const person of PEOPLE) {
        const page = launched[person]!.page
        await expect(page.getByText('se chevauchent'), `bandeau chez ${person}`).toHaveCount(0)
        await expect(page.getByText('Conflit'), `bandeau chez ${person}`).toHaveCount(0)
      }
    } finally {
      for (const person of PEOPLE) await launched[person]?.app.close().catch(() => {})
      await repository.cleanup()
      for (const person of PEOPLE) {
        if (launched[person]) await fs.rm(launched[person]!.configHome, { recursive: true, force: true }).catch(() => {})
      }
    }
  })
})
