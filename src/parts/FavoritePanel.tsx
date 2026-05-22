import { AbstractPanel } from './AbstractPanel'
import { DocumentButton } from "./RecentPanel"

type HoloDocumentListProps = {
  spaces?: HoloDocument[];
  documents?: HoloDocument[];
  onEmptyRecent?: () => void;
};

export type HoloDocument = {
  title: string;
  icon?: string;
  to: string;
  subtitle?: string;
  active?: boolean;
};


export function FavoritePanel({documents = [], spaces = [] }: HoloDocumentListProps) {
  return (
    <AbstractPanel title="Favoris">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-holo-text-faint">Documents</div>
      <div className="space-y-1">
        {documents?.map((doc) => <DocumentButton key={doc.title} doc={doc} />)}
        {documents.length === 0 && <div className="px-3 py-2 text-sm text-holo-text-faint">Aucun document favori</div>}
      </div>

      <div className="mb-2 mt-7 text-[11px] uppercase tracking-wider text-holo-text-faint">Espaces</div>
      <div className="space-y-1">
        {spaces?.map((doc) => <DocumentButton key={doc.title} doc={doc} />)}
        {spaces.length === 0 && <div className="px-3 py-2 text-sm text-holo-text-faint">Aucun espace favori</div>}
      </div>
    </AbstractPanel>
  )
}
