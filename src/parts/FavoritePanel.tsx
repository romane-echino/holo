import { AbstractPanel } from './AbstractPanel'
import { DocumentButton } from "./RecentPanel"

type HoloDocumentListProps = {
  documents?: HoloDocument[];
  onSelectDocument?: (doc: HoloDocument) => void;
};

export type HoloDocument = {
  title: string;
  icon?: string;
  to: string;
  subtitle?: string;
  active?: boolean;
};


export function FavoritePanel({ documents = [], onSelectDocument }: HoloDocumentListProps) {
  return (
    <AbstractPanel title="Favoris">
      <div className="space-y-1">
        {documents?.map((doc) => <DocumentButton key={doc.title} doc={doc} onSelect={onSelectDocument} />)}
        {documents.length === 0 && <div className="px-3 py-2 text-sm text-holo-text-faint">Aucun document favori</div>}
      </div>
    </AbstractPanel>
  )
}
