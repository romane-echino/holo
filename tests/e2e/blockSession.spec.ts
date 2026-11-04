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
import * as Y from 'yjs'
import { BlockSession } from '../../src/lib/realtime/blockSession'
import { PayloadCipher } from '../../src/lib/realtime/encoding'
import { applySnapshot, readSnapshot, type SharedListBlock, type SharedSnapshot, type SharedTableBlock, type SharedTextBlock } from '../../src/lib/realtime/sharedModel'
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
  upstream: string | null
  status: string | null = null
  peers = 0
  fileModifiedAt = 0
  readonly connection: FakeConnection
  readonly session: BlockSession
  readonly name: string

  constructor(relay: FakeRelay, name: string, markdown: string, upstream: string | null = INITIAL, key = KEY) {
    this.name = name
    this.snapshot = markdownToSnapshot(markdown)
    this.upstream = upstream
    this.connection = relay.connect(name)
    this.session = new BlockSession(
      this.connection,
      { documentId: DOCUMENT_ID, key },
      { name, email: `${name}@example.com`, color: '#888' },
      {
        getEditorSnapshot: () => this.snapshot,
        applyRemoteSnapshot: (snapshot) => { this.snapshot = snapshot },
        flushLocalEdits: async () => {},
        getUpstreamSnapshot: async () => (this.upstream === null ? null : markdownToSnapshot(this.upstream)),
        alignIds: alignSnapshotIds,
        getLocalModifiedAt: async () => this.fileModifiedAt || null,
        onPeers: (peers) => { this.peers = peers.length },
        onStatus: (status) => { this.status = status },
      },
    )
  }

  start() {
    return this.session.start()
  }

  get markdown() {
    return snapshotToMarkdown(this.snapshot)
  }

  /** Remplace tout le document par ce markdown, comme une saisie dans l'éditeur. */
  type(markdown: string) {
    this.snapshot = alignSnapshotIds(markdownToSnapshot(markdown), this.snapshot)
    this.fileModifiedAt = Date.now()
    this.session.onLocalSnapshot(this.snapshot)
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

async function waitLive(editors: SimulatedBlockEditor[]) {
  await waitFor(() => editors.every((editor) => editor.status === 'live'), 15_000, 'sessions en direct')
}

const occurrences = (text: string, token: string) => text.split(token).length - 1
/** Forme du markdown telle que l'éditeur l'écrit (échappements, listes…). */
const canonical = (markdown: string) => snapshotToMarkdown(markdownToSnapshot(markdown))

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

  test('deux personnes ouvrent le document au même instant : pas de texte en double', async () => {
    const relay = new FakeRelay(53)
    const editors = ['alice', 'bob'].map((name) => new SimulatedBlockEditor(relay, name, INITIAL))
    await Promise.all(editors.map((editor) => editor.start()))
    await waitLive(editors)
    editors[0].type(editors[0].markdown.replace('Introduction.', 'Introduction. [A]'))
    editors[1].type(editors[1].markdown.replace('Conclusion.', 'Conclusion. [B]'))
    const final = await waitConverged(editors)
    expect(final).toBe(canonical(INITIAL.replace('Introduction.', 'Introduction. [A]').replace('Conclusion.', 'Conclusion. [B]')))
    for (const editor of editors) await editor.session.stop()
  })

  test('session redémarrée pendant qu un participant est hors ligne : il la rejoint sans doublon', async () => {
    const relay = new FakeRelay(71)
    const initial = 'Base commune.\n'
    const alice = new SimulatedBlockEditor(relay, 'alice', initial, initial)
    await alice.start()
    await waitLive([alice])
    alice.type('Base commune.\n\nAjout d Alice.\n')
    await sleep(300)

    // Alice décroche et continue de taper hors ligne.
    alice.connection.disconnect()
    alice.type('Base commune.\n\nAjout d Alice.\n\nHors ligne.\n')

    // Bob arrive seul : il redémarre la session depuis son fichier (git).
    const bobFile = 'Base commune.\n\nAjout d Alice.\n'
    const bob = new SimulatedBlockEditor(relay, 'bob', bobFile, initial)
    await bob.start()
    await waitLive([bob])
    bob.type(`${bobFile}\nAjout de Bob.\n`)
    await sleep(200)

    // Retour d'Alice : nouvelle époque, elle rejoint la session de Bob.
    alice.connection.reconnect()
    const final = await waitConverged([alice, bob])
    for (const line of ['Base commune.', 'Ajout d Alice.', 'Ajout de Bob.', 'Hors ligne.']) expect(occurrences(final, line), line).toBe(1)
    for (const editor of [alice, bob]) await editor.session.stop()
  })

  test('journal volumineux : compaction à l arrivée, état correct pour les suivants', async () => {
    const relay = new FakeRelay(83, 5)
    const alice = new SimulatedBlockEditor(relay, 'alice', 'Journal :\n', 'Journal :\n')
    await alice.start()
    await waitLive([alice])
    // Longue session : 260 modifications distinctes journalisées par le relais.
    const writer = relay.connect('writer')
    const cipher = new PayloadCipher(KEY)
    const server = await writer.getState(DOCUMENT_ID)
    const ghost = new Y.Doc()
    for (const payload of [server.state, ...server.updates.map((entry) => entry.update)]) {
      if (payload) Y.applyUpdate(ghost, (await cipher.open(payload))!)
    }
    let expected = 'Journal :'
    for (let index = 0; index < 260; index += 1) {
      const before = Y.encodeStateVector(ghost)
      const base = readSnapshot(ghost)
      const next = structuredClone(base)
      ;(next.blocks[0] as SharedTextBlock).md += ` ${index};`
      expected += ` ${index};`
      applySnapshot(ghost, base, next, 'writer')
      await writer.pushUpdate(DOCUMENT_ID, { update: await cipher.seal(Y.encodeStateAsUpdate(ghost, before)), clientId: 'writer' })
    }
    await waitFor(() => alice.markdown === `${expected}\n`, 10_000, 'Alice reçoit la longue session')
    expect(relay.pendingUpdateCount(DOCUMENT_ID)).toBeGreaterThan(200)

    const bob = new SimulatedBlockEditor(relay, 'bob', 'Journal :\n', 'Journal :\n')
    await bob.start()
    await waitLive([bob])
    await waitFor(() => relay.pendingUpdateCount(DOCUMENT_ID) < 50, 10_000, 'compaction')

    const chloe = new SimulatedBlockEditor(relay, 'chloe', 'Journal :\n', 'Journal :\n')
    await chloe.start()
    await waitLive([chloe])
    const final = await waitConverged([alice, bob, chloe])
    expect(final).toBe(`${expected}\n`)
    for (const editor of [alice, bob, chloe]) await editor.session.stop()
  })

  test('chiffrement : le relais ne voit jamais le texte, une mauvaise clé ne lit ni ne corrompt rien', async () => {
    const relay = new FakeRelay(101)
    const initial = 'Secret de fabrication.\n'
    const alice = new SimulatedBlockEditor(relay, 'alice', initial, initial)
    const bob = new SimulatedBlockEditor(relay, 'bob', initial, initial)
    await alice.start()
    await waitLive([alice])
    await bob.start()
    await waitLive([alice, bob])
    alice.type(`Confidentiel : ${initial}`)

    // Quelqu'un qui connaît l'identifiant mais pas la clé du dépôt.
    const intruder = new SimulatedBlockEditor(relay, 'intrus', 'Texte injecté.\n', null, Buffer.alloc(32, 3).toString('base64'))
    await intruder.start()
    await sleep(2500)
    intruder.type('Pirate Texte injecté.\n')

    const final = await waitConverged([alice, bob])
    expect(final).toBe(`Confidentiel : ${initial}`)
    expect(intruder.markdown).not.toContain('Secret')
    const stored = JSON.stringify([...relay.docs.values()])
    expect(stored).not.toContain('Secret')
    expect(stored).not.toContain('Confidentiel')
    for (const editor of [alice, bob, intruder]) await editor.session.stop()
  })

  test('départ d un participant : les autres ne le voient plus', async () => {
    const relay = new FakeRelay(97)
    const alice = new SimulatedBlockEditor(relay, 'alice', 'x\n', 'x\n')
    const bob = new SimulatedBlockEditor(relay, 'bob', 'x\n', 'x\n')
    await alice.start()
    await waitLive([alice])
    await bob.start()
    await waitLive([alice, bob])
    await waitFor(() => alice.peers === 1 && bob.peers === 1, 5_000, 'présence mutuelle')
    await bob.session.stop()
    await waitFor(() => alice.peers === 0, 5_000, 'départ visible')
    await alice.session.stop()
  })

  test('participants : tous ceux qui ont rejoint la session, même hors ligne ou relancés', async () => {
    const relay = new FakeRelay(131)
    const [alice, bob, chloe] = ['alice', 'bob', 'chloe'].map((name) => new SimulatedBlockEditor(relay, name, INITIAL))
    for (const editor of [alice, bob, chloe]) {
      await editor.start()
      await waitLive([editor])
    }
    await waitFor(() => chloe.session.participants().length === 3, 5_000, 'tous inscrits')
    // Bob décroche ; Chloé plante et relance : elle sait toujours que Bob participe.
    bob.connection.disconnect()
    chloe.connection.crash()
    const relaunched = new SimulatedBlockEditor(relay, 'chloe', INITIAL)
    await relaunched.start()
    await waitLive([relaunched])
    expect(relaunched.session.participants().sort()).toEqual(['alice@example.com', 'bob@example.com', 'chloe@example.com'])
    for (const editor of [alice, bob, relaunched]) await editor.session.stop()
  })
})
