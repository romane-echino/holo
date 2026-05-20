import type { ChangelogEntry } from '../types/shared'

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
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
