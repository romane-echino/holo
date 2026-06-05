import { getBaseName } from '../lib/appUtils'
import type { TreeNode } from '../types/app'

interface SearchResult {
  path: string
  name: string
  isArchived?: boolean
  originalPath?: string
  matchType: string
  excerpt: string
  tags?: string[]
}

interface SidebarSearchPanelProps {
  isCompactLayout: boolean
  searchQuery: string
  searchResults: SearchResult[]
  isSearching: boolean
  onSearchInput: (value: string) => void
  onClearSearch: () => void
  onSelectNode: (node: TreeNode) => void
  onOpenTreeContextMenu: (node: TreeNode, pos: { x: number; y: number }) => void
  onSetActiveSidebar: (sidebar: 'files' | 'git' | 'search') => void
}

export function SidebarSearchPanel({
  isCompactLayout,
  searchQuery,
  searchResults,
  isSearching,
  onSearchInput,
  onClearSearch,
  onSelectNode,
  onOpenTreeContextMenu,
  onSetActiveSidebar,
}: SidebarSearchPanelProps) {
  return (
    <nav className={`bg-[#1f2021] ${isCompactLayout ? 'w-[min(340px,calc(100vw-88px))] rounded-r-lg rounded-tl-none' : 'w-[340px] shrink-0 rounded-t-lg'} overflow-x-hidden overflow-y-auto p-5 flex flex-col gap-3`}>
      <h2 className="text-sm font-semibold text-white/80">🔍 Recherche</h2>

      {/* Input */}
      <div className="relative">
        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none" />
        <input
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/5 pl-8 pr-3 py-2 text-sm text-white outline-none focus:border-[#7B61FF]/50 placeholder:text-white/25"
          placeholder="Rechercher… ou #tag ou @mention"
          value={searchQuery}
          onChange={(e) => onSearchInput(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
            onClick={onClearSearch}
          >
            <i className="fa-solid fa-xmark text-xs" />
          </button>
        )}
      </div>

      {!searchQuery && (
        <p className="text-xs text-white/25 leading-relaxed">
          Tape du texte pour chercher dans le contenu, <span className="text-[#9d8bff]">#tag</span> pour filtrer par étiquette, ou <span className="text-[#9d8bff]">@mention</span> pour retrouver une personne.
        </p>
      )}

      {isSearching && (
        <p className="text-xs text-white/35 animate-pulse">Recherche en cours…</p>
      )}

      {!isSearching && searchQuery && searchResults.length === 0 && (
        <p className="text-xs text-white/30">Aucun résultat pour « {searchQuery} »</p>
      )}

      {searchResults.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-wide text-white/30 mb-1">
            {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
          </p>
          {searchResults.map((result) => (
            <button
              key={result.path}
              className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors border border-transparent hover:border-white/8"
              onClick={() => {
                if (result.isArchived) {
                  window.alert('Ce fichier est archivé. Fais un clic droit puis "Récupérer depuis archive".')
                  return
                }
                const node: TreeNode = { name: getBaseName(result.path), path: result.path, type: 'file' }
                onSelectNode(node)
                onSetActiveSidebar('files')
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                onOpenTreeContextMenu(
                  {
                    name: getBaseName(result.path),
                    path: result.path,
                    type: 'file',
                    archivedOriginalPath: result.isArchived ? result.originalPath : undefined,
                  },
                  { x: event.clientX, y: event.clientY },
                )
              }}
            >
              <span className="text-sm font-medium text-white truncate">
                {result.name}
                {result.isArchived && <span className="ml-2 text-[10px] text-amber-300">ARCHIVE</span>}
              </span>
              <span className={`text-xs truncate ${result.matchType === 'tag' ? 'text-[#9d8bff]' : result.matchType === 'archive' ? 'text-amber-200/80' : 'text-white/40'}`}>
                {result.excerpt}
              </span>
              {result.tags && result.tags.length > 0 && result.matchType !== 'tag' && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {result.tags.slice(0, 4).map((tag) => (
                    <span key={tag} className="rounded px-1 py-0.5 text-[10px] bg-[#7B61FF]/15 text-[#9d8bff]">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </nav>
  )
}
