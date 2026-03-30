# Cahier des charges — Holo

## 1) Objectif
Créer un éditeur Markdown desktop avec expérience WYSIWYG, inspirée de Microsoft Loop, et intégration Git/GitHub.

## 2) Contexte
Nous apprécions l’expérience Microsoft Loop dans l’entreprise, mais le stockage et la récupération des données ne conviennent pas à nos besoins.
La documentation a été déplacée vers GitHub, mais les outils d’édition actuels ne conviennent pas à tous les utilisateurs (ergonomie datée, lenteur, expérience web peu satisfaisante).

Objectif produit : proposer une expérience utilisateur proche de Loop (look & feel + fluidité), avec un stockage centré sur des fichiers Markdown versionnés dans GitHub.

---

## 3) Périmètre technique initial
- React
- Vite
- Electron
- Tailwind CSS v4

---

## 4) Roadmap par étapes

## Suivi d’avancement
- Dernière mise à jour : 27/03/2026
- Statut global : Étapes 1, 2, 3 terminées | Étape 4 en cours (UI finale + onglets terminés)

| Étape | Statut | Date | Notes |
|---|---|---|---|
| Étape 1 — Préparation du projet | ✅ Terminé | 23/03/2026 | React + Vite + Electron + Tailwind v4 intégrés, scripts `dev/build/lint` validés |
| Étape 2 — Application de base (fichiers) | ✅ Terminé | 23/03/2026 | Ouverture dossier, arborescence, édition RAW, sauvegarde Ctrl+S + bouton, CRUD fichiers/dossiers |
| Étape 3 — Intégration Git | ✅ Terminé | 24/03/2026 | Détection repo, indicateurs locaux/distants, commit, fetch auto 60s, pull, merge, Synchroniser auto, conflits |
| Étape 4A — UI/UX finale (Layout + Onglets) | ✅ Terminé | 27/03/2026 | Sidebar (2 icônes Files/Git), panneaux actifs Files/Git, badge onglets ouverts, système d'onglets multi-fichiers, éditeur RAW dark |
| Étape 4B — Drag & drop | 🚧 En cours | 27/03/2026 | Première version branchée: déplacement fichier/dossier vers un dossier cible depuis l'arborescence |
| Étape 4C — Éditeur WYSIWYG | 🚧 En cours | 27/03/2026 | Éditeur visuel éditable (contentEditable) avec toolbar minimale (gras/italique/titres/liste/lien), conversion HTML↔Markdown et bascule RAW/WYSIWYG |
| Étape 5 — À définir | ⏳ À faire | — | Backlog d'améliorations |

---

### Étape 1 — Préparation du projet
#### Fonctionnalités
- Initialiser le projet avec React + Vite + Electron + Tailwind CSS v4.
- Structurer le projet pour séparer clairement : interface, logique métier, accès fichier, accès Git.

#### Critères d’acceptation
- L’application démarre correctement dans Electron.
- La fenêtre principale affiche l’interface de base sans erreur console bloquante.
- Le mode développement permet de lancer l’application en une commande.

#### Progression
- ✅ Projet initialisé avec Vite + React (TypeScript).
- ✅ Electron intégré avec point d’entrée dédié et preload sécurisé.
- ✅ Tailwind CSS v4 intégré via plugin Vite.
- ✅ Validation technique effectuée : `npm run build`, `npm run lint`, `npm run dev`.

---

### Étape 2 — Application de base (fichiers)
#### Fonctionnalités
- Ouvrir un dossier local et lister son contenu.
- Afficher une UI basique : arborescence à gauche, éditeur à droite.
- Éditer un fichier en mode RAW.
- Sauvegarder via raccourci clavier (Ctrl+S) et via icône.
- Créer un dossier (saisie du nom).
- Créer un fichier (saisie du nom).
- Supprimer un fichier (avec confirmation).
- Supprimer un dossier (avec confirmation).
- Renommer un fichier ou un dossier.

#### Critères d’acceptation
- Chaque action fichier/dossier fonctionne sans redémarrage de l’application.
- Le rafraîchissement de l’arborescence est immédiat après chaque opération.
- Les erreurs utilisateur (nom invalide, conflit de nom, droits insuffisants) sont affichées clairement.
- Toutes les fonctionnalités ci-dessus sont validées avant passage à l’étape suivante.

#### Progression
- ✅ Ouverture d’un dossier local via sélecteur natif.
- ✅ Affichage arborescence à gauche + éditeur RAW à droite.
- ✅ Édition de fichier et sauvegarde via bouton + raccourci Ctrl+S.
- ✅ Création de fichier/dossier via saisie du nom.
- ✅ Suppression de fichier/dossier avec confirmation.
- ✅ Renommage de fichier/dossier.
- ✅ Validation technique effectuée : `npm run lint`, `npm run build`, `npm run dev`.

#### Corrections post-livraison
- ✅ Correctif ouverture de dossier (23/03/2026) : pont preload Electron fiabilisé (`preload.cjs`) et message explicite côté UI si l’API Electron est indisponible.
- ✅ Correctifs actions arborescence (23/03/2026) : fiabilisation des boutons "Nouveau fichier", "Nouveau dossier" et "Renommer" avec feedback utilisateur explicite.
- ✅ Amélioration UX arborescence (23/03/2026) : dossiers accordéonnables, tous fermés par défaut.
- ✅ Amélioration UX arborescence (23/03/2026) : masquage des fichiers/dossiers cachés (ex: `.git`).
- ✅ Correctif actions fichiers/dossiers (23/03/2026) : remplacement des prompts natifs par une modale de saisie intégrée (fiable sous Electron) pour "Nouveau fichier", "Nouveau dossier" et "Renommer".

---

### Étape 3 — Intégration Git
#### Fonctionnalités
- Détecter si le dossier ouvert est un dépôt Git.
- Détecter les changements locaux avec un indicateur visuel clair.
- Permettre de créer un commit.
- Lancer un fetch automatique toutes les 60 secondes.
- Afficher un indicateur des changements distants détectés.
- Permettre un pull.
- Permettre un merge.

#### Critères d’acceptation
- Si le dossier n’est pas un dépôt Git, les actions Git sont désactivées avec message explicite.
- Les indicateurs locaux/distants se mettent à jour sans relancer l’application.
- Les opérations commit/pull/merge renvoient un statut clair (succès/échec + message).

#### Progression
- ✅ Détection du dépôt Git sur le dossier ouvert.
- ✅ Indicateurs visuels : changements locaux, commits sortants, commits entrants.
- ✅ Bouton **Synchroniser** (flux automatique fetch/pull/rebase/push avec interruption en cas de conflit).
- ✅ Commit via message (modale dédiée) avec tentative d’envoi automatique (`push`) après commit.
- ✅ Génération automatique du message de commit dans le flux de synchronisation (fichiers modifiés + lignes ajoutées/supprimées).
- ✅ Fetch automatique toutes les 60 secondes (+ fetch manuel).
- ✅ Pull.
- ✅ Merge d’une branche via modale dédiée.
- ✅ En cas de conflit Git, liste des fichiers en conflit affichée dans le panneau Git avec ouverture directe pour édition.
- ✅ Validation technique effectuée : `npm run build`, `npm exec eslint . --max-warnings=0`.

#### Point à clarifier (important)
- Définir explicitement le périmètre GitHub :
	- push requis ou non,
	- gestion des conflits (minimum attendu),
	- méthode d’authentification (SSH, token personnel, autre).

#### Décisions validées (25/03/2026)
- **Objectif UX Git** : fonctionnement le plus simple possible, inspiré de VS Code, pour des utilisateurs non techniques (secrétariat / vente).
- **Action principale** : bouton unique **Synchroniser**.
	- Si dépôt à jour : fetch/pull silencieux.
	- Si commits locaux + distant, sans conflit : enchaîner automatiquement les opérations nécessaires pour revenir à un état synchronisé.
	- Si conflit : interrompre le flux auto, afficher un écran de résolution guidée.
- **Push** : requis et intégré au flux de synchronisation automatique.
- **Messages de commit** : génération automatique souhaitée à partir de la liste des fichiers modifiés + nombre de lignes modifiées par fichier (mode "ultra simple").
- **Conflits (minimum attendu)** :
	- lister les fichiers en conflit,
	- ouvrir chaque fichier directement depuis la liste,
	- proposer ensuite une UI de résolution plus visuelle (blocs `HEAD` / `incoming`) pour choisir rapidement.
- **Authentification GitHub** : privilégier une connexion la plus simple possible via navigateur ; conserver compatibilité avec configuration Git existante en environnement local.

---

### Étape 4 — UI/UX finale
#### Fonctionnalités
- UI finale avec barre latérale à 2 icônes (Dossier et Git), layout proche VS Code.
- Gestion des onglets ouverts.
- Icône Dossier avec indicateur d’onglets ouverts.
- Icône Git avec 2 indicateurs :
	- flèche vers le haut = nombre de commits locaux à pousser,
	- flèche vers le bas = nombre de changements distants à récupérer.
- Drag & drop de fichiers/dossiers pour réorganiser la structure.
- Intégration d’un éditeur Markdown WYSIWYG.
- Switch RAW / WYSIWYG.
- Enlever la barre "fichier edition de base"
- Enlever la barre de titre et refaire les bouton minimize, close ,...
- Créer, supprimer, renommer plutot via bouton droite

#### Critères d’acceptation
- Le changement RAW/WYSIWYG préserve le contenu Markdown.
- Le drag & drop met à jour le système de fichiers sans corruption.
- Les indicateurs de la barre latérale restent cohérents après opérations Git/fichier.

#### Point d’attention
Le choix de l’éditeur WYSIWYG est critique : valider tôt la personnalisation, la performance et la fidélité Markdown. Si aucun éditeur ne convient, envisager une couche de personnalisation avancée (ou développement spécifique ciblé).

---

### Étape 5 — À définir
Améliorations, suggestions et consolidation.

Proposition de sujets pour cette étape :
- Stabilisation et correction de bugs.
- Optimisation des performances sur gros dépôts.
- Qualité (tests, logs, gestion d’erreurs avancée).
- Packaging/distribution.
- Durcissement sécurité Electron (IPC, permissions, isolation).


✅ WYSIWYG par défaut
✅ Gérer les dossier ouverts récents (Fichier > Ouvrir... & Spéarateur -> liste des dossiers récemment ouvert, visible seulement quand aucun dossier n’est ouvert)
✅ Gestion clic droit dans l'arborescence : renommer, nouveau fichier, nouveau dossier, supprimer (last edited Git à faire)
UI Merge plus "sympa"
Choisir son nom au démarage de l'app (configuration git) avec bouton utilisateur -> déconnexion, image de profile , etc...
Connexion avec github (dans le browser)
Pull un repo (avec search field) depuis github
Recherche dans la doc (directement sur qdrant?)
Dans la hiérarchie de fichier, vu qu'on a que des fichier MD, on essai de récupe titre et description dans le markdown (voir l'icon si on fait fontawesome)
✅ Bloc d'entête markdown editable en WYSIWYG (Titre, Description, auteur, dernier modification, dates, icones,...) qqch de jolie comme dans loop
✅ Lister seulement les fichier .md (ne pas afficher les extentions)
✅ Expand le dossier qu'on vient d'ouvrir par défaut

✅ En terme UX enlever la barre WYSIWYG pour faire plus comme loop (commande / pour faire un tableau, quand je tape "-" ça fait une liste, quand je selectionn un texte y'a un popup pour bold italic souligné tracé )

---



## 5) Définition de “fini” (global)
- Les 4 premières étapes sont validées par leurs critères d’acceptation.
- Le flux principal utilisateur est fluide : ouvrir un dossier, éditer, sauvegarder, committer, synchroniser.
- L’application est utilisable par un utilisateur non technique avec messages d’erreur compréhensibles.



## Feedback

### 30.03.26
- Changer le Readme.md pour correspondre a un truc plus standard github (en anglais, description du produit pour l'utilisation et pas pour le développement)
- Ajouter 
- Gestion des images
	- masquer le dossier /images dans l'arboresence
	- Dans l'editeur les images de fonctionne pas (reprendre puis dossier racine du projet /images)
	- Pouvoir drag & drop une image dans l'éditeur (l'image est ajoutée dans /image et le code markdown est ajouter a l'endroit du curseur)
- Connexion a github au démarage (logo ouverture du navigateur puis retour dans l'app)
- CTRL+ S autocommit (Commit message automatique) update/add [Chemindelapage/Nomdufichier]