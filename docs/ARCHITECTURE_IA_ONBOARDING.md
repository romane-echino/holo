# Holo — Architecture & onboarding IA/dev (≤ 15 min)

## 1) Démarrage rapide (5 min)

- Prérequis: Node.js 20+, npm.
- Installer: `npm install`
- Lancer en dev desktop: `npm run dev`
- Vérifier la build: `npm run build`

Workspace principal:
- `src/App.tsx`: orchestration globale (state, callbacks, wiring composants).
- `src/components/*`: UI découpée par zones fonctionnelles.
- `src/lib/markdown.ts`: moteur Markdown unifié (front-matter + HTML↔Markdown + post-processing).
- `electron/*`: main/preload, pont IPC desktop.

---

## 2) Où coder quoi (stratégie de contribution)

### A. UI / UX (sans logique métier)
Coder dans `src/components/*`.

Exemples:
- Header global: `src/components/AppHeader.tsx`
- Sidebar + navigation: `src/components/AppSidebar.tsx`
- Canvas éditeur: `src/components/EditorCanvas.tsx`
- Overlays WYSIWYG (selection/table/code/slash): `src/components/EditorOverlays.tsx`

Règle:
- Favoriser des props explicites, pas de state global caché dans les composants présentations.

### B. Orchestration applicative / flux d’état
Coder dans `src/App.tsx`.

Exemples:
- Synchronisation tab active ↔ contenu markdown
- Actions Git/fichier et confirmation flows
- Wiring des callbacks passés aux composants

Règle:
- `App.tsx` orchestre; les composants affichent/interagissent via props.

### C. Moteur Markdown (source de vérité)
Coder dans `src/lib/markdown.ts`.

Responsabilités:
- Front-matter: parse/update (`splitMarkdownFrontMatter`, `updateMarkdownHeaderField`, etc.)
- Conversion HTML → Markdown: `turndownService` singleton + `htmlToMarkdown`
- Conversion Markdown → HTML: `parseMarkdownToHtml`

Règle:
- Toute nouvelle règle de conversion markdown/HTML va ici, pas dans les composants.

### D. Intégration desktop (filesystem/git/dialogs natifs)
Coder dans `electron/*` + appels via `window.holo` côté React.

Règle:
- Valider l’existence de l’API (`getHoloApi`) avant toute action native.

---

## 3) Flux de données clés (mental model)

## Flux édition RAW
1. L’utilisateur modifie le textarea (`EditorCanvas`).
2. `onRawChange` remonte vers `App.tsx`.
3. `updateActiveTabBody` reconstruit le markdown complet (front-matter + body).

## Flux édition WYSIWYG
1. L’éditeur contentEditable est modifié.
2. HTML courant est converti via `htmlToMarkdown` (lib markdown).
3. `updateActiveTabBody` met à jour l’onglet actif.
4. Les overlays (code/table/slash) passent par callbacks orchestrés dans `App.tsx`.

## Flux rendu document
1. Markdown body extrait (`splitMarkdownFrontMatter(...).body`).
2. `markdownToHtml` délègue à `parseMarkdownToHtml`.
3. Le HTML rendu est injecté dans le canvas WYSIWYG.

---

## 4) Fonctions/symboles à connaître en priorité

Dans `src/lib/markdown.ts`:
- `splitMarkdownFrontMatter`
- `getEditableMarkdownHeader`
- `updateMarkdownHeaderField`
- `updateTagsInMarkdown`
- `updateMarkdownBooleanHeaderField`
- `updateMarkdownBody`
- `turndownService`
- `htmlToMarkdown`
- `parseMarkdownToHtml`

Dans `src/App.tsx`:
- `updateActiveTabBody`
- `syncWysiwygFromMarkdown`
- `runWysiwygCommand`
- `executeSlashCommand`

---

## 5) Conventions de code (projet)

- Refactor structurelle: ne pas changer le comportement utilisateur sans demande explicite.
- Pas de logique markdown dispersée: centraliser dans `src/lib/markdown.ts`.
- Pas de prompts natifs isolés: utiliser les modales internes existantes.
- Garder les changements incrémentaux + build vert (`npm run build`) après refactor.
- Préserver style existant (noms, tailwind, organisation des props).

---

## 6) Checklist intervention IA/dev

Avant changement:
- Identifier si c’est UI, orchestration, markdown engine ou desktop bridge.
- Vérifier l’impact cross-mode (RAW + WYSIWYG).

Pendant changement:
- Modifier le plus petit périmètre possible.
- Éviter de dupliquer des types/utilitaires déjà centralisés.

Après changement:
- Lancer `npm run build`.
- Vérifier qu’aucune régression obvious n’apparaît sur:
  - switch RAW/WYSIWYG
  - save/copy/export
  - slash menu/table/code overlays
  - liens Ctrl/Cmd+clic

---

## 7) Prochaines zones naturelles d’amélioration

- Étape 5: QA non-régression complète (fichier, git, templates, export, responsive).
- Réduction progressive de la taille d’`App.tsx` via extraction ciblée des callbacks domaine Git/fichiers.
- Optionnel: code-splitting pour réduire l’avertissement chunk > 500 kB en build.
