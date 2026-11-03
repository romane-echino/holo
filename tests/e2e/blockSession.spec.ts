/**
 * blockSession.spec.ts — Session temps réel sur le modèle par blocs, contre un
 * relais simulé
 *
 * Trois éditeurs simulés travaillent sur un document complet (titres,
 * paragraphes, tableau, listes) : saisie dans les paragraphes, les cellules et
 * les éléments de liste, ajout de blocs, de lignes et d'éléments, déplacement
 * de blocs, tri du tableau, changement de niveau, suppression de ses propres
 * mots ; avec coupures réseau et plantages suivis d'une relance à partir d'un
 * fichier un peu en retard. Chaque mot tapé est un jeton unique.
 *
 * À la fin : documents identiques, chaque jeton exactement une fois, jetons
 * supprimés absents, structures intactes (un tableau, des listes).
 */
import { test, expect } from '@playwright/test'
import { BlockSession } from '../../src/lib/realtime/blockSession'
import type { SharedListBlock, SharedSnapshot, SharedTableBlock, SharedTextBlock } from '../../src/lib/realtime/sharedModel'
import { alignSnapshotIds, markdownToSnapshot, snapshotToMarkdown } from '../../src/parts/MarkdownEditor/lib/sharedSnapshot'
import { FakeRelay, createRandom, sleep, waitFor, type FakeConnection } from './support/fakeRelay'

const DOCUMENT_ID = '00000000-0000-5000-8000-0000000000b2'
const KEY = Buffer.alloc(32, 9).toString('base64')

const INITIAL = [
  '# Compte rendu',
  '',
  'Introduction.',
  '',
  '| Sujet | Responsable | Statut |',
  '| --- | --- | --- |',
  '| Budget | | |',
  '| Recrutement | | |',
  '',
  '- Point un',
  '- Point deux',
  '',
  '- [ ] Tâche',
  '',
  'Conclusion.',
  '',
].join('\n')

/** uncertain : saisie ou suppression qui a pu ne pas partir (plantage juste après) */
type Ledger = { typed: Set<string>; deleted: Set<string>; uncertain: Set<string> }

class SimulatedBlockEditor {
  snapshot: SharedSnapshot
  status: string | null = null
  fileModifiedAt = 0
  readonly connection: FakeConnection
  readonly session: BlockSession
  readonly name: string

  constructor(relay: FakeRelay, name: string, markdown: string, upstream: string | null = INITIAL) {
    this.name = name
    this.snapshot = markdownToSnapshot(markdown)
    this.connection = relay.connect(name)
    this.session = new BlockSession(
      this.connection,
      { documentId: DOCUMENT_ID, key: KEY },
      { name, email: `${name}@example.com`, color: '#888' },
      {
        getEditorSnapshot: () => this.snapshot,
        applyRemoteSnapshot: (snapshot) => { this.snapshot = snapshot },
        flushLocalEdits: async () => {},
        getUpstreamSnapshot: async () => (upstream === null ? null : markdownToSnapshot(upstream)),
        alignIds: alignSnapshotIds,
        getLocalModifiedAt: async () => this.fileModifiedAt || null,
        onPeers: () => {},
        onStatus: (status) => { this.status = status },
      },
    )
  }

  start() {
    return this.session.start()
  }

  edit(change: (draft: SharedSnapshot) => void) {
    const draft = structuredClone(this.snapshot)
    change(draft)
    this.snapshot = draft
    this.fileModifiedAt = Date.now()
    this.session.onLocalSnapshot(draft)
  }
}

const textBlocks = (snapshot: SharedSnapshot) => snapshot.blocks.filter((block): block is SharedTextBlock => block.kind === 'text')
const tables = (snapshot: SharedSnapshot) => snapshot.blocks.filter((block): block is SharedTableBlock => block.kind === 'table')
const lists = (snapshot: SharedSnapshot) => snapshot.blocks.filter((block): block is SharedListBlock => block.kind === 'list')

/** Une action au hasard ; renvoie le jeton tapé, s'il y en a un. */
function randomAction(editor: SimulatedBlockEditor, ledger: Ledger, random: ReturnType<typeof createRandom>, counter: { value: number }) {
  const token = () => `${editor.name.slice(0, 2)}${++counter.value}q`
  const roll = random.next()
  if (roll < 0.25) {
    const value = token()
    editor.edit((draft) => {
      const block = random.pick(textBlocks(draft))
      block.md = `${block.md} ${value}`.trimStart()
    })
    ledger.typed.add(value)
  } else if (roll < 0.43) {
    const value = token()
    editor.edit((draft) => {
      const table = tables(draft)[0]
      const row = random.pick(table.rows)
      const column = random.pick(table.columns)
      row.cells[column.id] = `${row.cells[column.id] ?? ''} ${value}`.trimStart()
    })
    ledger.typed.add(value)
  } else if (roll < 0.58) {
    const value = token()
    editor.edit((draft) => {
      const list = random.pick(lists(draft))
      const item = random.pick(list.items)
      item.text = `${item.text} ${value}`.trimStart()
    })
    ledger.typed.add(value)
  } else if (roll < 0.66) {
    const value = token()
    editor.edit((draft) => {
      const at = random.int(draft.blocks.length + 1)
      draft.blocks.splice(at, 0, { id: `b-${crypto.randomUUID()}`, kind: 'text', md: value })
    })
    ledger.typed.add(value)
  } else if (roll < 0.71) {
    const value = token()
    editor.edit((draft) => {
      const table = tables(draft)[0]
      const cells = Object.fromEntries(table.columns.map((column, index) => [column.id, index === 0 ? value : '']))
      table.rows.splice(random.int(table.rows.length + 1), 0, { id: `r-${crypto.randomUUID()}`, cells })
    })
    ledger.typed.add(value)
  } else if (roll < 0.76) {
    const value = token()
    editor.edit((draft) => {
      const list = random.pick(lists(draft))
      list.items.splice(random.int(list.items.length + 1), 0, { id: `i-${crypto.randomUUID()}`, text: value, depth: 0, checked: list.items[0]?.checked === null ? null : false })
    })
    ledger.typed.add(value)
  } else if (roll < 0.82) {
    editor.edit((draft) => {
      const from = random.int(draft.blocks.length)
      const [moved] = draft.blocks.splice(from, 1)
      draft.blocks.splice(random.int(draft.blocks.length + 1), 0, moved)
    })
  } else if (roll < 0.85) {
    editor.edit((draft) => { tables(draft)[0].rows.reverse() })
  } else if (roll < 0.88) {
    editor.edit((draft) => {
      const list = random.pick(lists(draft))
      const index = random.int(list.items.length)
      if (index > 0) list.items[index].depth = list.items[index].depth === 0 ? 1 : 0
    })
  } else {
    // Suppression d'un de ses propres mots, là où il se trouve.
    const candidates = [...ledger.typed].filter((value) => !ledger.deleted.has(value) && !ledger.uncertain.has(value))
    if (candidates.length === 0) return
    const victim = random.pick(candidates)
    let removed = false
    editor.edit((draft) => {
      const strip = (text: string) => {
        if (!text.includes(victim)) return text
        removed = true
        return text.replace(new RegExp(` ?${victim}`), '')
      }
      for (const block of draft.blocks) {
        if (block.kind === 'text') block.md = strip(block.md)
        else if (block.kind === 'table') for (const row of block.rows) for (const key of Object.keys(row.cells)) row.cells[key] = strip(row.cells[key])
        else for (const item of block.items) item.text = strip(item.text)
      }
    })
    if (removed) ledger.deleted.add(victim)
  }
}

async function waitConverged(editors: SimulatedBlockEditor[], timeoutMs = 30_000) {
  let stableSince = 0
  let previous = ''
  await waitFor(() => {
    const documents = editors.map((editor) => snapshotToMarkdown(editor.snapshot))
    if (!documents.every((document) => document === documents[0])) { stableSince = 0; return false }
    if (documents[0] !== previous) { previous = documents[0]; stableSince = Date.now(); return false }
    return Date.now() - stableSince > 500
  }, timeoutMs, 'convergence')
  return snapshotToMarkdown(editors[0].snapshot)
}

function checkTokens(final: string, ledgers: Ledger[]): string[] {
  const problems: string[] = []
  for (const ledger of ledgers) {
    for (const value of ledger.typed) {
      const count = final.split(value).length - 1
      if (ledger.deleted.has(value)) { if (count > (ledger.uncertain.has(value) ? 1 : 0)) problems.push(`${value} supprimé mais présent (${count})`) }
      else if (ledger.uncertain.has(value)) { if (count > 1) problems.push(`${value} dupliqué (${count})`) }
      else if (count !== 1) problems.push(`${value} ${count === 0 ? 'perdu' : `dupliqué (${count})`}`)
    }
  }
  return problems
}

test.describe.configure({ mode: 'serial' })

test.describe('BlockSession contre un relais simulé', () => {
  test.setTimeout(180_000)

  test('trois éditeurs, actions au hasard : convergence, rien de perdu ni dupliqué', async () => {
    for (const seed of [1, 2, 3]) {
      const relay = new FakeRelay(seed)
      const editors = ['alice', 'bob', 'chloe'].map((name) => new SimulatedBlockEditor(relay, name, INITIAL))
      for (const editor of editors) {
        await editor.start()
        await waitFor(() => editor.status === 'live', 15_000, `${editor.name} en direct`)
      }
      const ledgers = editors.map((): Ledger => ({ typed: new Set(), deleted: new Set(), uncertain: new Set() }))
      await Promise.all(editors.map(async (editor, index) => {
        const random = createRandom(seed * 100 + index)
        const counter = { value: 0 }
        for (let step = 0; step < 120; step += 1) {
          randomAction(editor, ledgers[index], random, counter)
          await sleep(random.int(25))
        }
      }))
      const final = await waitConverged(editors)
      expect(checkTokens(final, ledgers), `graine ${seed}\n${final}`).toEqual([])
      expect(tables(editors[0].snapshot)).toHaveLength(1)
      expect(lists(editors[0].snapshot)).toHaveLength(lists(markdownToSnapshot(INITIAL)).length)
      for (const editor of editors) await editor.session.stop()
    }
  })

  test('coupures réseau et plantage avec relance depuis un fichier en retard', async () => {
    for (const seed of [11, 12]) {
      const relay = new FakeRelay(seed)
      const editors = ['alice', 'bob', 'chloe'].map((name) => new SimulatedBlockEditor(relay, name, INITIAL))
      for (const editor of editors) {
        await editor.start()
        await waitFor(() => editor.status === 'live', 15_000, `${editor.name} en direct`)
      }
      const ledgers = editors.map((): Ledger => ({ typed: new Set(), deleted: new Set(), uncertain: new Set() }))
      const random = createRandom(seed)
      let crashing = false
      const workers = editors.map(async (_editor, index) => {
        const local = createRandom(seed * 100 + index)
        const counter = { value: 0 }
        for (let step = 0; step < 150; step += 1) {
          const editor = editors[index]
          if (!(index === 2 && crashing)) randomAction(editor, ledgers[index], local, counter)
          await sleep(local.int(30))
        }
      })
      // Bob coupé du réseau par intermittence (il continue de taper).
      const network = (async () => {
        for (let cut = 0; cut < 3; cut += 1) {
          await sleep(300 + random.int(400))
          editors[1].connection.disconnect()
          await sleep(300 + random.int(500))
          editors[1].connection.reconnect()
        }
      })()
      // Chloé plante, puis relance depuis un fichier écrit un peu avant.
      const crash = (async () => {
        await sleep(1200)
        const staleFile = snapshotToMarkdown(editors[2].snapshot)
        await sleep(150)
        crashing = true
        const crashed = editors[2]
        crashed.connection.crash()
        // Ce qui a été tapé ou supprimé avant le plantage a pu ne pas partir.
        for (const value of ledgers[2].typed) ledgers[2].uncertain.add(value)
        await sleep(200)
        const relaunched = new SimulatedBlockEditor(relay, 'chloe', staleFile)
        relaunched.fileModifiedAt = Date.now() - 2_000
        editors[2] = relaunched
        await relaunched.start()
        await waitFor(() => relaunched.status === 'live', 15_000, 'chloé relancée en direct')
        // Seuls les jetons tapés juste avant le plantage pouvaient manquer.
        for (const value of [...ledgers[2].uncertain]) {
          const present = snapshotToMarkdown(relaunched.snapshot).includes(value)
          // Arrivé (ou suppression arrivée) avant le plantage : de nouveau certain.
          if (present !== ledgers[2].deleted.has(value)) ledgers[2].uncertain.delete(value)
        }
        crashing = false
      })()
      await Promise.all([...workers, network, crash])
      const final = await waitConverged(editors)
      expect(checkTokens(final, ledgers), `graine ${seed}\n${final}`).toEqual([])
      expect(tables(editors[0].snapshot)).toHaveLength(1)
      for (const editor of editors) await editor.session.stop()
    }
  })

  test('annuler n annule que ses propres modifications', async () => {
    const relay = new FakeRelay(21)
    const [alice, bob] = ['alice', 'bob'].map((name) => new SimulatedBlockEditor(relay, name, INITIAL))
    for (const editor of [alice, bob]) {
      await editor.start()
      await waitFor(() => editor.status === 'live', 15_000, `${editor.name} en direct`)
    }
    alice.edit((draft) => { textBlocks(draft).find((block) => block.md === 'Introduction.')!.md = 'Introduction. Alice.' })
    await sleep(200)
    bob.edit((draft) => { const table = tables(draft)[0]; table.rows[0].cells[table.columns[1].id] = 'Bob' })
    await waitConverged([alice, bob])
    alice.session.undo()
    const final = await waitConverged([alice, bob])
    expect(final).not.toContain('Introduction. Alice.')
    expect(final).toContain('| Budget | Bob |')
    for (const editor of [alice, bob]) await editor.session.stop()
  })

  test('arrivée en cours de session : modifications faites hors session fusionnées bloc par bloc', async () => {
    const relay = new FakeRelay(31)
    const alice = new SimulatedBlockEditor(relay, 'alice', INITIAL)
    await alice.start()
    await waitFor(() => alice.status === 'live', 15_000, 'alice en direct')
    alice.edit((draft) => { textBlocks(draft).find((block) => block.md === 'Introduction.')!.md = 'Introduction en session.' })
    await sleep(300)
    // Bob a modifié son fichier hors session (une cellule et la conclusion).
    const offline = INITIAL.replace('| Budget | | |', '| Budget | Bob | |').replace('Conclusion.', 'Conclusion révisée.')
    const bob = new SimulatedBlockEditor(relay, 'bob', offline, INITIAL)
    await bob.start()
    await waitFor(() => bob.status === 'live', 15_000, 'bob en direct')
    const final = await waitConverged([alice, bob])
    expect(final).toContain('Introduction en session.')
    expect(final).toContain('| Budget | Bob |')
    expect(final).toContain('Conclusion révisée.')
    expect(final.split('Budget').length - 1).toBe(1)
    for (const editor of [alice, bob]) await editor.session.stop()
  })
})
