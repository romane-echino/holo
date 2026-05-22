import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

type AbstractPanelProps = {
  title: string
  actions?: ReactNode
  subHeader?: ReactNode
  children: ReactNode
}

export function AbstractPanel({ title, actions, subHeader, children }: AbstractPanelProps) {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Mobile : barre de navigation avec bouton retour */}
      <div className="flex shrink-0 items-center gap-2 border-b border-holo-border-soft px-3 py-2 lg:hidden mb-5">
        <button
          onClick={() => navigate('/')}
          className="flex size-8 shrink-0 items-center justify-center rounded-holo-md text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="flex-1 truncate text-sm font-medium">{title}</span>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>

      {/* Desktop : entête titre + actions */}
      <div className="hidden shrink-0 items-center justify-between px-4 pb-5 pt-4 lg:flex">
        <h2 className="font-medium">{title}</h2>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>

      {/* Sous-entête optionnel (onglets, recherche…) — non scrollable */}
      {subHeader && <div className="shrink-0">{subHeader}</div>}

      {/* Contenu scrollable */}
      <div className="flex-1 overflow-y-auto holo-scrollbar px-4 pb-4">
        {children}
      </div>

    </div>
  )
}
