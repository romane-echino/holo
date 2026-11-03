/**
 * realtimeSpaces.spec.ts — Présence dans les espaces et propagation des fichiers
 *
 * Deux instances Holo sur deux clones d'un même dépôt servi en HTTP (git
 * http-backend), reliées par le relais Codenotch local :
 * - chacune voit l'autre dans la liste des espaces et à côté du fichier ouvert ;
 * - un fichier ou dossier créé par l'une apparaît chez l'autre sans attendre la
 *   synchronisation périodique (signal d'envoi transmis par le relais).
 *
 * Nécessite un runtime Codenotch local avec le projet holo-realtime déployé
 * (`cd holo-realtime && cn project start --no-open`). Ignoré sinon.
 */

import { test, expect, type Page } from '@playwright/test'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { launchHolo, relayAvailable, setupSharedRepository, type Launched } from './support/realtimeHarness'

function treeItem(page: Page, absolutePath: string) {
  return page.locator(`[data-tree-path="${absolutePath.replace(/"/g, '\\"')}"]`)
}

test.describe('Présence dans les espaces (relais Codenotch)', () => {
  test.setTimeout(150_000)

  test('on voit qui est dans l espace, sur quel fichier, et les fichiers créés par les autres', async () => {
    test.skip(!(await relayAvailable()), 'Runtime Codenotch local ou projet holo-realtime indisponible')

    const repository = await setupSharedRepository(['alice', 'bob'], {
      'doc.md': '# Document\n\nTexte.\n',
      'notes.md': '# Notes\n\nÀ relire.\n',
    })
    const clones = repository.clones as Record<'alice' | 'bob', string>

    let alice: Launched | null = null
    let bob: Launched | null = null
    try {
      alice = await launchHolo(clones.alice, path.join(clones.alice, 'doc.md'), 'Alice Martin', 'alice@example.com')
      bob = await launchHolo(clones.bob, path.join(clones.bob, 'notes.md'), 'Bob Keller', 'bob@example.com')

      // Chacun voit l'autre dans la liste des espaces…
      await expect(alice.page.getByTestId('space-peers').getByLabel('Bob Keller')).toBeVisible({ timeout: 30_000 })
      await expect(bob.page.getByTestId('space-peers').getByLabel('Alice Martin')).toBeVisible({ timeout: 30_000 })
      // … et à côté du fichier que l'autre a ouvert.
      await expect(treeItem(alice.page, path.join(clones.alice, 'notes.md')).getByLabel('Bob Keller')).toBeVisible({ timeout: 15_000 })
      await expect(treeItem(bob.page, path.join(clones.bob, 'doc.md')).getByLabel('Alice Martin')).toBeVisible({ timeout: 15_000 })
      await expect(treeItem(alice.page, path.join(clones.alice, 'doc.md')).getByTestId('tree-editors')).toHaveCount(0)

      // Bob ouvre un autre document : l'indicateur le suit chez Alice.
      await treeItem(bob.page, path.join(clones.bob, 'doc.md')).click()
      await expect(treeItem(alice.page, path.join(clones.alice, 'doc.md')).getByLabel('Bob Keller')).toBeVisible({ timeout: 15_000 })
      await expect(treeItem(alice.page, path.join(clones.alice, 'notes.md')).getByTestId('tree-editors')).toHaveCount(0)

      // Alice crée un fichier (comme « Nouveau fichier » du panneau) : il
      // apparaît chez Bob bien avant la synchronisation périodique (60 s).
      const startedAt = Date.now()
      await alice.page.evaluate(async (root) => {
        await window.holo!.createFile(root, 'Compte rendu.md')
        await window.holo!.gitAutoSave(null as unknown as string)
      }, clones.alice)
      await expect(treeItem(bob.page, path.join(clones.bob, 'Compte rendu.md'))).toBeVisible({ timeout: 20_000 })
      expect(Date.now() - startedAt).toBeLessThan(30_000)

      // Bob crée un dossier : git ne suit pas les dossiers vides, il doit
      // pourtant apparaître chez Alice.
      await bob.page.evaluate(async (root) => {
        await window.holo!.createDirectory(root, 'Dossier partagé')
        await window.holo!.gitAutoSave(null as unknown as string)
      }, clones.bob)
      await expect(treeItem(alice.page, path.join(clones.alice, 'Dossier partagé'))).toBeVisible({ timeout: 20_000 })

      // Un fichier ajouté hors de Holo (Finder, OneDrive…) apparaît aussi.
      await fs.writeFile(path.join(clones.alice, 'Ajout externe.md'), '# Externe\n', 'utf8')
      await expect(treeItem(alice.page, path.join(clones.alice, 'Ajout externe.md'))).toBeVisible({ timeout: 10_000 })

      // Bob ferme Holo : il disparaît de l'espace chez Alice.
      await bob.app.close()
      bob = null
      await expect(alice.page.getByTestId('space-peers')).toHaveCount(0, { timeout: 15_000 })
    } finally {
      if (alice) await alice.app.close().catch(() => {})
      if (bob) await bob.app.close().catch(() => {})
      await repository.cleanup()
      for (const launched of [alice, bob]) if (launched) await fs.rm(launched.configHome, { recursive: true, force: true }).catch(() => {})
    }
  })
})
