# Titre 1 — Document principal

Ceci est un exemple complet de rendu Markdown dans le design system Holo. Le texte est pensé pour être confortable à lire, avec une colonne centrée, beaucoup d'espace et une hiérarchie typographique claire.

Voici un [lien contextuel](#), du **texte important**, du _texte accentué_, du ~~texte barré~~ et un exemple de code inline \`git status\`.

## Titre 2 — Structure du contenu

Les titres secondaires servent à structurer la documentation sans donner une impression trop technique ou trop dense. L'objectif est de garder un rendu premium, lisible et calme.

### Titre 3 — Liste simple

- Documentation interne et durable.
- Markdown WYSIWYG avec rendu propre.
- Versioning Git visible mais simplifié.
- IA intégrée au flux d'écriture.

### Titre 3 — Nested list

- Architecture
  - Frontend
    - React
    - Electron
    - Tailwind
  - Backend
    - Git index
    - RAG pipeline
- Documentation
  - Guides
  - ADR
  - Runbooks

### Titre 3 — Liste numérotée

1. Créer ou ouvrir un repository.
2. Écrire la documentation en Markdown.
3. Synchroniser les changements automatiquement.
4. Utiliser l'IA pour améliorer, résumer ou relier les contenus.

### Checklist / Tasklist

- [x] Finaliser le rendu Markdown
- [x] Ajouter les propriétés éditables
- [ ] Brancher le vrai moteur WYSIWYG
- [ ] Générer la table des matières automatiquement

#### Titre 4 — Note contextuelle

> Le rôle de Holo n'est pas de ressembler à un IDE, mais à un espace de connaissance vivant où Git devient une timeline documentaire.

## Latex equation

Une équation inline peut s'intégrer dans le texte, par exemple $E = mc²$, tandis qu'une équation importante peut être mise en avant.

$$f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

## Image

![Figure 1 — Exemple de bloc image dans le rendu Markdown.](https://placehold.co/920x360/0B0F16/7B61FF?text=Image+%2F+diagramme)

## Code

\`\`\`typescript
type DocumentState = {
  filepath: string
  saved: boolean
  branch: string
  modifiedAt: Date
}

function updateDocument(state: DocumentState) {
  return {
    ...state,
    saved: false,
    modifiedAt: new Date(),
  }
}
\`\`\`

## Tableau

| Élément | Rôle | Statut |
| --- | --- | --- |
| Markdown | Format principal d'écriture | Actif |
| Git | Historique et synchronisation | Synchronisé |
| IA | Résumé, liens, réécriture | Prêt |

## Tableau aligné

| Gauche | Centre | Droite |
| :--- | :---: | ---: |
| Nom | Score | 128 |
| Version | Stable | 2.0 |

---

## Footnote

Holo peut afficher des notes de bas de page discrètes, utiles pour les précisions techniques ou les références internes.[^1]

[^1]: Une footnote doit rester lisible, mais visuellement secondaire par rapport au document principal.

## Conclusion

Ce rendu doit donner l'impression d'un document vivant, lisible et versionné, tout en restant suffisamment neutre pour accueillir de vrais contenus techniques.
