import type { SlashCommand } from '../types/editor'

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export const matchesSlashQuery = (cmd: SlashCommand, query: string) => {
  if (!query) return true
  const q = normalize(query)
  return (
    normalize(cmd.label).includes(q) ||
    normalize(cmd.id).includes(q) ||
    (cmd.keywords ?? []).some((k) => normalize(k).includes(q))
  )
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'h1', icon: 'fa-solid fa-1', label: 'Titre 1', hint: 'Grand titre' },
  { id: 'h2', icon: 'fa-solid fa-2', label: 'Titre 2', hint: 'Titre moyen' },
  { id: 'h3', icon: 'fa-solid fa-3', label: 'Titre 3', hint: 'Petit titre' },
  { id: 'h4', icon: 'fa-solid fa-4', label: 'Titre 4', hint: 'Sous-titre' },
  { id: 'bullet', icon: 'fa-solid fa-list-ul', label: 'Liste à puces', hint: '-' },
  { id: 'ordered', icon: 'fa-solid fa-list-ol', label: 'Liste numérotée', hint: '1. 2. 3.' },
  { id: 'quote', icon: 'fa-solid fa-quote-left', label: 'Citation', hint: 'Bloc citation' },
  { id: 'code', icon: 'fa-solid fa-code', label: 'Bloc code', hint: 'Monospace' },
  { id: 'table', icon: 'fa-solid fa-table', label: 'Tableau', hint: 'Grille' },
  { id: 'kanban', icon: 'fa-solid fa-table-columns', label: 'Kanban', hint: 'Tableau tickets', keywords: ['board', 'tickets', 'todo', 'workflow'] },
  { id: 'todo', icon: 'fa-solid fa-square-check', label: 'Tâches', hint: 'Checklist', keywords: ['tache', 'todo', 'task', 'checklist'] },
  { id: 'separator', icon: 'fa-solid fa-minus', label: 'Séparateur', hint: 'Ligne horizontale' },
  { id: 'link', icon: 'fa-solid fa-link', label: 'Lien', hint: 'Insérer un lien' },
  { id: 'image', icon: 'fa-solid fa-image', label: 'Image', hint: 'Depuis le disque' },
  { id: 'ai', icon: 'fa-solid fa-wand-magic-sparkles', label: "Demander à l'IA", hint: 'Générer du contenu', keywords: ['ia', 'ai', 'gpt', 'chatgpt', 'intelligence', 'artificielle'], requiresApiKey: true },
]