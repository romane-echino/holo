import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, BookOpen, ChevronRight, FileText, FolderOpen,
  LogOut, RefreshCw, Search, X,
} from 'lucide-react'
import {
  AuthError,
  clearToken,
  detectHoloSpaces,
  getFileContent,
  getCurrentUser,
  getRepoTree,
  getToken,
  listAllRepos,
  saveToken,
  type GithubUser,
  type HoloSpace,
  type TreeFile,
} from './lib/github'

// ─── Types ────────────────────────────────────────────────────────────────────

type Screen =
  | { id: 'auth' }
  | { id: 'spaces'; user: GithubUser; spaces: HoloSpace[] | null; loading: boolean; error?: string }
  | { id: 'files'; user: GithubUser; space: HoloSpace; files: TreeFile[] | null; loading: boolean; search: string }
  | { id: 'viewer'; user: GithubUser; space: HoloSpace; path: string; content: string | null; loading: boolean }

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

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime()
  const d = Math.floor(diff / 86400000)
  if (d === 0) return "aujourd'hui"
  if (d === 1) return 'hier'
  if (d < 30) return `il y a ${d}j`
  const m = Math.floor(d / 30)
  if (m < 12) return `il y a ${m} mois`
  return `il y a ${Math.floor(d / 365)} ans`
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<Screen>({ id: 'auth' })

  // Auto-login if token exists
  useEffect(() => {
    if (getToken()) {
      getCurrentUser()
        .then((user) =>
          setScreen({ id: 'spaces', user, spaces: null, loading: true }),
        )
        .catch(() => setScreen({ id: 'auth' }))
    }
  }, [])

  // Load spaces when entering spaces screen
  useEffect(() => {
    if (screen.id !== 'spaces' || !screen.loading || screen.spaces !== null) return
    listAllRepos()
      .then((repos) => detectHoloSpaces(repos))
      .then((spaces) =>
        setScreen((s) =>
          s.id === 'spaces' ? { ...s, spaces, loading: false } : s,
        ),
      )
      .catch((err) => {
        if (err instanceof AuthError) {
          clearToken()
          setScreen({ id: 'auth' })
        } else {
          setScreen((s) =>
            s.id === 'spaces' ? { ...s, loading: false, error: err.message } : s,
          )
        }
      })
  }, [screen])

  // Load files when entering files screen
  useEffect(() => {
    if (screen.id !== 'files' || !screen.loading || screen.files !== null) return
    getRepoTree(screen.space.owner, screen.space.repo)
      .then((files) =>
        setScreen((s) => (s.id === 'files' ? { ...s, files, loading: false } : s)),
      )
      .catch((err) =>
        setScreen((s) =>
          s.id === 'files' ? { ...s, loading: false, error: err?.message } : s,
        ),
      )
  }, [screen])

  // Load file content when entering viewer
  useEffect(() => {
    if (screen.id !== 'viewer' || !screen.loading || screen.content !== null) return
    getFileContent(screen.space.owner, screen.space.repo, screen.path)
      .then((content) =>
        setScreen((s) => (s.id === 'viewer' ? { ...s, content, loading: false } : s)),
      )
      .catch(() =>
        setScreen((s) => (s.id === 'viewer' ? { ...s, content: '', loading: false } : s)),
      )
  }, [screen])

  const handleAuth = useCallback((token: string) => {
    saveToken(token)
    getCurrentUser()
      .then((user) => setScreen({ id: 'spaces', user, spaces: null, loading: true }))
      .catch(() => {
        clearToken()
        setScreen({ id: 'auth' })
        alert('Token invalide. Vérifiez vos droits (scope: repo ou read:user).')
      })
  }, [])

  const handleLogout = useCallback(() => {
    clearToken()
    setScreen({ id: 'auth' })
  }, [])

  if (screen.id === 'auth') return <AuthScreen onAuth={handleAuth} />

  if (screen.id === 'spaces') {
    return (
      <SpacesScreen
        user={screen.user}
        spaces={screen.spaces}
        loading={screen.loading}
        error={screen.error}
        onSelect={(space) =>
          setScreen({ id: 'files', user: screen.user, space, files: null, loading: true, search: '' })
        }
        onRefresh={() =>
          setScreen({ ...screen, spaces: null, loading: true, error: undefined })
        }
        onLogout={handleLogout}
      />
    )
  }

  if (screen.id === 'files') {
    return (
      <FilesScreen
        user={screen.user}
        space={screen.space}
        files={screen.files}
        loading={screen.loading}
        search={screen.search}
        onSearchChange={(s) => setScreen({ ...screen, search: s })}
        onSelect={(path) =>
          setScreen({ id: 'viewer', user: screen.user, space: screen.space, path, content: null, loading: true })
        }
        onBack={() =>
          setScreen({ id: 'spaces', user: screen.user, spaces: null, loading: true })
        }
        onLogout={handleLogout}
      />
    )
  }

  if (screen.id === 'viewer') {
    return (
      <ViewerScreen
        user={screen.user}
        space={screen.space}
        path={screen.path}
        content={screen.content}
        loading={screen.loading}
        onBack={() =>
          setScreen({ id: 'files', user: screen.user, space: screen.space, files: null, loading: true, search: '' })
        }
        onLogout={handleLogout}
      />
    )
  }

  return null
}

// ─── Auth screen ─────────────────────────────────────────────────────────────

function AuthScreen({ onAuth }: { onAuth: (token: string) => void }) {
  const [token, setToken] = useState('')
  const [pending, setPending] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setPending(true)
    onAuth(token.trim())
    setTimeout(() => setPending(false), 3000)
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-holo-primary/20 text-holo-primary">
          <BookOpen size={28} />
        </div>
        <h1 className="text-2xl font-semibold text-holo-text">Holo Reader</h1>
        <p className="text-center text-sm text-holo-text-muted">
          Lisez vos notes Holo depuis n'importe quel appareil
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-holo-text-muted" htmlFor="token">
            GitHub Personal Access Token
          </label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxx"
            autoComplete="off"
            className="w-full rounded-holo-lg border border-holo-border-soft bg-holo-glass px-4 py-3 text-sm text-holo-text placeholder:text-holo-text-faint outline-none focus:border-holo-primary/50 focus:ring-1 focus:ring-holo-primary/30"
          />
        </div>
        <button
          type="submit"
          disabled={!token.trim() || pending}
          className="w-full rounded-holo-lg bg-holo-primary py-3 text-sm font-medium text-white transition hover:bg-holo-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>

        <p className="text-center text-xs text-holo-text-faint">
          Créez un token sur{' '}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo&description=Holo+Reader"
            className="text-holo-primary underline-offset-2 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            github.com/settings/tokens
          </a>{' '}
          avec le scope <code className="rounded bg-holo-glass px-1 text-[11px]">repo</code>.
        </p>
      </form>
    </div>
  )
}

// ─── Spaces screen ────────────────────────────────────────────────────────────

function SpacesScreen({
  user, spaces, loading, error, onSelect, onRefresh, onLogout,
}: {
  user: GithubUser
  spaces: HoloSpace[] | null
  loading: boolean
  error?: string
  onSelect: (space: HoloSpace) => void
  onRefresh: () => void
  onLogout: () => void
}) {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title="Mes espaces"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
              title="Actualiser"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onLogout}
              className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
              title="Déconnexion"
            >
              <LogOut size={16} />
            </button>
          </div>
        }
      />

      <div className="flex items-center gap-3 border-b border-holo-border-soft px-4 py-3">
        <img
          src={user.avatar_url}
          alt={user.login}
          className="size-8 rounded-full"
        />
        <div>
          <div className="text-sm font-medium text-holo-text">{user.name ?? user.login}</div>
          <div className="text-xs text-holo-text-faint">@{user.login}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-holo-text-faint">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm">Recherche des espaces Holo…</span>
          </div>
        )}

        {error && !loading && (
          <div className="m-4 rounded-holo-lg border border-holo-danger/30 bg-holo-danger/10 px-4 py-3 text-sm text-holo-danger">
            {error}
          </div>
        )}

        {!loading && spaces?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-holo-text-faint">
            <FolderOpen size={28} />
            <span className="text-sm">Aucun espace Holo trouvé</span>
            <span className="max-w-[220px] text-center text-xs">
              Vos repos contenant un fichier <code>.holo.json</code> apparaîtront ici.
            </span>
          </div>
        )}

        {spaces && spaces.length > 0 && (
          <ul className="divide-y divide-holo-border-soft">
            {spaces.map((space) => (
              <li key={`${space.owner}/${space.repo}`}>
                <button
                  onClick={() => onSelect(space)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-holo-glass active:bg-holo-glass-hover"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-holo-lg border border-holo-border-soft bg-holo-glass text-holo-text-muted">
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-holo-text">{space.name}</div>
                    <div className="mt-0.5 truncate text-xs text-holo-text-faint">
                      {space.owner}/{space.repo} · {relativeTime(space.updatedAt)}
                    </div>
                    {space.description && (
                      <div className="mt-0.5 truncate text-xs text-holo-text-muted">
                        {space.description}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-holo-text-faint" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Files screen ─────────────────────────────────────────────────────────────

function FilesScreen({
  space, files, loading, search, onSearchChange, onSelect, onBack, onLogout,
}: {
  user: GithubUser
  space: HoloSpace
  files: TreeFile[] | null
  loading: boolean
  search: string
  onSearchChange: (s: string) => void
  onSelect: (path: string) => void
  onBack: () => void
  onLogout: () => void
}) {
  const mdFiles = files?.filter((f) => f.path.endsWith('.md')) ?? []

  const filtered = search.trim()
    ? mdFiles.filter((f) =>
        f.path.toLowerCase().includes(search.toLowerCase()),
      )
    : mdFiles

  // Group by folder
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, f) => {
    const parts = f.path.split('/')
    const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    ;(acc[folder] ??= []).push(f)
    return acc
  }, {})

  return (
    <div className="flex min-h-full flex-col">
      <NavBar
        title={space.name}
        left={
          <button
            onClick={onBack}
            className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
          >
            <ArrowLeft size={18} />
          </button>
        }
        right={
          <button
            onClick={onLogout}
            className="flex size-9 items-center justify-center rounded-holo-md text-holo-text-muted transition hover:bg-holo-glass hover:text-holo-text"
          >
            <LogOut size={16} />
          </button>
        }
      />

      {/* Search bar */}
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

        {!loading && filtered.length === 0 && (
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
                      <span className="min-w-0 flex-1 truncate text-sm text-holo-text">
                        {name}
                      </span>
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
  space, path, content, loading, onBack,
}: {
  user: GithubUser
  space: HoloSpace
  path: string
  content: string | null
  loading: boolean
  onBack: () => void
  onLogout: () => void
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
          <article className="holo-markdown mx-auto max-w-[720px] px-5 py-8 pb-safe-bottom">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        )}
      </div>
    </div>
  )
}

// ─── NavBar ──────────────────────────────────────────────────────────────────

function NavBar({
  title,
  left,
  right,
}: {
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
