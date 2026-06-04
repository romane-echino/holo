# feedback des collègues

## Phase 1
✅ Popup de départ -> settings -> nom prénom disparus

✅ un block vide doit TOUJOURS etre en bas de page
✅ CTRL+A + backspace (CTRL+A Doit selectionner tout les block)
✅ Dans la command palette qui je perds le focus sur l'input je peux plus faire ESC pour fermer
✅ Coller du MD ne marche pas
✅ Afficher le chemin relatif toujours dans le popup création fichier meme dans nouveau fichier ici
✅ Si je sélectionne ou plusieurs block et que je copie CTRL+C ça met le markdown correspondant des block dans le presse papier
✅ Dans space panel les onglet "récent" et "favoris" n'ont pas l'aire implémenté

✅ en affichage brute y'a deux scroll, editor frame et le texte area. Il faut en enlever au moins un


# Phase 2
✅Le popup d'onboarding apparait a chaque démarrage alors que j'ai saisie mes infos.
✅Quand je change la configuration de l'espace (ça modifie .holo.json) il faut aussi le sync avec git
✅Il faudrai que la barre sticky dans editor frame ai les meme bouton et pas avoir du code redondant. ce qui serait fun c'est que le header se transforme en sticky au scroll

✅Ne marche pas :j'ai crée un fichier mis un tag, j'ai essayé de le rechercher mais il ne l'a pas trouvé. Les tags des fichiers ne sont pas recherchable
    - (focaliser sur les nom de fichier -> les titre -> les tags -> la description -> les titre dans le contenu -> le contenu (ordre de pertinance / rank pour le tri))
✅Ne marche pas : Lien de partage ne marche pas -> l'idée c'est que dans l'ancien software on pouvait générer un URI pour le coller dans une conversation teams afin d'ouvrir holo et le bon dossier bon fichier, il y'avait une erreur si la personne n'avais pas l'espace correpondant
✅Ne marche pas :Drag sort les blocks -> Dans l'idéale il faudrai pour chaque bloc un drag-handle pour qu'on puisse glisser déplacer et réordrer les blocks en adaptant le markdown



# Phase 3
✅Voir les tags du fichier dans la recherche. Est-ce qu'il serait pas opportun de créer un truc in-ram ou in-file (par espace) pour l'indexation des fichiers pour aider a la recherche? Je pose la question mais j'en sais rien du tout. Parce que la, dernier test, j'ai démarrer le programme fait une recherche directement et j'ai aucun fichier
✅Changer le texte de la version pour l'adapter a la version actuelle dans le header de l'app
✅Pourvoir Couper CTRL+X (Mettre le MD dans le presse papier)
✅DELETE la touche ne fonctionne pas
✅Ne marche pas : Possibité de créer 1 block dans une cellule de tableau (ça veut dire que chaque cellule est un bloc unique inline ou on peut faire des commande)
✅Le drag-sort fonctionne mais est un peu délicat et pas pratique en terme UX

# Phase 4
✅ Pouvoir faire un système meilleure pour le CTRL+Z dans l'editeur (et CTRL+Y redo)
Comportement de la fenêtre sous windows
    - Quand on drag la fenêtre pas possibilité de la coller vers le haut pour l'agrandir en pleine écran (comportement standard windows)
    - Les touches COMMAND+GAUCHE (droite haut bas) ne marche pas sur windows pour positionner la fenêtre
✅ DELETE dans un block vide le supprimer et met le curseur dans le premier caractère du bloc suivant
✅ Coller le markdown dans un bloc ne marche plus?
✅ Réimplémenter le système de modèle (template)
    - Menu contextuelle spacepanel et editor frame -> Etablir en tant que modèle
    - quand on crée un fichier possibilité de choisir a partir d'un modèle
    - possibilité dans le modèle d'ajouter des variable $NOM $DATE qui lors de la création sont demandée (remplissage facultatif, si vide remplacer par vide)
    - Voir dans l'arboresence si le fichier est un modèle 
✅Pour le drag-sort le handle est parfait c'est surtout la zone de dépot qui est pas très visuel (petite) et clignote tellement c'est petit

# Phase 5
✅Lien relatif vers des documents du meme espace, quand je selectionn du texte et que je met "lien" il faudrai avoir un search pour les page de l'espace courant
✅Le curseur textsize n'adapte pas les tableau
✅Depuis qu'il y'a la sélection des blocs (drag-select) c'est moins facile de selectionner du text il faudrai que le drag-select de bloc s'active seulement si je sort du bloc avec la souris
✅Dans la recherche je vois pas les tags des fichiers
✅Pouvoir coller une image du presse-papier
✅Dans les cellule le tableau le placeholder "Saisir..." est mal placé (pas centré verticalement, manque le padding left)

# Phase 6
✅Clique droite sur un fichier -> Ajouter "Définir comme modèle"
✅Afficher un tooltip sur les liens qui montre le lien et suggèrer / implémenter CTRL+Clique gauche pour ouvrir un liens (si relatif -> ouvre le fichier désigné / si absolu -> ouvre le lien dans un navigateur)

 
# Phase 7
✅Dans les tableau dans la case a la plus a gauche (ou on peut hover pour supprimer la ligne), ajouter le numéro de la ligne 1,2,3...
✅Nouvelle systématique de largeur de colonne nécessaire :  Les tableau qui prennent toute la largeur quand il ont 1-2 colonne ne dérange pas fondamentalement mais ceux qui on plus de colonne et qui dépasse la largeur de la frame et qui commence a scroll pourrait être optimisé pour s'adapter a leur contenu
✅Selectionner plus cellule / plusieur ligne d'un tableau et pouvoir les copy paste et pouvoir supprimer leur contenu avec DELETE


# Phase 8 
✅ Click scroll dans la table des matière + 64px (l'item ciblé par le scroll est sous le sticky header)
✅ Pour les liens : Le cursor pointer n'apparait que quand je presse CTRL et il faut que le tooltip s'affiche plus rapidement
✅Si j'ai un bloc tableau (uniquement) sélectionné et que je presse ENTER crée une ligne vide après le tableau
Si dans un tableau j'ai une séléction de cellule et que je clique sur une cellule a l'interieur de la sélection -> enleve la selection


# Phase 9
✅Refonte activité dans l'inspecteur :
    - voir les derniers commit ne sers pas a grand chose.
    - Est-ce que c'est possible de voir les ajouts de lignes ex
        - Romane, il y a 5 minutes, +5 ligne -10 lignes
        avec un petit aperçu des lignes ajoutée (avec un max char parce que ça sert a rien de tout afficher)
    - Faire que la frame inspecteur soit en hauteur 50/50 entre la partie du haut (table de matière/Liens/...) et partie basse activité
    - Que si je clique sur l'activité ouvre le repo git au bon commit
✅ Dans la table de matière
    1. l'indentation n'est pas très jolie
    2. j'ai trouvé un bug quand plusieurs titre on le meme nom (j'ai 3x le titre bonjour) et la table des matière au clique scroll toujours sur le premier
✅Dans l'onglet lien de l'inspecteur
 quand je clique sur un lien relatif ça ne marche pas
 Y'a les images c'est super mais ça serait cool d'avoir un thumbnail et quand on clique dessus d'avoir un aperçu
 Globalement les liens dans ce panneau ne sont pas jolie
    On comprend pas qu'on peut clique dessus
    Y'a pas d'icone pour différencier les type de liens
✅ Dans l'onglet "Notes" du meme panneau les notes devrait être cliquable et ça scroll dessus.
✅ Le composant Note mériterais d'être améliorer pour faire des notes avec des type (Info, Warning, Error, Success). On pourrait stocké dans le markdown un emoji pour la persistance. Voir l'identifiant de la note dans l'editeur n'est pas interessant

Sur windows, dans space panel, les onglet favoris et récents ne fonctionne pas
Sur windows, lors de la sauvegarde dans l'editeur, une erreur pop index-wojeKxRt.js:500 [App2] Impossible de sauvegarder le fichier : Error: Error invoking remote method 'fs:write-file': Error: Chemin hors du dossier ouvert.
✅  Si je clique sur le grip a coté d'un bloc sans drag -> sélectionne le bloc
✅ Dans les tableau le colonnes doivent avoir une largeur max raisonnalbe et mettre le contenu a la ligne

# Phase 10
✅ Dans l'inspecteur, onglet liens, les liens relatif on encore un soucis et j'imagine que c'est a cause du nom de fichier [liens relatifs](<Test Romane.md>) l'espace ou qqch du genre
    <div class="mt-1 truncate text-xs text-holo-text-faint">&lt;Test</div>
✅ Dans l'inspecteur, onglet liens, les images non-externe (sauvegardé dans /images ne s'affiche ni dans le thumbnail ni dans le preview au clic)
✅ Pour le composant "Note" il faudrai faire une meilleure UI belle pour des info-bulles, avec si on clique sur l'icone un drop down pour changer le type (avec la persistance markdown avec un emoji) avec le support de Info (par défaut), Succès, Avertissement, Erreur comme type
✅ Dans les tableau si y'a plus que 3 colonnes les colonnes s'adapte a son contenu


# Phase 11

- ✅ Optimiser les annulations dans l'editeur : Je dois pouvoir vraiment annuler une vingtaine d'action. Vraiment faire une gestion d'historiques des actions
- ✅ Quand je clique sur Créer un fichier a partir d'un modèle -> Le popup apparait -> Si il y'a qu'un seul modèle disponible -> l'autosélectionner
- ✅ Quand je clique-droite sur un dossier pouvoir créer un fichier a partir d'un modèle est manquant dans le menu contextuel
- ✅ Dans le composant liste le popup (Bold Italic,...) n'apparait pas quand je sélectionne du texte
- ✅ Les URI ouvrent holo mais n'ouvre pas le fichier directement (peut-être une histoire de timeout, ou autre) holo://Notes3/Gros test.md
- ✅ Dans linus les URI me disent qu'il n'y a pas d'application disponible
- ✅ Dans le composant Footnote -> Je le crée -> j'édite son contenu -> je sors du focus -> Le champ n'est plus éditable (Je peux plus focus dedans et changer le contenu)
- ✅ Recherche des tags ne fonctionne pas (Aucun fichier n'est suggérer) -> Bien revoir l'indexation des fichiers
- ✅ Dans les activité (Panneau Inspecteur) les activité qui montrent un update du header markdown ne m'interesse pas (A filtrer parce que On voit que Fabian a update UpdatedAt:2026-06-02... parce qu'il a fait CTRL+S dans le fichier ou enregistrement automatique et c'est ni interessant ni pertinant)
- ✅ Quand je déplace un fichier dans l'arboresence :
    - Il faudrai mettre a jour les fichier qui on ce fichier en liens (mettre a jour le lien)
    - Mettre a jour la liste des récent / favori (SpacePanel et Global)
    - Réindexé la recherche (Actuellement le fichier apparait 2 fois dans la recherche, ancien emplacement, nouvelle emplacement et c'est un peu con)
- ✅ Dans le composant Citation la première fois qu'on le focus et qu'on fait SHIFT+ENTER cela ne marche pas. Il faut que je retape une deuxième fois pour qu'un retour a ligne opère -> A Corrigé
- ✅ J'insiste sur la qualité de l'indexation des fichiers stocké en local, incrémentiel. Et pour une question de debug -> Est-ce que tu peux me faire un bouton dans Settings -> Application -> Ouvrir le fichier d'indexation qui ouvre ce fichier afin que je puisse consulter sa structure

# Phase 12 
- ✅ NE MARCHE TOUJOURS PAS : Quand je clique sur Créer un fichier a partir d'un modèle -> Le popup apparait -> Si il y'a qu'un seul modèle disponible -> l'autosélectionner
- ✅ TOUJOURS PAS PRESENT DANS LE MENU : Quand je clique-droite sur un dossier pouvoir créer un fichier a partir d'un modèle est manquant dans le menu contextuel
- ✅ Erreur dans la console electron
[dev:electron] Error occurred in handler for 'fs:write-file': Error: ENOENT: no such file or directory, open '/home/romane/Notes3/.holo/search-index.json'
[dev:electron]     at async open (node:internal/fs/promises:637:25)
[dev:electron]     at async Object.writeFile (node:internal/fs/promises:1239:14)
[dev:electron]     at async file:///home/romane/Bureau/holo/electron/main.js:1654:3
[dev:electron]     at async Session.<anonymous> (node:electron/js2c/browser_init:2:116791) {
[dev:electron]   errno: -2,
[dev:electron]   code: 'ENOENT',
[dev:electron]   syscall: 'open',
[dev:electron]   path: '/home/romane/Notes3/.holo/search-index.json'
[dev:electron] }
- ✅ Dans la recherche la couleur des tags n'est pas respecté comme dans l'éditeur
- ✅ PAS ENCORE OK : Dans les activité (Panneau Inspecteur) les activité qui montrent un update du header markdown ne m'interesse pas (A filtrer parce que On voit que Fabian a update UpdatedAt:2026-06-02... parce qu'il a fait CTRL+S dans le fichier ou enregistrement automatique et c'est ni interessant ni pertinant)
 -> Voici un exemple d'activité pas interessante on voit que l'updatedAt a été modifié (normal avec l'enregistrement automatique) Si tu pouvais montrer un preview sur le reste des mise a jour et si il y'en a pas l'activité n'est pas interessante
<div class="min-w-0 rounded-holo-xl px-2.5 py-2 transition hover:bg-holo-glass-hover active:scale-[0.995]"><div class="flex min-w-0 items-start justify-between gap-2"><div class="min-w-0 flex-1"><div class="flex justify-between"><p class="line-clamp-2 text-sm font-medium leading-5 text-holo-text">Marcelo A.</p><span class="text-[11px] leading-4 text-white/60">il y a 57m</span></div></div><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-external-link mt-0.5 shrink-0 text-holo-text-faint opacity-0 transition group-hover/activity:text-holo-primary-soft group-hover/activity:opacity-100" aria-hidden="true"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg></div><div class="mt-2 flex items-center gap-1.5"><span class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none bg-emerald-400/10 text-emerald-300"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus" aria-hidden="true"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>2</span><span class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none bg-rose-400/10 text-rose-300"><svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-minus" aria-hidden="true"><path d="M5 12h14"></path></svg>2</span></div><div class="mt-2 space-y-1"><div class="flex min-w-0 items-center gap-1.5 rounded-holo-sm px-2 py-1 font-mono text-[10px] leading-4 bg-emerald-400/[0.055] text-emerald-200/85"><span class="shrink-0 select-none text-emerald-300/80">+</span><span class="min-w-0 flex-1 truncate">updated: 2026-06-03T14:51:07.138Z</span></div><div class="flex min-w-0 items-center gap-1.5 rounded-holo-sm px-2 py-1 font-mono text-[10px] leading-4 bg-rose-400/[0.055] text-rose-200/85"><span class="shrink-0 select-none text-rose-300/80">-</span><span class="min-w-0 flex-1 truncate">updated: 2026-06-03T14:50:48.198Z</span></div></div></div>
- ✅ NE MARCHE TOUJOURS PAS : Dans le composant Citation la première fois qu'on le focus et qu'on fait SHIFT+ENTER cela ne marche pas. Il faut que je retape une deuxième fois pour qu'un retour a ligne opère -> A Corrigé
- ✅ Dansil manque le composant/block pour le code (avec coloration du code / choix du language et un joli editeur) (je sais qu'il y a deja un package qu'on a installé dans le passé pour ça)
- ✅ Au sujet de l'indexation :
    - deja je vois qu'il est dans .holo -> cela veut dire dans le repo -> est-ce que c'est vraiment bien qu'il soit commit / merge -> Ne devrait il pas être dans les appData plutot?
    - Le bouton pour ouvrir le fichier ne fonctionne pas
    - Parcontre la recherche a l'aire beaucoup plus efficace

# Phase 12.1
- ✅Amélioration du fichier d'indexation déplacement du repo jusqu'a AppData pour avoir un fichier centralisé pour tout les repo
- ✅ Il faut déplacer le fichier d'indexation dans appdata et pas par repo comme ça la recherche a un fichier d'indexation de tout les espace pour pouvoir faire une recherche effeicace inter-espace

# Phase 12.2
- ✅ Dans une liste a puce si BACKSPACE en debut de phrase transform la phrase en bloc paragraphe (normal)
- ✅ CTRL-Z y'a une bizarerie quand j'annule on perd le focus sur editorFrame ou je sais pas ou il va mais je peux pas represser CTRL+Z Directement
- ✅ Composant de code : L'aperçu a droite ne sers pas a grand chose au moment de l'édition. Ne serait il pas possible d'avoir un editeur de code propre avec numero de ligne etc.. (standard quoi)
- ✅ Les liens de partage "holo://Notes3/Gros test.md" Ouvre l'app mais pas le bon document ni espace
- ✅ J'ai eu un problème lors du déplacement d'un fichier dans un dossier. Les liens relatifs pointant sur ce fichier n'ont pas été mis a jour. Les favoris et récent ne se sont pas mis a jours egalement (Peux-être c'est juste sur Windows et aussi la personne a peut-être un fichier d'indexation pas propre)
- ✅ Quand je drag un fichier dans l'arboresence de SpacePanel peut tu faire une zone (Racine de l'espace) pour que l'ux de déplacer un fichier a la racine soit plus propre
- ✅ Quand je crée un lien relatif sur un fichier j'aimerais voir le titre du document aussi en plus du nom de fichier
- ✅ Composante note : Je peux pas mettre mon curseur ou je veux dans le composant, ni selectionner de text (c'est pas standard comme les autres)
- ✅ Composant citation : SHIFT+ENTER nécessite toujours d'être tapé 2x pour fonctionner -> NE MARCHE TOUJOURS PAS : Dans le composant Citation la première fois qu'on le focus et qu'on fait SHIFT+ENTER cela ne marche pas. Il faut que je retape une deuxième fois pour qu'un retour a ligne opère -> A Corrigé
- ✅ Quand je sélectionne un Séparateur et que je fais ENTER créer une ligne vide en dessous
- ✅ CTRL-Z m'a parfois fait scroller tout en haut de la page pour aucune raison
- ✅ Dans l'arboresence il faut qu'on voye nettement le fichier ouvert (icone file quand pas ouvert, icone file-user quand ouvert (lucide)) avec une couleur de texte ou qqch comme ça (pareil pour les dossier folder /folder-open)
- ✅ Si j'ouvre un fichier (via un lien par exemple) -> ouvrir l'arboresence et développer les dossiers pour le voir dans l'arbo

# Phase 13
- CTRL+A Dans un bloc de code (editeur) dois sélectionné tout le texte (exception a la sélection de tout les blocs)
- Si un tableau a plus que 3 colonnes les colonnes doivent s'adapté au contenu
- Quand je sauvegarde doit rafraichir les activité si repo git
- Quand j'ouvre un fichier d'un autre espace j'ai cette erreur qui vient
<span class="text-xs text-holo-danger" title="fatal: ../../../Notes3/Gros test.md : '../../../Notes3/Gros test.md' est hors du dépôt à '/home/romane/Bureau/Dev/documentation'">Erreur : fatal: ../../../Notes3/Gros test.md : '../../../Notes3/Gros </span>
- Dans le popup création d'un fichier a partir d'un modèle changer l'ux 
    - D'abord on sélectionn un modèle (on voit rien d'autre)
    - Après le titre
    - Après les variables
- Est-ce que c'est une bonne idée dans le fichier d'indexation d'ajouter des keywords ? Exemple les "Titre 1", les textes en gras?
- Dans la frame onboarding les données Nom, prénom, email ne se sauvegarder pas, du coup la frame aparait a chaque lancement

# Phase 13.1
Solidification de l'historique UNDO/REDO
- Vraiment faire un système solide pour détecter les changement du markdown et pouvoir annuler / refaire une 20aine d'actions 


# Phase 14
Amélioration des tables
- Pouvoir Trier la colonne A-z Z-a (Et ça adapte les donnée des autre colonnes)
- Ajouter des metadonnée YAML invisible au rendu pour stocker des personnalisation de la table
    - Type de colonnes
        - Texte (par défaut)
        - Nombre
        - Monétaire
        - Checkbox
    - Couleur de colonne 
        - Texte (choix de couleur adapté au design)
        
# Phase 15
Nouveau composants :
 - Support des gif (importation, affichage)
 - Support des video youtube
 - Exposant et indice comme formatage de texte
 - Bloc HTML (comme code mais avec rendu)
 - Mentions (listing automatique des paticipants du repo et pouvoir faire @) avec possibilité de recherche @romane dans le panneau de recherche
 - Mermaid (avec design css adapté au look de holo)
 - Amélioration des Footnote (Fonctionne plus comme un tooltip en terme rendu) -> Selection d'un mot ajout d'un footnote 
    Here is a simple footnote[^1].
    [^1]: My reference.
 - Amélioration des bloc de citation -> Ajout des alert github ([!NOTE] [!TIP] [!IMPORTANT] [!WARNING] [!CAUTION])
    > [!NOTE]
    > Useful information that users should know, even when skimming content.
 - Collapsible secion github
    <details>
    <summary>Click me</summary>
    
    Content
    </details>
- Détection automatique des couleurs dans les bloc de code inline (petit point de couleur pour représenter la couleur)
    `#RRGGBB`
    `rgb(R,G,B)`
    `hsl(H,S,L)`

