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
✅ Choisir son nom au démarage de l'app (configuration git) avec bouton utilisateur -> déconnexion, image de profile , etc...
Connexion avec github (dans le browser)
Pull un repo (avec search field) depuis github
Recherche dans la doc (directement sur qdrant?)
✅ Dans la hiérarchie de fichier, vu qu'on a que des fichier MD, on essai de récupe titre et description dans le markdown (voir l'icon si on fait fontawesome)
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
- ✅ Améliorer l'UI/UX des liste de tâche dans l'editeur

- ✅ Connexion a github au démarage (logo ouverture du navigateur puis retour dans l'app)
- ✅ Améliorer le nom d'import des image pour éviter les doublon (nom-image+hashfichier)
- ✅ Auto-update depuis les release github
- ✅ Quand on crée des fichier est-ce que c'est possible d'omêtre le .md et de le rajouter si il est pas fourni?
- ✅ Quand ton créé un fichier que ça l'ouvre directement
- ✅ Améliorer l'ui / ux des tableau (plus comme loop)
- Amélirations UX GIT
	- ✅ Push direct quand CTRL+S
  - ✅ Avertir si version plus récente de ce fichier en remote (proposer de pull)
- ✅ Ajouter possibilité dans le header de mettre une icone (emoji) au fichier
- ✅ Quand on crée un nouveau fichier directement focus dans le titre
- ✅ Espacer un peu plus le contenu 
- ✅ Ajouter UI pour ajouter lignes et colonnes dans un tableau
- ✅ Quand on ouvre un dossier dans le panel fichier avoir plusieurs section :
	- Explorer l'arboresence normal
	- Mes fichiers l'auteur correspond au nom saisie au départ de l'app
	- Fichier récents (5 derniers fichiers ouverts)
- ✅ Fetch/Pull directement quand on arrive dans l'app
- ✅ detecte si l'utilisateur s'appelle Virgile il faut rajouter dans titre de l'app dynamiquement "TypeR" en beau rouge
- ✅ fixer les taille des colonnes (3 colonnes 1/3*3)
- ✅ Proposer la liste complète d'emoji pour les icones de fichier avec un champ de recherche
- ✅ Afficher l'icone dans l'arboresence
- ✅ Fixer la largeur du panneau Fichier (c'est pas beau qu'il change de largeur quand on change d'onglet)

### 08.04.26 — Tâche feedback #12+ (en cours)
- ✅ Devtools par défaut : ajout de `window.webContents.openDevTools()` dans `createWindow()` pour déboguer le .deb qui n'affiche rien
- ✅ Auto-updates : intégration de `electron-updater` avec vérification automatique des releases GitHub
  - Contrôle: `checkForUpdates()`, `installUpdate()`
  - État: `updateAvailable`, `updateReady`, `updateProgress`
  - Modal: affiche progression du téléchargement + bouton "Redémarrer et installer"
  - Vérification toutes les 60 minutes + fetch initiale au démarrage
  - Dépendance: `electron-updater` install dans package.json
  - Repository field ajouté pour electron-updater (pointe vers GitHub releases)
- ✅ Updates automatiques
- BUG : j'arrive plus a ouvrir de fichier (`TreeItem onClick`) — ✅ CORRIGÉ (ajout `else { onSelect(node) }` pour les fichiers)
- ✅ Refonte git checkout
	- Clone HTTPS depuis l'app (URL + login/mot de passe optionnels)
	- Sélection du dossier destination
	- Clone + ouverture automatique du dossier cloné
- ✅ Modifier le placement du bouton icone dans les pages (au dessus du titre et pas a gauche)
- ✅ Ajouter le numero de version en petit qq part (affiché en en-tête)
- ✅ Quand on créé ou renomme un fichier giter la modification directement, pareil pour le déplacement d'un fichier dans un dossier et la suppression
- ✅ Est-ce qu'il y'a un darkmode pour l'emoji picker?
- ✅ Quand on écrit une commande "/" dans la première ligne le "/" reste, dans les autres lignes ça fonctionne
- ✅ désactiver le user-select dans le reste de l'interface (pas dans l'éditeur)
- ✅ Quand on colle du texte ne pas reprendre de mise en forme (j'ai copier qqch depuis un site internet et il a mis un fond blanc), on reprend que le texte brute (éventuellement le code markdown)
- ✅ Espacer un bcp plus en hauteur les paragraphes et les titre, les liste, etc...
- ✅ Quand je fais une commande "/" ça agit sur le bloc de text en dessus. Par exemple je fais un paragraphe je vais a la ligne je met la commande "titre 2" et mon paragraphe se transforme en titre deux. Cela ne dois affecter que la ligne courrante (corrigé: ciblage robuste du bloc courant, y compris curseur ancré sur la racine de l'éditeur)
- ✅ faire des scroll bar qui s'affiche seulement au survol de la div scrollable et plus dans un style moderne (iOS)
- ✅ Quand je fait un retour a la ligne dans une citation doit revenir a du texte normal


### 09.04.26
- ✅ Quand on colle du markdown dans l'éditeur WYSYWYG ça échappe le mardown. Est-ce qu'on pourrait juste coller en raw le text? Peux-être échapper tout ce qui est HTML au cas ou?
- ✅ Gérer un style pour titre 1 à 4
- ✅ Quand je tape une commande "/" dans la première ligne la commande est pas appliquée
- ✅ Quand je coche une tâche ça ne modifie pas le code à - [x], donc pas de sauvegarde
- ✅ Assombrir la couleur de fond quand y'a pas le focus sur la fenêtre
- ✅ Mettre une ombre a la fenêtre
- ✅ Quand on est dans un tableau et qu'on presse tab va a la case suivante, si c'est la dernière case -> a la ligne suivante, si c'est la dernière case de la dernière ligne -> crée une nouvelle ligne
- ✅ Pouvoir supprimer une ligne d'un tableau / Supprimer une colonne
- ✅ Ajouter des Tag (etiquette) aux document
- ✅Ajouter un panel "recherche" pour pouvoir chercher par contenu ou tag

- ✅ Panneau Settings
  - paramêtre git (name, email)
  - apikey chatgpt
  - prompt IA (on trouve un prompt idéal par défaut pour le makdown)
- ✅ Dans les tableau ajouter l'index de ligne 1,2,3,...
- ✅ Commandes manquante 
  - Séparateur
  - ✅ Lien
  - ✅ Insérer une image -> Prompt natif


#### Partie 2
- ✅ Bloc de code choix du language et code couleur (SQL, Typescript, Powershell, Javascript, ...)
- ✅ Scroll des tabulation horizontal (quand y'a trop de tab ça casse le layout)
- ✅ Bouton droite sur les tabs -> popup -> Fermer tout, Fermer les autres, Fermer a droite, Fermer a gauche
- ✅ La table des matière viens sur le texte du contenu (formaliser le layout)
- ✅ On peut pas faire clique droite sur un texte selectionné pour les correction orthographiques (workaround?)
- ✅ La fenetre electron ne réagit pas au layout windows. Je m'explique quand je fait Windows+Gauche elle ne s'adapte pas au comportement natif comme une autre fenêtre
- ✅ Quand on fait la command slash tableau focus dans la première cellule
- ✅ Dans les tableau : En tête colonne choix du type de colonne (Sauvegardé via un emoji?) (Nombre, Montétaire, Texte, Checkbox (Vrai/Faux), Date) Ligne de fin de tableau (nombre de ligne, nombre d'occurence)
- ✅ La commande "Tâche" n'est que accessible quand ont tape le circonflexe
- ✅ Ajouter l'ia dans les page (commande + sélection) (si l'api key a été configuré)


#### Partie 3
- ✅ Quand je fait une commande "/" ça affecte la ligne dessous bizarrement et pas juste la ligne courante
- ✅ CTRL+A dans un bloc de code sélectionne juste le code + Ajouter un bouton copier dans le presse papier
- ✅ Pouvoir coller un gros bout de code dans un bloc de code. Actuellement ça fait plusieurs bloc bizarre et en plus quand je change de language ça garde que la premier ligne
- ✅ Tableau Kanban en markdown (différencié par un emoji?) faire une structure de ticket/bloc kanban
- ✅ Quand on perd le focus la fenête deviens transparente et c'est pas hyper joli
- ✅ Pas de correction orthographique dans les bloc de code
- ✅ Possilbité de formater le code dans les bloc de code?


#### Partie 4
- ✅ Désactiver completement tout lien avec GITHUB (connexion, login). Le soft doit être purement git (UI rendue neutre Git: icône Git, clone sans login/password, messages d'erreur sans mention GitHub)
- ✅ Enlever le système de tabulation complètement (n'apporte pas grand chose a part des bugs)
- ✅ Bouton droite sur un fichier "Ouvrir dans une nouvelle fenêtre" Ouvre une nouvelle instance de holo (attention version windows, mac, linux) et ouvre le même dossier et ouvre le fichier (aussi dans la recherche de fichier)
- ✅ Le popup de commande slash doit s'adapter a la ligne de flotaison de l'app si il est plus bas que le moitié basse de l'app le popup doit s'afficher au dessus et inversément
- Verifier les intéractions git
  - ✅ On crée/renomme/supprime un fichier -> on le push direct
  - ✅ On CTRL+S/ sauvegarde un fichier -> on commit, push direct
  - ✅ On fait des beaux messages de commit genre USER::ADD::/DOSSIER/FICHIER
  - ✅ Quand on ouvre un fichier on fait une petite boucle de fetch (je suis pas sur de moi la dessus) pour savoir si y'a une modif -> Si y'en a une on bloque l'édition et on demande au mec de pull
  - ✅ Faut trouver un moyen pour fetch/pull le contenu a interval periodique pour que le contenu local soit a jour
  - L'idée c'est que meme un teubé qui sait juste utiliser Word puisse éditer des fichier sur git
- ✅ Changer le readme.md github en documentation utilisateur comme n'importe quel projet github open source. Avec des images (tu peux mettre des placeholder en attendant). Il faut que l'utilisateur comprenne ce que ça fait, les fonctionnalités, comment l'installer pas plus ... peut-être la tech stack
- ✅ Possibilité d'archiver un fichier
  - ✅ bouton droite sur le fichier archiver (avec confirmation)
  - ✅ disparait de l'arboresence de fichier (est-ce que c'est mieux le le déplacer physiquement dans un dossier caché .archive tout en concervant sa place ou il était dans l'arboresence au moment ou on veut le récupérer ou bettement on met un "." devant et on masque tout les fichier avec des "." devant)
  - ✅ toujours visible dans la recherche de fichier avec une différenciation (genre une icone et catégorisation "archive") avec possibilité de faire bouton/droite récupérer
- ✅ Intégrer Gemini comme on a fait pour openai
- ✅ Intégrer la possibilité de stocker les images ailleurs (ça veut dire gérer les liens, l'upload, etc...)
  - ✅ Intégrer au dépot git (non recommandé / par défaut) (fonctionne deja)
  - ✅ Via Azure blob storage (on doit fournir un SAS token)
  - ✅ Via dropbox (je sais pas si c'est possible mais ça serait cool)
  - ✅ Amazon S3 (je sais pas si c'est possible mais ça serait cool)
  - ✅ Google drive (je sais pas si c'est possible mais ça serait cool)
- ✅ le popup slash affiche 3 commande en hauteur et est scrollable (il prend trop de place en hauteur)


### 24.04.26
- ✅ En bas d'un tableau y'a un bouton "+ Nouvelle ligne" pour ajouter une ligne facilement
#### Feedback reçu
- Ajouter "Dupliquer" dans le menu contextuelle pour un fichier afin de dupliquer un fichier
- Les identifiants git ont disparu du popup pour cloner un repo. Comment je me log?
- Les paramêtres de stockage d'image sont par repo. Je pense que ce serait bien d'avoir un onglet qui s'affiche seulement quand un repo est ouvert qui montre ces settings. Ensuite on stock la méthode qqpart dans le repo genre dans .holo (si c'est pas deja fait) et la/les clef sont stocké localement seulement. Du coup si y'a une méthode mais pas de clef on demande dès l'ouverture du repo les info a saisir par rapport a la méthode de stockage. Ex J'ouvre mon repo (par défaut il est en mode stoackge des images intégré), je vais dans setting, je clique dans l'onglet "Dépot courant" je change le settings en Azure blob storage et je saisie les clef directement depuis la. Depuis un autre ordinateur j'ouvre le repo (un pull se fait si possible) et la il me demander de saisir les informations de connexion

#### ✅ Implémentation (27.04.26 - 27.04.26)

**1. Feature "Dupliquer"**
- ✅ Ajouté handler Electron `fs:copy-file` qui génère automatiquement un nom unique (ex: "file (copie).md", "file (copie 2).md")
- ✅ Exposé via `HoloApi.copyFile()` dans global.d.ts
- ✅ Ajouté preload bridge
- ✅ Intégré au contexte menu App.tsx avec action `copyPathTarget`
- ✅ Active le commit git automatique avec message "CREATE"

**2. Git Clone Dialog - Champs username/password**
- ✅ Restauré les champs d'authentification dans le formulaire clone
- ✅ Type `CloneDialog` étendu avec `username` et `password` (optionnels)
- ✅ Les identifiants sont passés au handler existant `git:clone-repository`
- ✅ Compatible avec `withOptionalCredentials()` pour injection dans l'URL

**3. Paramètres stockage d'images par repo**
- ✅ Ajouté handlers IPC pour `.holo.json`:
  - `holo:read-repo-config` - lit la config sauvegardée
  - `holo:write-repo-config` - persiste la config
- ✅ Onglet "Stockage d'images (par dépôt)" dans Settings (visible si repo ouvert)
- ✅ UI avec dropdown mode + bouton "Enregistrer configuration"
- ✅ Auto-charge `imageStorageMode` depuis `.holo.json` au moment d'ouvrir un repo
- ✅ Affiche message de confirmation "✓ Configuration sauvegardée dans .holo.json"
- ✅ Architecture prête pour la gestion locale des credentials (implémentation future)

**Build Status**: ✅ Compilation réussie (npm run build)
- ✅ les entête de tableau ne peuvent pas retourner a la ligne, si le tableau devient trop petit en largeur il scroll horizontalement (PAS TOUTE LA PAGE, JUSTE LE TABLEAU)
- ✅ les composant séparateur doivent être plus opaque (30%) et avoir un margin-y beaucoup plus grand
- ✅ Dans l'arboresance les fichier on un point a leur gauche (on dirait qu'ils ont besoin d'être sauvegardé dans les standard UX actuel), enlever le point
- ✅ Il faudrai que la configuration du stockage des image soit stocké dans le repo, je pense juste la méthode. Et du coup si la personne n'a pas saisie les infos d'authentification ça lui demande. Du coup c'est une config par repo
- ✅ L'ia ne marche pas (Gemini 404) — corrigé : modèle gemini-2.0-flash → gemini-1.5-flash
- ✅ Quand y'a un conflit git : 1. essayer de merge auto -> si c'est pas possible -> bloquer l'édition et proposer a l'utilisateur de prendre la version du serveur ou la sienne. J'aimerais bien avoir une petite UI pour résoudre les conflit comme 3ième possiblité je sais pas si y'a un NPM pour ça
- ✅ Pouvoir faire simplement des liens vers une autre page (lien relatif) avec une recherche de page


#### Partie 2
- ✅ Erreur dans la console

[dev:electron] [nodemon] starting `electron electron/main.js`
[dev:electron] Error occurred in handler for 'fs:read-file': Error: ENOENT: no such file or directory, open '/home/romane/Bureau/Dev/documentation/.holo.json'
[dev:electron]     at async open (node:internal/fs/promises:637:25)
[dev:electron]     at async Object.readFile (node:internal/fs/promises:1269:14)
[dev:electron]     at async Session.<anonymous> (node:electron/js2c/browser_init:2:116791) {
[dev:electron]   errno: -2,
[dev:electron]   code: 'ENOENT',
[dev:electron]   syscall: 'open',
[dev:electron]   path: '/home/romane/Bureau/Dev/documentation/.holo.json'
[dev:electron] }


- ✅ L'ui des tableau est a revoir, je pense qu'il faudrai faire un composant séparé puis vraiment se baser sur la structure des tableaux de loop
  - ✅ Avoir un composant react qui gère son exportation en temps réel en markdown
  - ✅ Possiblité de trier les colonnes A-z Z-a
  - ✅ Numero de ligne automatiques
  - ✅ pouvoir drag n drop des ligne et des colonnes
  - ✅ un bouton " + nouveau" Pour ajouter des lignes
  - ✅ choix du type de colonne (feinte avec les emoji pour le stockage en markdown)
  - ✅ Un truc propre moderne fluide et fonctionnel
  - ✅ Pas de resize de colonnes


  Code source de loop

  <div class="___1qz6dnu f1v06gxd fame7hh fsmxuu f1uyrjh9 f15zdokm feey33m" data-automation-id="table-wrapper-parent"><div class="___1433g86 fame7hh fy8hevw fggqd3p fvsv35q f9aunix f145xu2a f76dvjj ft6ph86 f9fzj27 f33bjtu fat2smr f17q8ojr f1a5t0k8" id="tableWrapper-0054c668-58c9-47a8-a47f-fbda0a235ed1" data-testid="tableWrapperTestId"><div aria-hidden="true"></div><div class="___fmno200 futbx7i f1tbhdm8 f1v06gxd f754odr f1wvkep4"><div class="___gtid8y0 f5t4ent f1x76le5 f63wovm fyxwf5c" style="z-index: 108;"><table class="___1fncelf f1ijyy5d fjm3hy2 f7aje91 f2drkr0 f5t4ent fr45f1k felhg1l f15x9tp7 f15og71f f1k7506g f1xdn521" data-automation-type="column-grabber-table" aria-hidden="true"><tbody><tr data-testid="column-grabber-row"><td class="___1mta2x9 fv5rc2c f1xyd4up ffgsluh f14l70jh f1drj5c3 fwsdmxv fq5of1d f2qyu4w fb7r3rb fhkpd6r f1410nsr" tabindex="-1" aria-hidden="true" data-testid="grabber-cell-id" style="width: 481.5px;"></td><td class="___1mta2x9 fv5rc2c f1xyd4up ffgsluh f14l70jh f1drj5c3 fwsdmxv fq5of1d f2qyu4w fb7r3rb fhkpd6r f1410nsr" tabindex="-1" aria-hidden="true" data-testid="grabber-cell-id" style="width: 320.5px;"></td></tr></tbody></table></div><table class="___1qcl5eu f1ijyy5d fjm3hy2 f1v06gxd f2drkr0 f5t4ent fhkpd6r felhg1l f1j1y1py f7mt992 f754odr f197x3dm f1siu4wg fqf43ob f12j4qdj f1ijnuf3 f1hpdshm f7rq7yg f6qqd7a fw6ngnj f1jwrb2f f1bmd6av fq179i2 f4lt0r6 f1xdn521 f1ko9gyc fvcc8fv" role="table" aria-labelledby="tableTitle-0054c668-58c9-47a8-a47f-fbda0a235ed1" id="table-0054c668-58c9-47a8-a47f-fbda0a235ed1" data-automation-type="user-data-table"><thead class="___14t8dop f1ko9gyc fvcc8fv f1u8ajlj f1687x81 f1wt0rey f1pwakru fllmocl"><tr role="row" data-rowid="HEADER_ROW_ID"><th class="___1gtztnz f1iij297 fa8le5s fioaasv f14l70jh f1x76le5 fr6s1wq f1jwrb2f felhg1l fr45f1k fk7rkz4 f19wpdvi fzv4ba2" aria-hidden="true" style="top: 0px; z-index: 0;"></th><th class="___1pnd06p f118pu2d fperjks fuu23rq f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1x76le5 f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r f1ny4ixx f11m1ea5 fs60klp fvfrssw felhg1l f9z1j88 fk7rkz4 f15hko96 fj9j6zz ftg8l7k f1lyku3d fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="columnheader" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-1" aria-sort="none" style="--cellTagWidth: 481.5px; top: 0px; z-index: calc(var(--tableRowIsHovered) * 1);"><div class="___1q3iuf0 f1bbawgi f11yim1u f12854ql f1j5q7c8 fhkpd6r f1vbozs4 f56uhul fcgk4bl f10y0qhk fweekm2 frn74tz f1xycfd1 f1klb9wa f1ujud0o f92ucng f1bacpg4 fhvkwv1" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div role="presentation" data-testid="columnHeaderSchematicWrapperId" class="___ys1hjt0 fma5ih6 f1at7rsr f1rz9l94 f11yim1u f1drj5c3 f1tbrtsv f1efbba5 f1dia40e" aria-label="Colonne 2"><svg data-testid="columnHeaderDataTypeIconId" data-automation-type="RichText" class="fui-Icon-filled ___v44iim0 f21mba3 f1w5d0u1 f4zu3n0 f2w2tea fq5of1d f1rmdg81 f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2.75 4.5a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75Zm0 3a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75ZM2 11.25c0-.41.34-.75.75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h9.5a.75.75 0 0 0 0-1.5h-9.5Z" fill="currentColor"></path></svg><svg data-testid="columnHeaderDataTypeIconId" data-automation-type="RichText" class="fui-Icon-regular ___8nzmdj0 f17bq0co f1w5d0u1 f4zu3n0 f2w2tea fq5of1d f1rmdg81 f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 5a.5.5 0 0 0 0 1h15a.5.5 0 0 0 0-1h-15Zm0 3a.5.5 0 0 0 0 1h15a.5.5 0 0 0 0-1h-15ZM2 11.5c0-.28.22-.5.5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5Zm.5 2.5a.5.5 0 0 0 0 1h10a.5.5 0 0 0 0-1h-10Z" fill="currentColor"></path></svg><div></div><div data-testid="fluidComponentCellTestId" class="___ts99kj0 fpowgh6 f11yim1u f1y25qq6 f3mxsgx f1vbozs4 fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___aibxhp0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts fjx51gl f17k5rst fhkpd6r f1z0yfqr f1izwvkw f19fj05r scriptor-instance-10" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2492" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar scriptor-line-clamping scriptor-canvas-clamp-first-line" contenteditable="false" style="position: relative; overflow: hidden; height: 100%; max-height: none; text-align: left; -webkit-line-clamp: 1; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Texte Cellule d'en-tête" aria-describedby="id__20" aria-haspopup="true" contenteditable="true" style="direction: ltr; outline: none; padding: 0.1px 0px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 600; color: inherit; line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph"><span class="scriptor-textRun scriptor-inline" lang="fr-fr">Colonne 2</span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"><div class="___1xkqm36 f14p31lw f4pdnzk f1iij297 fosmv9r f1v06gxd fzn5mwm f1qly8h5 fk46ydu ff8lpbg fa1tzj2 f3yudoe" data-testid="resize-element-wrapper"><div class="___4q87za0 fttuzpe f1iwj5sq f14iybne f1v06gxd f97ysk8 f1pa9nuw fhd4kze f1nq7gxm fx30tmd f1juw0eu f129ryj" data-testid="resize-element"></div></div></div></div></th><th class="___9kfzwj0 f118pu2d fperjks fuu23rq f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1x76le5 f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r f1ny4ixx f11m1ea5 fs60klp fvfrssw felhg1l f9z1j88 fk7rkz4 f15hko96 fj9j6zz ftg8l7k f1lyku3d fq179i2 fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="columnheader" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-0" aria-sort="none" style="--cellTagWidth: 320.5px; top: 0px; z-index: calc(var(--tableRowIsHovered) * 1);"><div class="___kx2mmd0 f1bbawgi f11yim1u f12854ql f1j5q7c8 fhkpd6r f1vbozs4 f56uhul fcgk4bl f10y0qhk fweekm2 frn74tz f1xycfd1 f1klb9wa f1ujud0o f92ucng f1bacpg4 fhvkwv1 fq179i2" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="cellDecorativeDivClass ___u7ixi90 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip fbczs62 fhglv9e" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"><div class="___4tb9fm0 f14p31lw f4pdnzk f1iij297 f1z0bkcj f1v06gxd fzn5mwm f1qly8h5 fhglv9e ff8lpbg ff9wkyt f3yudoe" data-testid="resize-element-wrapper"><div class="___4q87za0 fttuzpe f1iwj5sq f14iybne f1v06gxd f97ysk8 f1pa9nuw fhd4kze f1nq7gxm fx30tmd f1juw0eu f129ryj" data-testid="resize-element"></div></div></div><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div role="presentation" data-testid="columnHeaderSchematicWrapperId" class="___ys1hjt0 fma5ih6 f1at7rsr f1rz9l94 f11yim1u f1drj5c3 f1tbrtsv f1efbba5 f1dia40e" aria-label="Colonne 1"><svg data-testid="columnHeaderDataTypeIconId" data-automation-type="RichText" class="fui-Icon-filled ___v44iim0 f21mba3 f1w5d0u1 f4zu3n0 f2w2tea fq5of1d f1rmdg81 f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2.75 4.5a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75Zm0 3a.75.75 0 0 0 0 1.5h14.5a.75.75 0 0 0 0-1.5H2.75ZM2 11.25c0-.41.34-.75.75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h9.5a.75.75 0 0 0 0-1.5h-9.5Z" fill="currentColor"></path></svg><svg data-testid="columnHeaderDataTypeIconId" data-automation-type="RichText" class="fui-Icon-regular ___8nzmdj0 f17bq0co f1w5d0u1 f4zu3n0 f2w2tea fq5of1d f1rmdg81 f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 5a.5.5 0 0 0 0 1h15a.5.5 0 0 0 0-1h-15Zm0 3a.5.5 0 0 0 0 1h15a.5.5 0 0 0 0-1h-15ZM2 11.5c0-.28.22-.5.5-.5h15a.5.5 0 0 1 0 1h-15a.5.5 0 0 1-.5-.5Zm.5 2.5a.5.5 0 0 0 0 1h10a.5.5 0 0 0 0-1h-10Z" fill="currentColor"></path></svg><div></div><div data-testid="fluidComponentCellTestId" class="___ts99kj0 fpowgh6 f11yim1u f1y25qq6 f3mxsgx f1vbozs4 fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___aibxhp0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts fjx51gl f17k5rst fhkpd6r f1z0yfqr f1izwvkw f19fj05r scriptor-instance-11" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2491" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar scriptor-line-clamping scriptor-canvas-clamp-first-line" contenteditable="false" style="position: relative; overflow: hidden; height: 100%; max-height: none; text-align: left; -webkit-line-clamp: 1; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Texte Cellule d'en-tête" aria-describedby="id__21" aria-haspopup="true" contenteditable="true" style="direction: ltr; outline: none; padding: 0.1px 0px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 600; color: inherit; line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph"><span class="scriptor-textRun scriptor-inline" lang="fr-fr">Colonne 1</span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"><div class="___16rh7od f14p31lw f1numph9 f1iij297 fosmv9r f1v06gxd fzn5mwm f1qly8h5 f6l91vq ff8lpbg f3yudoe" data-testid="resize-element-wrapper"><div class="___4q87za0 fttuzpe f1iwj5sq f14iybne f1v06gxd f97ysk8 f1pa9nuw fhd4kze f1nq7gxm fx30tmd f1juw0eu f129ryj" data-testid="resize-element"></div></div></div></div></th></tr></thead><tbody class="___4z2jmw0 f4lt0r6 f1bmd6av f1ko9gyc fvcc8fv"><tr data-rowid="initialRow-0" data-testid="tableRowTestId" class="___1uoxxgj f1rit59f fk4t513 fum8ivm fn2ccdn f9j5pyl ft07a7b f1je68kr f1kjd1u3 f1em41i2 f1wvw0q1 fghk1w1 f1tkwd0y f102nrlo f28gs71 f9mrx02 f1tmpcg2 f1ul4qzw"><td class="___nwd3v80 f1drj5c3 f1o5h7gm f14l70jh fa8le5s f1x76le5 f1siu4wg f17jt0as fvm1biy fxgpl28 fl7jgs8 f1pi2lfg fhkpd6r f1aqmcc3 f1u80yca fzv4ba2 f169gp6z f1410nsr" tabindex="-1" aria-hidden="true" data-testid="grabber-cell-id" style="opacity: 1; z-index: calc(0 + (var(--tableRowIsHoveredOpacity) * 1));"><div data-testid="table-grabber-wrapper-testid" class="___1f1uhqx fma5ih6 f11yim1u frvgzbb fyycc9x f5t4ent fk7rkz4 fhm5q89 fl7jgs8 f17jt0as f1drj5c3 f1at7rsr fcsv874"><span role="presentation" class="___1eovaus frvgzbb f1mifsgk f1j5q7c8 fma5ih6 f1rufqe5 f9eils8 f1xajq6n f8uahcs f113i7m6 f4d1v3m f1e0w9ri f1s3w61g f1drj5c3 f2qyu4w f11yim1u f1ffsdts f1gddtzu" data-testid="table-grabber-testid" data-selected="false"><div class="___g40efs0 fobb36m f56uhul f1r0p54h f18as31l fo47zce f7ze8at frn74tz" data-testid="table-row-number-grabber-test-id">1</div><div class="___1oqvujt f1040e65 f72c9x fitqc43 f7bu50c"><svg class="___iga9im0 fma5ih6 f1w5d0u1 f13g0df7 f9d5n1x f16icbp0 f5wzh71" data-testid="table-row-grabber-test-id" fill="currentColor" aria-hidden="true" width="1em" height="1em" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 14.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM15 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"></path></svg></div></span><span class="___gh71i50 f6qut7n fma5ih6 f1drj5c3 f1jevulg frvgzbb fo47zce f1pn33r0 f1410nsr f1040e65" data-testid="insert-button-testid" data-icon-name="FFXCStatusCircleInner" style="order: 0; top: -9px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1em" height="1em" class="___bxeqr40 f4symwp ffryfig f1xfsomu fr45f1k felhg1l"><path d="M960 256q115 0 221 30t198 84 169 130 130 168 84 199 30 221q0 115-30 221t-84 198-130 169-168 130-199 84-221 30q-115 0-221-30t-198-84-169-130-130-168-84-199-30-221q0-115 30-221t84-198 130-169 168-130 199-84 221-30"></path></svg></span><span class="___gh71i50 f6qut7n fma5ih6 f1drj5c3 f1jevulg frvgzbb fo47zce f1pn33r0 f1410nsr f1040e65" data-testid="insert-button-testid" data-icon-name="FFXCStatusCircleInner" style="order: 2; bottom: -9px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1em" height="1em" class="___bxeqr40 f4symwp ffryfig f1xfsomu fr45f1k felhg1l"><path d="M960 256q115 0 221 30t198 84 169 130 130 168 84 199 30 221q0 115-30 221t-84 198-130 169-168 130-199 84-221 30q-115 0-221-30t-198-84-169-130-130-168-84-199-30-221q0-115 30-221t84-198 130-169 168-130 199-84 221-30"></path></svg></span></div></td><td class="___dxt5t00 f118pu2d fperjks f1vphpn5 f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1v06gxd f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r felhg1l frbt065 f19mvqtg fuj45j8 f1bun4z1 fn5xuxo f15hxrmx fk7rkz4 fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="cell" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-1" style="--cellTagWidth: 481.5px; scroll-margin-top: 0px; z-index: 7; --cellContentsPresenceBoxShadow: inset 0 0 0px 2px var(--colorPaletteRedBorderActive); --cellContentsPresenceHCBoxShadow: inset 0 0 0px 2px CanvasText;"><div class="___5ea9800 f11yim1u f1ffsdts f1tq12sr f193qmgf f1uwbliu f1bbawgi f12854ql f1j5q7c8 fhkpd6r f1vbozs4 f2o0zm8 f1s0zge1 fh87lcb fk7uvyw" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div></div><div data-testid="fluidComponentCellTestId" aria-label="Romane Donnet modifie également la cellule du tableau" class="___aaoept0 f1ffsdts f11yim1u fhkpd6r fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___4a97yu0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts f11yim1u f17k5rst fhkpd6r f1z0yfqr scriptor-instance-12" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2494" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar" contenteditable="false" style="position: relative; overflow: visible; height: 100%; max-height: none; text-align: left; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Cellule" aria-describedby="id__26" contenteditable="true" style="direction: ltr; outline: none; padding: 8px 10px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView scriptor-page-class-line-clamping" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 400; color: var(--ms-themeColorBodyText, var(--colorNeutralForeground1, var(--ms-themeColorPaletteNeutralPrimary, #323130))); line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph" lang="fr-fr"><span class="scriptor-textRun scriptor-inline scriptor-placeholder-aria-hidden" aria-hidden="true"></span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div><div data-testid="cellIconWrapperTestId" class="___1qng49x fma5ih6 frvgzbb f1ulvvlr f1410nsr f1tbrtsv fo47zce fop2izf f5t4ent f1uyrjh9 fmytrya f15x9tp7 f1ms5hnr"><div class="___fx8u6m0 f161fddt f1nns9k9"><div class="___1nkxt6e f1pe50rz f15q0it8 fma5ih6 f1drj5c3 frvgzbb f14p31lw f1ltry6m f18l2mnb fnmw4uj fw0i42b f14edmhv flz85iw" aria-hidden="true" data-testid="detailedItemIconTestId"><button type="button" tabindex="-1" class="fui-Button r1piff0w ___1rio4zm fu6safm fmrjy3i f114z1sh f98we5q fh7aqbb f1qe5xl8 f16bzlmw f7l96nu f1mlqyoo f1wyqtx f1ydpxhl fnw2paj f1efbba5 f1dia40e f3q6uje f1tzbmiy fyuafwn f1tkt595 fcf7tgq f1q6drqx f1gd4y6v f118yszu f18dccc5 f15g7o45 f12r34xd fvgu4vg f198oye4 fyz6zus f1p99hwk f85gm1x f596ufk fq6zg74 f1srv8by fx2lf0v f1rmdg81 fq5of1d fs4vl18 f18cg5g8 f18021ez f1gj7h7a f1g8a1sb f1j2iyxw f1gvp5r0 f1p0n9bk f8ex8vn f1u1es64 f1et2ffl f50251n f12v1yfz f11dikxv fr45f1k felhg1l fk7rkz4" aria-label="Ouvrir l’affichage détaillé"><span class="fui-Button__icon r8kx7i2 ___w8vc9u0 fcpsjp6 fq5of1d f1rmdg81 f1fhid2k"><svg class="fui-Icon-filled ___96w9xh0 f21mba3 f1w5d0u1 f5wzh71" fill="currentColor" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 6.25C3 4.45 4.46 3 6.25 3h11.5C19.55 3 21 4.46 21 6.25v11.5c0 1.8-1.46 3.25-3.25 3.25H6.25A3.25 3.25 0 0 1 3 17.75V6.25ZM13.5 9.5l-5.28 5.22a.75.75 0 1 0 1.06 1.06l5.22-5.17v4.64a.75.75 0 1 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0 0 1.5h4.74Z" fill="currentColor"></path></svg><svg class="fui-Icon-regular ___f0ys530 f17bq0co f1w5d0u1 f5wzh71" fill="currentColor" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.25 3A3.25 3.25 0 0 0 3 6.25v11.5C3 19.55 4.46 21 6.25 21h11.5c1.8 0 3.25-1.46 3.25-3.25V6.25C21 4.45 19.54 3 17.75 3H6.25ZM4.5 6.25c0-.97.78-1.75 1.75-1.75h11.5c.97 0 1.75.78 1.75 1.75v11.5c0 .97-.78 1.75-1.75 1.75H6.25c-.97 0-1.75-.78-1.75-1.75V6.25ZM8.75 9.5h4.74l-5.27 5.22a.75.75 0 1 0 1.06 1.06l5.22-5.17v4.64a.75.75 0 0 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0 0 1.5Z" fill="currentColor"></path></svg></span></button></div></div></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div><div role="presentation" class="cellDecorativeDivClass ___tik5si0 fo47zce fxaacm3 f1tbhdj0 f1rmdg81 fq5of1d fj2webn f1i7iok0 f123auf8 f123oiss f13k87vq fiuqsix f18yor1l f1ikeipu f17x7tyq f1b68qe0 fg9sns8 f10r25dv" data-testid="presenceTestId"><div class="___13tnryl fo47zce f1rmdg81 fq5of1d f100mjip fma5ih6 f4gsckp f1i7iok0 f9067k7 f1uyrjh9 frpdfbs f1exqyar f1ikeipu f17x7tyq f1jo96dz f15ky2eq f1f1vt3c" style="--presencePositionerJustifyContent: initial; --presencePositionerZIndex: 1; --presencePositionerCoauthorIndex: 0; --presencePositionerLeft: 0px;"><div class="___1vsh3lk f596ufk fxx2k9a f1drj5c3 fo47zce fq5of1d fzl3b3d f1t3tbxf f1ud07zz f1pn33r0 f19fj05r f10g8kdu f1au4q8s f11xxq58 f5wzh71" style="display: flex; align-items: center; justify-content: center; background-color: var(--colorPaletteRedBorderActive); max-width: 20px; min-width: 20px;"><span class="___1wfxhto f1v06gxd fvhux3p fxx2k9a f1tk1g8w f149pbe9 f174g23v f1gyw35w f19lx8xm fg3xav">RD</span></div></div></div></div></td><td class="___kwasmc0 f118pu2d fperjks fuu23rq f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1v06gxd f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r f19mvqtg fuj45j8 f1bun4z1 fn5xuxo felhg1l f15hxrmx fk7rkz4 fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="cell" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-0" style="--cellTagWidth: 320.5px; scroll-margin-top: 0px; z-index: calc(var(--tableRowIsHovered) * 1);"><div class="___1uz9yr0 f1bbawgi f11yim1u f12854ql f1j5q7c8 fhkpd6r f1vbozs4" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="cellDecorativeDivClass ___u7ixi90 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip fbczs62 fhglv9e" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div></div><div data-testid="fluidComponentCellTestId" aria-label="" class="___aaoept0 f1ffsdts f11yim1u fhkpd6r fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___4a97yu0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts f11yim1u f17k5rst fhkpd6r f1z0yfqr scriptor-instance-13" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2493" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar" contenteditable="false" style="position: relative; overflow: visible; height: 100%; max-height: none; text-align: left; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Cellule" aria-describedby="id__28" contenteditable="true" style="direction: ltr; outline: none; padding: 8px 10px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView scriptor-page-class-line-clamping" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 400; color: var(--ms-themeColorBodyText, var(--colorNeutralForeground1, var(--ms-themeColorPaletteNeutralPrimary, #323130))); line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph" lang="fr-fr"><span class="scriptor-textRun scriptor-inline scriptor-placeholder-aria-hidden" aria-hidden="true"></span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div><div data-testid="cellIconWrapperTestId" class="___1qng49x fma5ih6 frvgzbb f1ulvvlr f1410nsr f1tbrtsv fo47zce fop2izf f5t4ent f1uyrjh9 fmytrya f15x9tp7 f1ms5hnr"></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div></div></td></tr><tr data-rowid="initialRow-1" data-testid="tableRowTestId" class="___1uoxxgj f1rit59f fk4t513 fum8ivm fn2ccdn f9j5pyl ft07a7b f1je68kr f1kjd1u3 f1em41i2 f1wvw0q1 fghk1w1 f1tkwd0y f102nrlo f28gs71 f9mrx02 f1tmpcg2 f1ul4qzw"><td class="___4zf2ui0 f1drj5c3 f1o5h7gm f14l70jh fa8le5s f1x76le5 f1siu4wg f17jt0as fvm1biy fxgpl28 f1bmd6av f184jo0a fhkpd6r f1h7m24y f1u80yca fzv4ba2 f169gp6z f1410nsr" tabindex="-1" aria-hidden="true" data-testid="grabber-cell-id" style="opacity: 1; z-index: calc(0 + (var(--tableRowIsHoveredOpacity) * 1));"><div data-testid="table-grabber-wrapper-testid" class="___x7svkl0 fma5ih6 f11yim1u frvgzbb fyycc9x f5t4ent fk7rkz4 fhm5q89 f1hswilw f17jt0as f1drj5c3 f1at7rsr fcsv874"><span role="presentation" class="___1yuiskv frvgzbb f1mifsgk f1j5q7c8 fma5ih6 f1rufqe5 f9eils8 f1xajq6n f8uahcs f113i7m6 f4d1v3m f1e0w9ri f1s3w61g f1drj5c3 f2qyu4w f11yim1u f1ffsdts f1hswilw" data-testid="table-grabber-testid" data-selected="false"><div class="___g40efs0 fobb36m f56uhul f1r0p54h f18as31l fo47zce f7ze8at frn74tz" data-testid="table-row-number-grabber-test-id">2</div><div class="___1oqvujt f1040e65 f72c9x fitqc43 f7bu50c"><svg class="___iga9im0 fma5ih6 f1w5d0u1 f13g0df7 f9d5n1x f16icbp0 f5wzh71" data-testid="table-row-grabber-test-id" fill="currentColor" aria-hidden="true" width="1em" height="1em" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M6.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm0 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 14.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM15 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM13.5 16a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" fill="currentColor"></path></svg></div></span><span class="___gh71i50 f6qut7n fma5ih6 f1drj5c3 f1jevulg frvgzbb fo47zce f1pn33r0 f1410nsr f1040e65" data-testid="insert-button-testid" data-icon-name="FFXCStatusCircleInner" style="order: 0; top: -9px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1em" height="1em" class="___bxeqr40 f4symwp ffryfig f1xfsomu fr45f1k felhg1l"><path d="M960 256q115 0 221 30t198 84 169 130 130 168 84 199 30 221q0 115-30 221t-84 198-130 169-168 130-199 84-221 30q-115 0-221-30t-198-84-169-130-130-168-84-199-30-221q0-115 30-221t84-198 130-169 168-130 199-84 221-30"></path></svg></span><span class="___gh71i50 f6qut7n fma5ih6 f1drj5c3 f1jevulg frvgzbb fo47zce f1pn33r0 f1410nsr f1040e65" data-testid="insert-button-testid" data-icon-name="FFXCStatusCircleInner" style="order: 2; bottom: -9px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1em" height="1em" class="___bxeqr40 f4symwp ffryfig f1xfsomu fr45f1k felhg1l"><path d="M960 256q115 0 221 30t198 84 169 130 130 168 84 199 30 221q0 115-30 221t-84 198-130 169-168 130-199 84-221 30q-115 0-221-30t-198-84-169-130-130-168-84-199-30-221q0-115 30-221t84-198 130-169 168-130 199-84 221-30"></path></svg></span></div></td><td class="___kwasmc0 f118pu2d fperjks fuu23rq f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1v06gxd f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r f19mvqtg fuj45j8 f1bun4z1 fn5xuxo felhg1l f15hxrmx fk7rkz4 fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="cell" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-1" style="--cellTagWidth: 481.5px; scroll-margin-top: 0px; z-index: calc(var(--tableRowIsHovered) * 1);"><div class="___1uz9yr0 f1bbawgi f11yim1u f12854ql f1j5q7c8 fhkpd6r f1vbozs4" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div></div><div data-testid="fluidComponentCellTestId" aria-label="" class="___aaoept0 f1ffsdts f11yim1u fhkpd6r fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___4a97yu0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts f11yim1u f17k5rst fhkpd6r f1z0yfqr scriptor-instance-14" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2496" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar" contenteditable="false" style="position: relative; overflow: visible; height: 100%; max-height: none; text-align: left; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Cellule" aria-describedby="id__30" contenteditable="true" style="direction: ltr; outline: none; padding: 8px 10px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView scriptor-page-class-line-clamping" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 400; color: var(--ms-themeColorBodyText, var(--colorNeutralForeground1, var(--ms-themeColorPaletteNeutralPrimary, #323130))); line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph" lang="fr-fr"><span class="scriptor-textRun scriptor-inline scriptor-placeholder-aria-hidden" aria-hidden="true"></span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div><div data-testid="cellIconWrapperTestId" class="___1qng49x fma5ih6 frvgzbb f1ulvvlr f1410nsr f1tbrtsv fo47zce fop2izf f5t4ent f1uyrjh9 fmytrya f15x9tp7 f1ms5hnr"><div class="___fx8u6m0 f161fddt f1nns9k9"><div class="___1nkxt6e f1pe50rz f15q0it8 fma5ih6 f1drj5c3 frvgzbb f14p31lw f1ltry6m f18l2mnb fnmw4uj fw0i42b f14edmhv flz85iw" aria-hidden="true" data-testid="detailedItemIconTestId"><button type="button" tabindex="-1" class="fui-Button r1piff0w ___1rio4zm fu6safm fmrjy3i f114z1sh f98we5q fh7aqbb f1qe5xl8 f16bzlmw f7l96nu f1mlqyoo f1wyqtx f1ydpxhl fnw2paj f1efbba5 f1dia40e f3q6uje f1tzbmiy fyuafwn f1tkt595 fcf7tgq f1q6drqx f1gd4y6v f118yszu f18dccc5 f15g7o45 f12r34xd fvgu4vg f198oye4 fyz6zus f1p99hwk f85gm1x f596ufk fq6zg74 f1srv8by fx2lf0v f1rmdg81 fq5of1d fs4vl18 f18cg5g8 f18021ez f1gj7h7a f1g8a1sb f1j2iyxw f1gvp5r0 f1p0n9bk f8ex8vn f1u1es64 f1et2ffl f50251n f12v1yfz f11dikxv fr45f1k felhg1l fk7rkz4" aria-label="Ouvrir l’affichage détaillé"><span class="fui-Button__icon r8kx7i2 ___w8vc9u0 fcpsjp6 fq5of1d f1rmdg81 f1fhid2k"><svg class="fui-Icon-filled ___96w9xh0 f21mba3 f1w5d0u1 f5wzh71" fill="currentColor" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 6.25C3 4.45 4.46 3 6.25 3h11.5C19.55 3 21 4.46 21 6.25v11.5c0 1.8-1.46 3.25-3.25 3.25H6.25A3.25 3.25 0 0 1 3 17.75V6.25ZM13.5 9.5l-5.28 5.22a.75.75 0 1 0 1.06 1.06l5.22-5.17v4.64a.75.75 0 1 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0 0 1.5h4.74Z" fill="currentColor"></path></svg><svg class="fui-Icon-regular ___f0ys530 f17bq0co f1w5d0u1 f5wzh71" fill="currentColor" aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.25 3A3.25 3.25 0 0 0 3 6.25v11.5C3 19.55 4.46 21 6.25 21h11.5c1.8 0 3.25-1.46 3.25-3.25V6.25C21 4.45 19.54 3 17.75 3H6.25ZM4.5 6.25c0-.97.78-1.75 1.75-1.75h11.5c.97 0 1.75.78 1.75 1.75v11.5c0 .97-.78 1.75-1.75 1.75H6.25c-.97 0-1.75-.78-1.75-1.75V6.25ZM8.75 9.5h4.74l-5.27 5.22a.75.75 0 1 0 1.06 1.06l5.22-5.17v4.64a.75.75 0 0 0 1.5 0v-6.5a.75.75 0 0 0-.75-.75h-6.5a.75.75 0 0 0 0 1.5Z" fill="currentColor"></path></svg></span></button></div></div></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div></div></td><td class="___1llg9fh f118pu2d fperjks f1vphpn5 f1j5fh05 fych19d f1ud07zz fu7chea ffgqbkp f14l70jh f1v06gxd f11yim1u f1iv985b f1u80yca f169gp6z fhkpd6r f19mvqtg fuj45j8 f1bun4z1 fn5xuxo felhg1l f15hxrmx fk7rkz4 f4lt0r6 fmokcq0 f14k6o9j fcduh3p f1gkuizk fq2kpqv f15vil8d" role="cell" data-testid="tableCellWrapperTestId" data-columnid="initialColumn-0" style="--cellTagWidth: 320.5px; scroll-margin-top: 0px; z-index: calc(var(--tableRowIsHovered) * 1);"><div class="___lmabi80 f1bbawgi f11yim1u f12854ql f1j5q7c8 fhkpd6r f1vbozs4 f4lt0r6" data-automation-type="table-cell-presence-indicator" style="min-width: 56px;"><div class="cellDecorativeDivClass ___u7ixi90 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip fbczs62 fhglv9e" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div><div class="___1h71nd5 f11yim1u fm2qoji f10i24s9 f1dpvo5l f1al7hir"><div></div><div data-testid="fluidComponentCellTestId" aria-label="" class="___aaoept0 f1ffsdts f11yim1u fhkpd6r fmbgnig f1tl34yf f17uthrg fejaule fzjsq9e f1sxwpoi" hosting-element="hosting-element"><div data-testid="fluidComponentNestedCellTestId" class="___4a97yu0 f1j6ou4f fhhqpb5 f1pig4th f1lrl8ps f1tbrtsv f1ffsdts f11yim1u f17k5rst fhkpd6r f1z0yfqr scriptor-instance-15" data-fluid-id="126c4656-d777-4869-8b12-70b9dbfa2495" style="background-color: transparent;"><div translate="no" class="scriptor-canvas focus-container scriptor-no-scrollbar" contenteditable="false" style="position: relative; overflow: visible; height: 100%; max-height: none; text-align: left; background-color: transparent;"><div spellcheck="false" autocapitalize="sentences" writingsuggestions="false" autocomplete="off" tabindex="0" data-gramm_editor="false" class="scriptor-pageContainer" role="textbox" aria-label="Cellule" aria-describedby="id__32" contenteditable="true" style="direction: ltr; outline: none; padding: 8px 10px; visibility: visible; background-color: transparent;"><div class="scriptor-pageFrame scriptor-firstPage scriptor-simpleView scriptor-page-class-line-clamping" data-dbg-pageindex="0" style="position: relative; background-color: transparent; height: auto; left: 0px; right: 0px; margin-left: auto; margin-right: auto;"><div class="scriptor-pageBody scriptor-simpleViewPage" style="font-family: var(--fontFamilyBase, var(--fontFamilyBase, var(--ms-themeFontFamilyBody, Segoe UI, Segoe UI Emoji, sans-serif))); font-size: var(--ms-themeFontSizeBody, var(--fontSizeBase300, 14px)); font-weight: 400; color: var(--ms-themeColorBodyText, var(--colorNeutralForeground1, var(--ms-themeColorPaletteNeutralPrimary, #323130))); line-height: var(--ms-themeLineHeightBody, var(--lineHeightBase400, 20px)); width: 100%; widows: 1; orphans: 1;"><div class="scriptor-paragraph" lang="fr-fr"><span class="scriptor-textRun scriptor-inline scriptor-placeholder-aria-hidden" aria-hidden="true"></span><br class="scriptor-EOP"></div></div></div></div></div></div></div></div><div data-testid="cellIconWrapperTestId" class="___1qng49x fma5ih6 frvgzbb f1ulvvlr f1410nsr f1tbrtsv fo47zce fop2izf f5t4ent f1uyrjh9 fmytrya f15x9tp7 f1ms5hnr"></div><div class="cellDecorativeDivClass ___1yr9ip0 f1xvyvka ft1bmfs fo47zce f63wovm f1a1xdwg f4qomhb f1tbrtsv f97ysk8 f1j1buxy f10632ip ffbqln0 fa1tzj2" tabindex="-1" data-automation-type="table-column-resize-element" aria-hidden="true" style="outline: none;"></div></div></td></tr></tbody><tfoot class="___7qhowd0 f1v06gxd f1ps2s51"></tfoot></table><div class="___wjksb00 fo47zce fdybe9z f17bq0co f11yim1u f1uyrjh9 fbczs62 fhglv9e fbkf23r" data-testid="gradientLeftTestId" style="z-index: 109; width: 0px;"></div><div class="___1gn7jcr fo47zce fdybe9z f17bq0co f11yim1u f1uyrjh9 fa1tzj2 fop2izf faw8i82" data-testid="gradientRightTestId" style="z-index: 109; width: 12px;"></div></div></div><button type="button" role="button" class="fui-Button r1piff0w ___1xs0jym ff6zk9 fmrjy3i f114z1sh f98we5q fh7aqbb f15km9nb f1ahv24h f7l96nu f1mlqyoo f1wyqtx f1ydpxhl fvvxti7 f1efbba5 f1dia40e fkpk9rl f18s6ezx f1tzbmiy fyuafwn f1tkt595 fcf7tgq fo4g65p f1gd4y6v f118yszu fqeq71u f15g7o45 f1m1q930 fvgu4vg f1q0a5sb f7rdcz1 fp9akmo f8ebmxv f1wbl5e4 f1w6wmk4 fwo3uk0 fbpg9m6 f3h6u1t fuipobn f14w07kd fpudsyl fu5zkp8 fryd24g f1d5jlm0 fryyj9k f9zkqyf f1ywunqs f1271uqt f1km60gw fodv1b2 f1hlsglz f1n0yrb4 f10bvzmx fp5w1bm fulowbm f754odr f1tbrtsv f1t66w2o f1w0xleg fetd9ch fxdfa6d f169g6l f1r4vmh6 fp8zw93 f1l9mi64 fjvue7b flwrin0 f1q8kjct f1fw6703 f1qm10i3 f1u4v370 f1i4y8u1 f19ltx9a" tabindex="-1" aria-label="Ajouter une nouvelle ligne" data-testid="addNewRowTestId" style="margin-bottom: 4px;"><span class="fui-Button__icon r8kx7i2 ___1k9ejaf fzawmts"><svg class="fui-Icon-filled ___w10a2q0 f21mba3 f1w5d0u1 f113i7m6 ft1b8kb fz67vqz f12tu5af f9u5mae f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.25c.41 0 .75.34.75.75v6.25H17a.75.75 0 0 1 0 1.5h-6.25V17a.75.75 0 0 1-1.5 0v-6.25H3a.75.75 0 0 1 0-1.5h6.25V3c0-.41.34-.75.75-.75Z" fill="currentColor"></path></svg><svg class="fui-Icon-regular ___167e48d f17bq0co f1w5d0u1 f113i7m6 ft1b8kb fz67vqz f12tu5af f9u5mae f5wzh71" fill="currentColor" aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2.5c.28 0 .5.22.5.5v6.5H17a.5.5 0 0 1 0 1h-6.5V17a.5.5 0 0 1-1 0v-6.5H3a.5.5 0 0 1 0-1h6.5V3c0-.28.22-.5.5-.5Z" fill="currentColor"></path></svg></span><span class="___bmakn70 f1nnj3ma">Nouveau</span></button></div>



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


### 27.04.26
- ✅ Ajouter "Dupliquer" dans le menu contextuelle pour un fichier afin de dupliquer un fichier
- ✅ Les identifiants git ont disparu du popup pour cloner un repo. Comment je me log?
- ✅ Les paramêtres de stockage d'image sont par repo. Je pense que ce serait bien d'avoir un onglet qui s'affiche seulement quand un repo est ouvert qui montre ces settings. Ensuite on stock la méthode qqpart dans le repo genre dans .holo (si c'est pas deja fait) et la/les clef sont stocké localement seulement. Du coup si y'a une méthode mais pas de clef on demande dès l'ouverture du repo les info a saisir par rapport a la méthode de stockage. Ex J'ouvre mon repo (par défaut il est en mode stoackge des images intégré), je vais dans setting, je clique dans l'onglet "Dépot courant" je change le settings en Azure blob storage et je saisie les clef directement depuis la. Depuis un autre ordinateur j'ouvre le repo (un pull se fait si possible) et la il me demander de saisir les informations de connexion


#### Partie 2
- Quand je modifie les settings de stockage d'image il faudrai push .holo pour sauvegarder en remote
- Possibilité de changer les icônes des dossiers (sauvegarder dans .holo). Bouton droite -> Changer d'icone -> Popup de choix (Et push le fichier)
- Enlever le paramêtre Images > Stockage des images (Global) le paramêtre par dépot suffit
- Les popup de dropdown dans les settings sont pas adapté au thème darkmode
- permettre d'ouvrir un fichier .md avec holo (ouvre le dossier parent et ouvre le fichier correspondant)
- permettre d'ouvrir un lien avec holo (pas sur de moi mais on devrait pouvoir faire holo://NOMDUREPO/DOSSIER/FICHIER.md) comme ça je peux envoyer des liens a ouvrir dans la doc via slack/teams. Si le repo n'existe pas dire (aucun dépot correspondant trouvé)


### 28.04.26
- Sur windows, en mode fenêtre agrandie, quand on drag le header vers le bas ne correspond pas a l'ux des autres app windows. Quand on drag vers le bas la fenêtre sors du mode fullscreen et passe en mode restaure ce qui permet de la déplacé. (sous linux cette feature marche très bien)