import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, BookOpen, ChevronRight, FileText, FolderOpen,
  Plus, RefreshCw, Search, Trash2, X,
} from 'lucide-react'
import {
  fetchRepoMeta,
  getFileContent,
  getRepoTree,
  getSavedRepos,
  parseRepoUrl,
  removeRepo,
  saveRepo,
  type SavedRepo,
  type TreeFile,
} from './lib/github'

// ─── Screen types ─────────────────────────────────────────────────────────────

type Screen =
  | { id: 'home'; repos: SavedRepo[] }
  | { id: 'files'; repo: SavedRepo; files: TreeFile[] | null; loading: boolean; error?: string; search: string }
  | { id: 'viewer'; repo: SavedRepo; path: string; content: string | null; loading: boolean }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\n?/, '')
}

function parseFrontmatterTitle(md: string): string | null {
  const m = md.match(/^---[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)
  return m ? m[1].trim() : null
}

function getFileTitle(path: string, content?: string | null): string {
  if (content) {
    const title = parseFrontmatterTitle(content)
    if (title) return title
  }
  return path.split('/').pop()?.replace(/\.md$/i, '') ?? path
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'home', repos: getSavedRepos() })

  // Load files when entering files screen
  useEffect(() => {
    if (screen.id !== 'files' || !screen.loading || screen.files !== null) return
    getRepoTree(screen.repo.host, screen.repo.owner, screen.repo.repo, screen.repo.defaultBranch, screen.repo.token)
      .then((files) =>
        setScreen((s) => (s.id === 'files' ? { ...s, files, loading: false } : s)),
      )
      .catch((err) =>
        setScreen((s) =>
          s.id === 'files' ? { ...s, loading: false, error: String(err?.message ?? err) } : s,
        ),
      )
  }, [screen])

  // Load file content when entering viewer
  useEffect(() => {
    if (screen.id !== 'viewer' || !screen.loading || screen.content !== null) return
    getFileContent(screen.repo.host, screen.repo.owner, screen.repo.repo, screen.repo.defaultBranch, screen.path, screen.repo.token)
      .then((content) =>
        setScreen((s) => (s.id === 'viewer' ? { ...s, content, loading: false } : s)),
      )
      .catch(() =>
        setScreen((s) => (s.id === 'viewer' ? { ...s, content: '', loading: false } : s)),
      )
  }, [screen])

  if (screen.id === 'home') {
    return (
      <HomeScreen
        repos={screen.repos}
        onSelect={(repo) =>
          setScreen({ id: 'files', repo, files: null, loading: true, search: '' })
        }
        onAdd={(repo) => {
          const saved = saveRepo(repo)
          setScreen({ id: 'files', repo: saved, files: null, loading: true, search: '' })
        }}
        onRemove={(host, owner, repo) => {
          removeRepo(host, owner, repo)
          setScreen({ id: 'home', repos: getSavedRepos() })
        }}
      />
    )
  }

  if (screen.id === 'files') {
    return (
      <FilesScreen
        repo={screen.repo}
        files={screen.files}
        loading={screen.loading}
        error={screen.error}
        search={screen.search}
        onSearchChange={(s) => setScreen({ ...screen, search: s })}
        onSelect={(path) =>
          setScreen({ id: 'viewer', repo: screen.repo, path, content: null, loading: true })
        }
        onBack={() => setScreen({ id: 'home', repos: getSavedRepos() })}
      />
    )
  }

  if (screen.id === 'viewer') {
    return (
      <ViewerScreen
        repo={screen.repo}
        path={screen.path}
        content={screen.content}
        loading={screen.loading}
        onBack={() =>
          setScreen({ id: 'files', repo: screen.repo, files: null, loading: true, search: '' })
        }
      />
    )
  }

  return null
}

// ─── Home screen ─────────────────────────────────────────────────────────────

function HomeScreen({
  repos, onSelect, onAdd, onRemove,
}: {
  repos: SavedRepo[]
  onSelect: (repo: SavedRepo) => void
  onAdd: (repo: import('./lib/github').RepoMeta) => void
  onRemove: (host: string, owner: string, repo: string) => void
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title="Holo Reader"
        right={
          <button
            onClick={() => setAdding(true)}
            className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
            title="Ajouter un repo"
          >
            <Plus size={18} />
          </button>
        }
      />

      {adding && (
        <AddRepoSheet
          onAdd={(meta) => { setAdding(false); onAdd(meta) }}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        {repos.length === 0 && !adding && (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-holo-primary/10 text-holo-primary">
              <BookOpen size={26} />
            </div>
            <div>
              <p className="font-medium text-holo-text">Aucun repo ajouté</p>
              <p className="mt-1 text-sm text-holo-text-faint">
                Appuyez sur + pour ajouter un repo Git public.
              </p>
            </div>
            <button
              onClick={() => setAdding(true)}
              className="rounded-holo-lg bg-holo-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-holo-primary/90"
            >
              Ajouter un repo
            </button>
          </div>
        )}

        {repos.length > 0 && (
          <ul className="divide-y divide-holo-border-soft">
            {repos.map((repo) => (
              <li key={`${repo.host}/${repo.owner}/${repo.repo}`} className="group/row relative">
                <button
                  onClick={() => onSelect(repo)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-holo-glass active:bg-holo-glass-hover"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-holo-lg border border-holo-border-soft bg-holo-glass text-holo-text-muted">
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-holo-text">{repo.name}</div>
                    <div className="mt-0.5 truncate text-xs text-holo-text-faint">
                      {repo.host}/{repo.owner}/{repo.repo}
                    </div>
                    {repo.description && (
                      <div className="mt-0.5 truncate text-xs text-holo-text-muted">
                        {repo.description}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-holo-text-faint" />
                </button>
                <button
                  onClick={() => onRemove(repo.host, repo.owner, repo.repo)}
                  className="absolute right-12 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-holo-md text-holo-text-faint opacity-0 transition hover:bg-holo-danger/10 hover:text-holo-danger group-hover/row:opacity-100"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Add repo sheet ───────────────────────────────────────────────────────────

function AddRepoSheet({
  onAdd, onCancel,
}: {
  onAdd: (meta: import('./lib/github').RepoMeta) => void
  onCancel: () => void
}) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const coords = parseRepoUrl(url)
    if (!coords) {
      setErrorMsg('URL invalide. Exemple : https://github.com/owner/repo')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      const meta = await fetchRepoMeta(coords.host, coords.owner, coords.repo, token || undefined)
      onAdd({ ...meta, token: token || undefined })
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  return (
    <div className="border-b border-holo-border-soft bg-holo-bg/95 px-4 py-4 backdrop-blur">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-holo-text">Ajouter un repo GitHub public</span>
          <button type="button" onClick={onCancel} className="text-holo-text-faint hover:text-holo-text">
            <X size={16} />
          </button>
        </div>
        <input
          ref={inputRef}
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus('idle') }}
          placeholder="https://github.com/owner/repo  ou  https://git.example.com/owner/repo"
          className="w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2.5 text-sm text-holo-text placeholder:text-holo-text-faint outline-none focus:border-holo-primary/50"
        />
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token d'accès (optionnel, pour les repos privés)"
          type="password"
          autoComplete="off"
          className="w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2.5 text-sm text-holo-text placeholder:text-holo-text-faint outline-none focus:border-holo-primary/50"
        />
        {status === 'error' && (
          <p className="text-xs text-holo-danger">{errorMsg}</p>
        )}
        <button
          type="submit"
          disabled={!url.trim() || status === 'loading'}
          className="w-full rounded-holo-lg bg-holo-primary py-2.5 text-sm font-medium text-white transition hover:bg-holo-primary/90 disabled:opacity-50"
        >
          {status === 'loading' ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw size={13} className="animate-spin" /> Vérification…
            </span>
          ) : 'Ajouter'}
        </button>
      </form>
    </div>
  )
}

// ─── Files screen ─────────────────────────────────────────────────────────────

function FilesScreen({
  repo, files, loading, error, search, onSearchChange, onSelect, onBack,
}: {
  repo: SavedRepo
  files: TreeFile[] | null
  loading: boolean
  error?: string
  search: string
  onSearchChange: (s: string) => void
  onSelect: (path: string) => void
  onBack: () => void
}) {
  const mdFiles = files?.filter((f) => f.path.endsWith('.md')) ?? []

  const filtered = search.trim()
    ? mdFiles.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()))
    : mdFiles

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, f) => {
    const parts = f.path.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    ;(acc[folder] ??= []).push(f)
    return acc
  }, {})

  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title={repo.name}
        left={
          <button
            onClick={onBack}
            className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
          >
            <ArrowLeft size={18} />
          </button>
        }
      />

      <div className="border-b border-holo-border-soft px-3 py-2">
        <div className="flex items-center gap-2 rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2">
          <Search size={14} className="shrink-0 text-holo-text-faint" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un fichier…"
            className="flex-1 bg-transparent text-sm text-holo-text placeholder:text-holo-text-faint outline-none"
          />
          {search && (
            <button onClick={() => onSearchChange('')}>
              <X size={14} className="text-holo-text-faint" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-holo-text-faint">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm">Chargement des fichiers…</span>
          </div>
        )}

        {error && !loading && (
          <div className="m-4 rounded-holo-lg border border-holo-danger/30 bg-holo-danger/10 px-4 py-3 text-sm text-holo-danger">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-holo-text-faint">
            <FileText size={24} />
            <span className="text-sm">Aucun fichier .md trouvé</span>
          </div>
        )}

        {!loading && Object.entries(grouped).map(([folder, folderFiles]) => (
          <div key={folder}>
            {folder && (
              <div className="sticky top-0 z-10 border-b border-holo-border-soft bg-holo-bg/90 px-4 py-2 backdrop-blur">
                <span className="text-xs font-medium text-holo-text-faint">{folder}</span>
              </div>
            )}
            <ul className="divide-y divide-holo-border-soft">
              {folderFiles.map((f) => {
                const name = f.path.split('/').pop()?.replace(/\.md$/i, '') ?? f.path
                return (
                  <li key={f.path}>
                    <button
                      onClick={() => onSelect(f.path)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-holo-glass active:bg-holo-glass-hover"
                    >
                      <FileText size={15} className="shrink-0 text-holo-text-faint" />
                      <span className="min-w-0 flex-1 truncate text-sm text-holo-text">{name}</span>
                      <ChevronRight size={14} className="shrink-0 text-holo-text-faint" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Viewer screen ────────────────────────────────────────────────────────────

function ViewerScreen({
  repo, path, content, loading, onBack,
}: {
  repo: SavedRepo
  path: string
  content: string | null
  loading: boolean
  onBack: () => void
}) {
  const title = getFileTitle(path, content)
  const body = content ? stripFrontmatter(content) : ''

  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title={title}
        left={
          <button
            onClick={onBack}
            className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
          >
            <ArrowLeft size={18} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-holo-text-faint">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm">Chargement…</span>
          </div>
        )}
        {!loading && (
          <article className="holo-markdown mx-auto max-w-[720px] px-5 py-8">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  )
}

// ─── NavBar ──────────────────────────────────────────────────────────────────

function NavBar({ title, left, right }: {
  title: string
  left?: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <header className="safe-top flex shrink-0 items-center gap-2 border-b border-holo-border-soft bg-holo-bg/95 px-2 py-2 backdrop-blur-lg">
      <div className="flex w-9 shrink-0 items-center justify-center">{left}</div>
      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-holo-text">
        {title}
      </h1>
      <div className="flex w-9 shrink-0 items-center justify-center">{right}</div>
    </header>
  )
}

