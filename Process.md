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
- Dernière mise à jour : 07/04/2026
- Statut global : Étapes 1 à 5 terminées | Étape 6 en cours (semi-prod : feedback utilisateur + corrections)

| Étape | Statut | Date | Notes |
|---|---|---|---|
| Étape 1 — Préparation du projet | ✅ Terminé | 23/03/2026 | React + Vite + Electron + Tailwind v4 intégrés, scripts `dev/build/lint` validés |
| Étape 2 — Application de base (fichiers) | ✅ Terminé | 23/03/2026 | Ouverture dossier, arborescence, édition RAW, sauvegarde Ctrl+S + bouton, CRUD fichiers/dossiers |
| Étape 3 — Intégration Git | ✅ Terminé | 24/03/2026 | Détection repo, indicateurs locaux/distants, commit, fetch auto 60s, pull, merge, Synchroniser auto, conflits |
| Étape 4A — UI/UX finale (Layout + Onglets) | ✅ Terminé | 27/03/2026 | Sidebar (2 icônes Files/Git), panneaux actifs Files/Git, badge onglets ouverts, système d'onglets multi-fichiers, éditeur RAW dark |
| Étape 4B — Drag & drop | ✅ Terminé | 30/03/2026 | Déplacement fichier/dossier vers un dossier cible depuis l'arborescence, avec rafraîchissement immédiat |
| Étape 4C — Éditeur WYSIWYG | ✅ Terminé | 30/03/2026 | Éditeur visuel type Loop (slash commands, popup de sélection, raccourcis markdown, en-tête intégré au scroll) |
| Étape 5 — Stabilisation & release | ✅ Terminé | 30/03/2026 | Stabilisation, corrections UX, pipeline release GitHub multi-OS (Windows/macOS/Linux) |
| Étape 6 — Semi-production (feedback) | 🚧 En cours | 30/03/2026 | Boucle feedback utilisateur, priorisation, corrections rapides, suivi qualité |

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

### Étape 5 — Stabilisation & release (terminée)
Consolidation et préparation à la diffusion.

Réalisé sur cette étape :
- ✅ Stabilisation et correctifs UX prioritaires.
- ✅ Préparation packaging desktop multi-plateforme.
- ✅ Workflow GitHub Release automatisé (tag `v*`).
- ✅ Rationalisation des assets de release publiés.

---

### Étape 6 — Semi-production (en cours)
Objectif : passer en mode usage réel encadré et améliorer le produit via retours terrain.

Cadre de travail :
- Collecter les feedbacks utilisateurs de manière structurée.
- Prioriser en cycles courts (impact / effort / criticité).
- Déployer des correctifs rapides avec validation systématique.
- Mettre à jour ce document à chaque intervention.


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
- ✅ Changer le Readme.md pour correspondre a un truc plus standard github (en anglais, description du produit pour l'utilisation et pas pour le développement)
- ✅ Ajouter un logo à l'application
- Gestion des images
	- ✅ masquer le dossier /images dans l'arboresence
	- ✅ Dans l'editeur les images de fonctionne pas (reprendre puis dossier racine du projet /images)
	- ✅ Pouvoir drag & drop une image dans l'éditeur (l'image est ajoutée dans /image et le code markdown est ajouter a l'endroit du curseur)
- ✅ CTRL+ S autocommit (Commit message automatique) update/add [Chemindelapage/Nomdufichier]
- ✅ Quand je tape "/" pour une commande le popup s'affiche tout en haut a gauche de l'app et pas sur la position du curseur. Et si je fait "echape" pour annuler le "/" reste
- ✅Les popup de création de fichier / dossier et renommage mérite d'être adapté en terme de style (dark mode)
- Améliorer l'UI/UX des liste de tâche dans l'editeur
- Quand je fait une commande "/" ça affecte la ligne dessous bizarrement et pas juste la ligne courante
- Connexion a github au démarage (logo ouverture du navigateur puis retour dans l'app)
- ✅ Améliorer le nom d'import des image pour éviter les doublon (nom-image+hashfichier)
- Auto-update depuis les release github
- ✅ Quand on crée des fichier est-ce que c'est possible d'omêtre le .md et de le rajouter si il est pas fourni?
- ✅ Quand ton créé un fichier que ça l'ouvre directement
- ✅ Améliorer l'ui / ux des tableau (plus comme loop)
- Amélirations UX GIT
	- ✅ Push direct quand CTRL+S
	- Avertir si version plus récente de ce fichier en remote (proposer de pull)
- ✅ Ajouter possibilité dans le header de mettre une icone (emoji) au fichier
- Ajouter des Tag (etiquette)
- Ajouter un panel "recherche" pour pouvoir chercher par contenu ou tag

- ✅ Quand on crée un nouveau fichier directement focus dans le titre
- ✅ Espacer un peu plus le contenu 
- ✅ Ajouter UI pour ajouter lignes et colonnes dans un tableau
- ✅ Quand on ouvre un dossier dans le panel fichier avoir plusieurs section :
	- Explorer l'arboresence normal
	- Mes fichiers l'auteur correspond au nom saisie au départ de l'app
	- Fichier récents (5 derniers fichiers ouverts)
- ✅ Fetch/Pull directement quand on arrive dans l'app
- detecte si l'utilisateur s'appelle Virgile il faut rajouter dans titre de l'app dynamiquement "TypeR" en beau rouge
- fixer les taille des colonnes (3 colonnes 1/3*3)
- Proposer la liste complète d'emoji pour les icones de fichier avec un champ de recherche
- Afficher l'icone dans l'arboresence
- Fixer la largeur du panneau Fichier (c'est pas beau qu'il change de largeur quand on change d'onglet)

### 08.04.26 — Tâche feedback #12+ (en cours)
- ✅ Devtools par défaut : ajout de `window.webContents.openDevTools()` dans `createWindow()` pour déboguer le .deb qui n'affiche rien
- ✅ Auto-updates : intégration de `electron-updater` avec vérification automatique des releases GitHub
  - Contrôle: `checkForUpdates()`, `installUpdate()`
  - État: `updateAvailable`, `updateReady`, `updateProgress`
  - Modal: affiche progression du téléchargement + bouton "Redémarrer et installer"
  - Vérification toutes les 60 minutes + fetch initiale au démarrage
  - Dépendance: `electron-updater` install dans package.json
  - Repository field ajouté pour electron-updater (pointe vers GitHub releases)
- Updates automatiques
- BUG : j'arrive plus a ouvrir de fichier (`TreeItem onClick`) — ✅ CORRIGÉ (ajout `else { onSelect(node) }` pour les fichiers)
- ✅ Refonte git checkout
	- Clone HTTPS depuis l'app (URL + login/mot de passe optionnels)
	- Sélection du dossier destination
	- Clone + ouverture automatique du dossier cloné
- ✅ Modifier le placement du bouton icone dans les pages (au dessus du titre et pas a gauche)
- ✅ Ajouter le numero de version en petit qq part (affiché en en-tête)
- Quand on créé ou renomme un fichier giter la modification directement, pareil pour le déplacement d'un fichier dans un dossier



### 31.03.26 — Tâche feedback #1 (terminée : 30/03/2026)
- ✅ Masquage dossier `images` dans l'arborescence (electron/main.js `buildTree`)
- ✅ Affichage images corrigé : les chemins relatifs `images/foo.png` sont résolus en `file:///rootPath/images/foo.png` pour Electron (`markdownToHtml`)
- ✅ Drag & drop image dans éditeur WYSIWYG : copie dans `/images`, insertion `<img>` au curseur, sync markdown
- ✅ Drag & drop image dans éditeur RAW : copie dans `/images`, insertion `![alt](images/...)` à la position curseur
- ✅ Turndown custom rule : reconvertit les URLs `file://` en chemins relatifs pour le markdown sauvegardé
- ✅ IPC Electron `fs:save-image` : crée `/images` si absent, génère un nom unique horodaté, retourne le chemin relatif
- ✅ Overlay drag & drop image : affiche "Déposez une image pour l'insérer" lors du survol avec stabilisation du clignotement

### 31.03.26 — Tâche feedback #2 (terminée)
- ✅ Logo de l'application : SVG moderne "HO" avec dégradé violet, créé en 200x200
- ✅ Favicon : SVG cohérent avec le logo principal
- ✅ Icon Electron : conversion SVG → PNG (256x256 + 512x512) pour compatibilité multi-plateforme
- ✅ Intégration window icon : `logo-256.png` défini dans `electron/main.js` BrowserWindow config

### 30.03.26 — Tâche feedback #3 (terminée : 30/03/2026)
- ✅ Dark-mode modales : convertir les dialogues de création/renommage en dark theme (bg-[#1a1b1c], text-white, bordures white/20, boutons violets)
- ✅ CTRL+S autocommit : intégration du commit automatique lors de la sauvegarde Ctrl+S (si dans un repo Git)
  - Message format : "update/add [NomFichier]"
  - Silent fail si commit échoue (fichier sauvegardé ira quand même)
  - Dépendance ajoutée : `gitState.isRepo` dans les dépendances de `saveCurrentFile`

### 30.03.26 — Tâche feedback #4 (terminée : 30/03/2026)
- ✅ Slash command menu positioning : amélioration du calcul de position du curseur pour afficher le menu à la position réelle du "/" plutôt qu'en haut-à-gauche
  - Utilisation d'une span temporaire pour mesurer la position précise
  - Menu positionné directement sous le curseur avec offset calcul
- ✅ Escape key cleanup : quand l'utilisateur appuie sur Échap pour annuler la commande slash, le "/" est automatiquement supprimé (document.execCommand('delete'))

### 30.03.26 — Tâche feedback #5 (terminée : 30/03/2026)
- ✅ Auto-add .md extension : lors de la création d'un fichier, if l'extension n'est pas fournie (ex: "mon-doc" → "mon-doc.md")
- ✅ Image naming with hash : amélioration du nommage des images importées pour éviter les doublons (ex: nom-image-${hash}${ext} au lieu de nom-image-${timestamp}${ext})
  - Utilisation de crypto.createHash('sha256') sur le contenu base64 de l'image
  - Hash de 8 caractères hexadécimaux pour garantir l'unicité

### 30.03.26 — Tâche feedback #6 (terminée : 30/03/2026)
- ✅ Auto-open fichier : quand on crée un fichier via la modale, le fichier s'ouvre directement dans l'éditeur (ajout à openTabs + setActiveTabPath)
- ✅ Improve checkbox styling : amélioration du style des checkboxes dans les listes de tâches
  - Accent color: [#7B61FF] (violet cohérent)
  - Size: w-4 h-4, cursor-pointer
  - Margin: mr-2 pour l'espacement
- ✅ Improve table styling : amélioration des tableaux pour une meilleure lisibilité
  - En-têtes: bg-[#7B61FF]/10, border-[#7B61FF]/30, padding augmenté à p-3, font-semibold
  - Cellules: border-white/10, padding p-3, bg-white/2 pour subtil contraste
  - Table margin: my-3 pour plus d'espace
- ✅ Fix slash command line issue : correction du bug où "/" affectait la ligne dessous
  - Refactorisation de executeSlashCommand pour mieux gérer l'insertion HTML
  - Séparation des insertions HTML pour code, table, todo (une insertion à la fois plutôt que tout ensemble)

### 30.03.26 — Tâche feedback #7 (WIP - fixes pour "/" et checkboxes)
- 🔧 Added Turndown rule for checkboxes: convertit les input checkboxes en markdown task lists (`[x]` ou `[ ]`)
- 🔧 Fixed slash command structure: une seule insertion HTML pour éviter les problèmes de structure DOM
- 🔧 Enhanced table styling v2: bordures arrondies, gradient header, hover effects, meilleur espacement
  - `rounded-lg overflow-hidden` pour les bordures
  - `bg-gradient-to-r from-[#7B61FF]/15 to-[#9d8bff]/10` pour le header
  - `transition-colors` + `hover:bg-white/5` pour les lignes
- 🔧 Added onClick handler for checkboxes: permet de cocher/décocher les tâches et synchroniser avec le markdown

### 07.04.26 — Tâche feedback #8 (terminée)
- ✅ Header fichier : ajout d’une icône emoji sélectionnable (picker), stockage dans le frontmatter (`icon`)
- ✅ Affichage de l’emoji dans les onglets
- ✅ Focus automatique du titre lors de la création d’un nouveau fichier
- ✅ Ajustement du spacing de la zone page (respiration visuelle)

### 07.04.26 — Tâche feedback #9 (terminée)
- ✅ Tableau : ajout d’une mini-toolbar contextuelle dans l’éditeur WYSIWYG
- ✅ Actions rapides : ajouter une ligne et ajouter une colonne

### 07.04.26 — Tâche feedback #10 (terminée)
- ✅ Sauvegarde Ctrl+S : feedback visuel de statut (sync en cours, synchronisé, sauvegardé local)
- ✅ Push direct après sauvegarde (via flux commit+push Git existant)
- ✅ Démarrage dossier : pull silencieux initial + rafraîchissement arbre/statut Git

### 07.04.26 — Tâche feedback #11 (terminée)
- ✅ Panel Fichiers en 3 sections : Explorer / Mes fichiers / Récents
- ✅ Section Mes fichiers basée sur l’auteur (nom stocké localement)
- ✅ Section Récents limitée aux 5 derniers fichiers ouverts