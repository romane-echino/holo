// ─── URL parsing ──────────────────────────────────────────────────────────────

export interface RepoCoords {
  host: string
  owner: string
  repo: string
}

export function parseRepoUrl(url: string): RepoCoords | null {
  const clean = url.trim().replace(/\.git$/, '').replace(/\/$/, '')
  // Accept any https?://host/owner/repo pattern
  const m = clean.match(/^(?:https?:\/\/)?([^/?#]+)\/([^/?#]+)\/([^/?#]+)/)
  if (m) return { host: m[1], owner: m[2], repo: m[3] }
  return null
}

function apiBase(host: string): string {
  return host === 'github.com'
    ? 'https://api.github.com'
    : `https://${host}/api/v1`
}

// ─── Repo metadata ────────────────────────────────────────────────────────────

export interface RepoMeta {
  host: string
  owner: string
  repo: string
  name: string
  description: string | null
  defaultBranch: string
}

export async function fetchRepoMeta(host: string, owner: string, repo: string): Promise<RepoMeta> {
  const res = await fetch(`${apiBase(host)}/repos/${owner}/${repo}`)
  if (res.status === 404) throw new Error('Repo introuvable ou privé')
  if (!res.ok) throw new Error(`Erreur ${res.status}`)
  const data = await res.json()
  return {
    host,
    owner,
    repo,
    name: data.name as string,
    description: data.description as string | null,
    defaultBranch: (data.default_branch as string) ?? 'main',
  }
}

// ─── File tree ────────────────────────────────────────────────────────────────

export interface TreeFile {
  path: string
  type: 'blob' | 'tree'
}

export async function getRepoTree(host: string, owner: string, repo: string, branch: string): Promise<TreeFile[]> {
  const res = await fetch(
    `${apiBase(host)}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
  )
  if (!res.ok) throw new Error(`Impossible de lire l'arborescence`)
  const data = await res.json()
  return (data.tree as TreeFile[]).filter((f) => f.type === 'blob')
}

// ─── File content ─────────────────────────────────────────────────────────────

export async function getFileContent(
  host: string,
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string> {
  const rawUrl = host === 'github.com'
    ? `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
    : `https://${host}/${owner}/${repo}/raw/branch/${branch}/${path}`
  const res = await fetch(rawUrl)
  if (!res.ok) throw new Error(`Fichier introuvable`)
  return res.text()
}

// ─── Saved repos (localStorage) ───────────────────────────────────────────────

const STORAGE_KEY = 'holo-pwa-repos'

export interface SavedRepo extends RepoMeta {
  addedAt: string
}

export function getSavedRepos(): SavedRepo[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SavedRepo[]
  } catch {
    return []
  }
}

export function saveRepo(meta: RepoMeta): SavedRepo {
  const repos = getSavedRepos().filter((r) => r.repo !== meta.repo || r.owner !== meta.owner)
  const saved: SavedRepo = { ...meta, addedAt: new Date().toISOString() }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([saved, ...repos]))
  return saved
}

export function removeRepo(host: string, owner: string, repo: string) {
  const repos = getSavedRepos().filter(
    (r) => r.repo !== repo || r.owner !== owner || r.host !== host,
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repos))
}
