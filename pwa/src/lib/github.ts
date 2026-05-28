const BASE = 'https://api.github.com'

// ─── Token storage ───────────────────────────────────────────────────────────

const TOKEN_KEY = 'holo-pwa-token'

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// ─── Core fetch ──────────────────────────────────────────────────────────────

async function ghFetch<T>(path: string): Promise<T> {
  const token = getToken()
  if (!token) throw new Error('No token')
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export class AuthError extends Error {
  constructor() { super('Token invalide ou expiré') }
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface GithubUser {
  login: string
  name: string | null
  avatar_url: string
}

export async function getCurrentUser(): Promise<GithubUser> {
  return ghFetch<GithubUser>('/user')
}

// ─── Repos ────────────────────────────────────────────────────────────────────

export interface GithubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  owner: { login: string }
  private: boolean
  updated_at: string
}

export async function listAllRepos(): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = []
  let page = 1
  while (true) {
    const batch = await ghFetch<GithubRepo[]>(
      `/user/repos?per_page=100&page=${page}&sort=updated&type=all`,
    )
    repos.push(...batch)
    if (batch.length < 100) break
    page++
  }
  return repos
}

// ─── File content ─────────────────────────────────────────────────────────────

export async function getFileContent(owner: string, repo: string, path: string): Promise<string> {
  const data = await ghFetch<{ content: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
  )
  if (data.encoding === 'base64') {
    return atob(data.content.replace(/\n/g, ''))
  }
  return data.content
}

// ─── Tree ─────────────────────────────────────────────────────────────────────

export interface TreeFile {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

export async function getRepoTree(owner: string, repo: string): Promise<TreeFile[]> {
  for (const branch of ['main', 'master']) {
    try {
      const data = await ghFetch<{ tree: TreeFile[] }>(
        `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      )
      return data.tree.filter((f) => f.type === 'blob')
    } catch {
      // try next branch
    }
  }
  throw new Error('Branche main/master introuvable')
}

// ─── Holo spaces ─────────────────────────────────────────────────────────────

export interface HoloSpace {
  owner: string
  repo: string
  name: string
  description?: string
  updatedAt: string
}

/** Scan repos in parallel (batches of 6) to find those with .holo.json */
export async function detectHoloSpaces(repos: GithubRepo[]): Promise<HoloSpace[]> {
  const results: HoloSpace[] = []
  for (let i = 0; i < repos.length; i += 6) {
    const batch = repos.slice(i, i + 6)
    const settled = await Promise.allSettled(
      batch.map(async (repo) => {
        const raw = await getFileContent(repo.owner.login, repo.name, '.holo.json')
        const meta = JSON.parse(raw) as { title?: string; description?: string }
        return {
          owner: repo.owner.login,
          repo: repo.name,
          name: meta.title || repo.name,
          description: meta.description || repo.description || undefined,
          updatedAt: repo.updated_at,
        } satisfies HoloSpace
      }),
    )
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value)
    }
  }
  return results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}
