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
Dans les tableau dans la case a la plus a gauche (ou on peut hover pour supprimer la ligne), ajouter le numéro de la ligne 1,2,3...
Nouvelle systématique de largeur de colonne nécessaire :  Les tableau qui prennent toute la largeur quand il ont 1-2 colonne ne dérange pas fondamentalement mais ceux qui on plus de colonne et qui dépasse la largeur de la frame et qui commence a scroll pourrait être optimisé pour s'adapter a leur contenu
Selectionner plus cellule / plusieur ligne d'un tableau et pouvoir les copy paste et pouvoir supprimer leur contenu avec DELETE


# Phase 8 
Click scroll dans la table des matière + 64px (l'item ciblé par le scroll est sous le sticky header)
clipboard html / plain et markdown fonctionn pas encore
clipboard past dans holo cassé