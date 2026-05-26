import { useNavigate } from 'react-router-dom'
import { AbstractPanel } from './AbstractPanel'
import { cn } from "../utils/global"
import { Trash2 } from 'lucide-react'

type HoloDocumentListProps = {
  documents?: HoloDocument[];
  onEmptyRecent?: () => void;
  onSelectDocument?: (doc: HoloDocument) => void;
};

export type HoloDocument = {
  title: string;
  icon?: string;
  to: string;
  subtitle?: string;
  active?: boolean;
};

export function DocumentButton({ doc, onSelect }: { doc: HoloDocument; onSelect?: (doc: HoloDocument) => void }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => onSelect ? onSelect(doc) : navigate(doc.to)}
      className={cn(
        "w-full rounded-holo-md px-3 py-2 text-left text-sm text-holo-text-muted transition hover:bg-holo-glass-hover",
        doc.active && "bg-holo-primary-surface text-holo-primary-soft"
      )}
    >
      <div className="flex items-center gap-2">
        <span>{doc.icon ?? "▧"}</span>
        <span className="truncate">{doc.title}</span>
      </div>
      {doc.subtitle && <div className="mt-1 truncate pl-6 text-xs text-holo-text-faint">{doc.subtitle}</div>}
    </button>
  );
}

export function RecentPanel({ documents = [], onEmptyRecent, onSelectDocument }: HoloDocumentListProps) {
  return (
    <AbstractPanel
      title="Récents"
      actions={
        documents.length > 0 ? (
          <button
            onClick={onEmptyRecent}
            className="flex size-8 items-center justify-center rounded-holo-md text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text"
            title="Vider les récents"
          >
            <Trash2 size={14} />
          </button>
        ) : null
      }
    >
      <div className="space-y-1">
        {documents.map((doc) => <DocumentButton key={doc.to} doc={doc} onSelect={onSelectDocument} />)}
        {documents.length === 0 && <div className="px-3 py-2 text-sm text-holo-text-faint">Aucun document récent</div>}
      </div>
    </AbstractPanel>
  )
}
