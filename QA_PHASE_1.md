# QA globale — Non-régression refonte 08.05.26

## Statut automatisé actuel ✅
- ✅ `npm run build` passe après la passe de nettoyage finale
- ✅ `npx eslint src/App.tsx` : plus aucune erreur bloquante (warnings hooks restants uniquement)
- ⚠️ `npm run lint` n'est pas encore vert : dette historique restante hors périmètre principal dans `electron/preload.js` et `src/components/table/NewTable.tsx`
- ✅ Plus aucun `window.confirm` dans `src/**/*.{ts,tsx}`
- ✅ Moteur Markdown centralisé dans `src/lib/markdown.ts`
- ✅ Modale de confirmation unifiée pour actions critiques (archive, delete, restore, pull, switch fichier)

## Mode d'emploi
- Cocher chaque point pendant le test manuel desktop.
- Noter toute anomalie dans la section finale avec plateforme + scénario exact.
- Priorité haute aux flux RAW/WYSIWYG, fichiers, Git et templates.

## 1. Ouverture / navigation fichiers
- [ ] Ouvrir un dossier local
- [ ] L'arborescence s'affiche sans erreur bloquante
- [ ] Ouvrir plusieurs fichiers `.md`
- [ ] Le bon contenu s'affiche dans l'éditeur
- [ ] Les onglets restent cohérents lors des changements de fichier
- [ ] Les dossiers récents restent utilisables

## 2. Édition RAW
- [ ] Passer en mode `RAW`
- [ ] Saisir du texte dans le textarea
- [ ] Sauvegarder via bouton
- [ ] Sauvegarder via `Ctrl+S`
- [ ] Recharger le fichier → contenu conservé
- [ ] Tab / Shift+Tab sur listes Markdown restent cohérents

## 3. Édition WYSIWYG
- [ ] Passer en mode `WYSIWYG`
- [ ] Le document est rendu sans perte visible de contenu
- [ ] Modifier un paragraphe simple
- [ ] Créer un titre via `#` ou slash command
- [ ] Créer une liste via `-`
- [ ] Cocher/décocher une todo list
- [ ] Le retour en mode `RAW` conserve le Markdown attendu

## 4. Popups / modales édition
- [ ] Ouvrir un fichier, modifier le contenu, cliquer un autre fichier
- [ ] La modale "Modifications non sauvegardées" s'affiche
- [ ] Cliquer "Continuer" → le nouveau fichier s'ouvre
- [ ] L'édition fonctionne immédiatement après le switch
- [ ] Refaire le scénario et cliquer "Annuler" → rester sur le fichier courant
- [ ] Ouvrir une modale lien puis fermer → l'éditeur reste fonctionnel
- [ ] Ouvrir une modale IA puis fermer → l'éditeur reste fonctionnel

## 5. Header document / métadonnées
- [ ] Modifier titre
- [ ] Modifier description
- [ ] Modifier auteur
- [ ] Ajouter une icône emoji
- [ ] Ajouter un tag
- [ ] Supprimer un tag
- [ ] Vérifier la persistance après sauvegarde/réouverture

## 6. Liens
- [ ] Insérer un lien externe depuis la popup de sélection
- [ ] Insérer un lien interne vers une page du projet
- [ ] `Ctrl+clic` ou `Cmd+clic` ouvre le lien
- [ ] Le tooltip d'aide lien est visible côté rendu
- [ ] Le Markdown résultant est correct en mode `RAW`

## 7. Tableaux / code / overlays
- [ ] Ouvrir le menu slash et insérer un tableau
- [ ] Ajouter une ligne au tableau
- [ ] Ouvrir les contrôles de colonne
- [ ] Changer le type d'une colonne
- [ ] Insérer un bloc code
- [ ] Copier le contenu d'un bloc code via le badge
- [ ] Changer le langage du bloc code
- [ ] Vérifier que le Markdown généré reste cohérent

## 8. Templates
- [ ] Créer un fichier depuis un template
- [ ] Si variables (`$DATE`, `$AUTHOR`, etc.) détectées, les champs apparaissent
- [ ] Les valeurs auto-remplies sont correctes
- [ ] Les variables saisies sont remplacées dans le document créé
- [ ] Le flag `template: true` n'est pas conservé dans le fichier final

## 9. Actions fichiers / arborescence
- [ ] Nouveau fichier
- [ ] Nouveau dossier
- [ ] Renommer un fichier
- [ ] Renommer un dossier
- [ ] Supprimer un fichier via menu contextuel
- [ ] Archiver un fichier
- [ ] Récupérer un fichier archivé
- [ ] Copier le chemin / lien fonctionne si applicable

## 10. Git
- [ ] Le panneau Git s'ouvre sans erreur
- [ ] Les indicateurs incoming/outgoing s'affichent correctement
- [ ] Faire un commit via modale
- [ ] Lancer un fetch manuel
- [ ] Lancer un pull manuel
- [ ] En cas de conflit ou blocage remote, la modale interne s'affiche
- [ ] Le bouton "Pull maintenant" débloque bien l'édition après mise à jour

## 11. Export / partage
- [ ] Copier le lien du fichier actif
- [ ] Le statut "Lien copié" apparaît
- [ ] Exporter en PDF depuis la top bar
- [ ] Vérifier que l'export ne plante pas sur un document avec titres, listes, tableau, code

## 12. Responsive / layout compact
- [ ] Réduire la fenêtre à ~400px de large
- [ ] Le layout compact s'active proprement
- [ ] Le bouton sidebar compact fonctionne
- [ ] Le bouton `Plan` ouvre la table des matières compacte
- [ ] Aucune zone critique n'est inaccessible

## 13. Changelog / settings / profil
- [ ] Ouvrir le changelog courant
- [ ] Cliquer "Compris"
- [ ] Redémarrer l'app → le changelog ne se réaffiche pas inutilement
- [ ] Ouvrir paramètres
- [ ] Modifier le profil auteur
- [ ] Vérifier les boutons update/settings sans blocage UI

## Résultat final
- [ ] Tous les scénarios manuels critiques passent
- [ ] Aucune régression majeure observée
- [ ] RAW ↔ WYSIWYG reste fidèle
- [ ] Les modales n'interrompent plus l'édition
- [ ] L'application reste utilisable en layout compact

**Passage automatisé effectué le:** 08/05/2026
**Passage manuel complet effectué le:** ___________
**Plateforme(s):** Linux / Windows / macOS
**Notes / anomalies:**
