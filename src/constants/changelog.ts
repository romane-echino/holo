import type { ChangelogEntry } from '../types/shared'

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '0.5.0',
    releasedAt: '2026-06-03',
    items: [
      'Inspecteur : refonte du panneau Activite avec resume des ajouts/suppressions et apercu de diff par commit.',
      'Inspecteur : clic sur une activite pour ouvrir le bon commit sur le remote quand il est disponible.',
      'Table des matieres : indentation amelioree et correctif des titres dupliques qui scrollaient toujours vers la premiere occurrence.',
      'Inspecteur > Liens : ouverture des liens relatifs, cartes plus lisibles, miniatures d images et apercu au clic.',
      'Inspecteur > Liens : correction des chemins markdown avec espaces et du chargement des images locales via le loader desktop.',
      'Inspecteur > Notes : notes cliquables avec scroll vers la note correspondante et masquage des emojis de persistance.',
      'Notes : nouveau rendu callout avec types Info, Succes, Attention et Erreur, changement de type depuis un menu dedie et persistance markdown par emoji.',
      'Notes : le texte suit maintenant le curseur global de taille et les emojis techniques sont masques pendant l edition.',
      'Tableaux : largeur maximale plus raisonnable, retour a la ligne dans les cellules et meilleur comportement quand il y a plus de trois colonnes.',
      'Edition : cliquer sur le grip d un bloc sans glisser selectionne maintenant correctement le bloc.',
      'Desktop Windows : correctifs de normalisation de chemins pour la sauvegarde et pour les onglets Favoris / Recents du Space Panel.',
      'Separateurs : les marges verticales suivent maintenant le curseur global de taille du texte.',
    ],
  },
  {
    version: '0.4.0',
    releasedAt: '2026-06-01',
    items: [
      'Liens relatifs dans l editeur : recherche de pages de l espace courant depuis la barre de formatage.',
      'Liens dans l editeur : tooltip avec l URL et ouverture via Ctrl/Cmd+clic.',
      'Tableaux : le curseur global de taille du texte s applique maintenant aux cellules et aux en tetes.',
      'Selection de texte : le drag-select de blocs ne s active plus tant que la souris reste dans le bloc courant.',
      'Recherche : affichage des tags de fichier dans les resultats.',
      'Collage d images : prise en charge du presse-papier directement dans l editeur.',
      'Tableaux : placeholder de cellule mieux aligne et espacement corrige.',
      'Modeles : option Definir comme modele disponible dans le menu contextuel des fichiers.',
    ],
  },
  {
    version: '0.3.0',
    releasedAt: '2026-05-28',
    items: [
      'Blocs citation (blockquote) et notes de bas de page : désormais entièrement éditables.',
      'Images : clic pour sélectionner un bloc image, Backspace/Suppr pour le supprimer.',
      'Sélection multi-blocs : glisser la souris pour sélectionner plusieurs blocs, Shift+clic pour étendre la plage, Backspace/Suppr pour tout supprimer.',
      'Séparateur : sélectionnable au clic et supprimable au clavier.',
      'Palette de commandes : nouvelles entrées Citation, Note de bas de page et Séparateur.',
      'Panneau IA : refonte dans le style Copilot — historique de conversation, bulles par rôle, état vide avec suggestions rapides.',
      'Mises à jour automatiques : nouvelle notification flottante avec barre de progression.',
      'Diff de conflits Git : visualisation côte à côte des conflits de fusion avec résolution en un clic.',
      'Identifiants par espace : popup de saisie des identifiants cloud lors de l\'ouverture d\'un espace.',
      'Correctif de démarrage : crash au lancement lié à une initialisation hors-ordre.',
    ],
  },
  {
    version: '0.2.8',
    releasedAt: '2026-05-08',
    items: [
      'Export PDF : bouton deplace a cote de Copier le lien sur le fichier actif.',
      'Liens dans l\'editeur : indication Ctrl+clic et ouverture via Ctrl/Cmd+clic.',
      'Stabilite edition : correctif du blocage apres changement de fichier sans sauvegarde.',
      'Responsive : acces a la table des matieres en mode compact via le bouton Plan.',
      'Fenetre desktop : largeur minimale reduite a 400px.',
      'Templates : variables ($DATE, $AUTHOR...) detectees et pre-remplies, saisies dans le dialog de creation.',
    ],
  },
  {
    version: '0.2.7',
    releasedAt: '2026-05-07',
    items: [
      'Templates : definir un fichier comme modele et creer un document depuis un modele.',
      'Mode lecture seule : switch global pres du profil et blocage des actions d\'edition.',
      'Recherche : prise en compte du titre, du nom de fichier et de la description.',
      'Recents : correction de l\'ouverture du bon fichier.',
      'Navigation fichiers : ouverture plus rapide (suppression du fetch distant bloquant).',
    ],
  },
  {
    version: '0.2.6',
    releasedAt: '2026-05-06',
    items: [
      'Migration de la configuration globale vers ~/.holo/holo-config.json.',
      'Correction du lancement via lien holo:// (plus de re-saisie du profil et des cles).',
      'Ameliorations de stabilite sur les actions de fichiers.',
    ],
  },
]
