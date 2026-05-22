import { useMemo } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { cn } from './utils/global'
import { FavoritePanel, AIPanel, Header, RecentPanel, Inspector, Sidebar } from "./parts/"
import { useWorkspace } from './contexts/WorkspaceContext'
import { getBaseName } from './lib/appUtils'
import { usePopup } from './hooks/usePopup'
import { AddSpace } from './popup/AddSpace'
import { SpaceRoute } from './parts/SpacePanel'
import { Clock, Star, Bot, Folder } from 'lucide-react'
import { EditorFrame } from './parts/EditorFrame'


const PRIMARY_ITEMS = [
  { label: 'Récents', icon: Clock, to: '/recent' },
  { label: 'Favoris', icon: Star, to: '/favorites' },
  { label: 'Assistant IA', icon: Bot, to: '/ai' },
]

export default function App2() {
  const { pathname } = useLocation()
  const hasPanel = pathname !== '/'

  const { recentFolders } = useWorkspace()
  const spaces = useMemo(
    () =>
      [...recentFolders]
        .sort((a, b) => getBaseName(a).localeCompare(getBaseName(b)))
        .map((path) => ({
          label: getBaseName(path),
          icon: Folder,
          to: `/space/${encodeURIComponent(path)}`,
        })),
    [recentFolders],
  )

  const addSpace = usePopup()

  return (
    <div className="holo-window">
      <main className={cn(
        'grid h-full overflow-hidden text-holo-text',
        'grid-rows-[56px_minmax(0,1fr)]',
        hasPanel
          ? 'lg:grid-cols-[320px_320px_minmax(0,1fr)] 3xl:grid-cols-[320px_320px_minmax(0,1fr)_320px]'
          : 'lg:grid-cols-[320px_minmax(0,1fr)] 3xl:grid-cols-[320px_minmax(0,1fr)_320px]'
      )}>

        {/* Header — pleine largeur */}
        <div className="col-span-full holo-drag-region">
          <Header />
        </div>

        {/* Sidebar : visible sur desktop, cachée sur mobile quand un panel est ouvert */}
        <div className={cn(
          'h-full lg:border-r border-holo-border-soft overflow-y-auto holo-scrollbar',
          hasPanel ? 'hidden lg:block' : 'block'
        )}>
          <Sidebar primaryItems={PRIMARY_ITEMS} spaces={spaces} onAddSpace={addSpace.show} />
        </div>

        {/* Panneau secondaire — AbstractPanel gère le titre et le bouton retour */}
        {hasPanel && (
          <div className="overflow-hidden lg:border-r border-holo-border-soft">
            <Routes>
              <Route path="/recent" element={<RecentPanel />} />
              <Route path="/favorites" element={<FavoritePanel />} />
              <Route path="/space/:encodedPath" element={<SpaceRoute />} />

              {/*TODO Only visible when ai settings are set */}
              <Route path="/ai" element={<AIPanel />} />
            </Routes>
          </div>
        )}

        {/* Zone éditeur — cachée sur mobile */}
        <div className="hidden lg:block overflow-y-auto holo-scrollbar">
          <EditorFrame filepath='' />
        </div>

        {/* Inspecteur — colonne droite, grands écrans */}
        <div className="hidden 3xl:block border-l border-holo-border-soft">
          <Inspector />
        </div>

      </main>

      <AddSpace open={addSpace.open} onClose={addSpace.hide} />
    </div>
  )
}
