import { useEffect, useMemo, useState } from "react";
import { cn } from "../utils/global";
import { useConfig } from "../contexts/ConfigContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractHeadings(markdown: string): { level: number; text: string }[] {
  return markdown
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,6})\s+(.+)$/);
      if (!m) return null;
      return { level: m[1].length, text: m[2].replace(/[*_`[\]!]/g, "").trim() };
    })
    .filter(Boolean) as { level: number; text: string }[];
}

function extractLinks(markdown: string): { text: string; url: string }[] {
  const links: { text: string; url: string }[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    const url = m[2].split(" ")[0];
    if (!links.some((l) => l.url === url)) {
      links.push({ text: m[1], url });
    }
  }
  return links;
}

function relativeTime(isoString: string | undefined): string {
  if (!isoString) return "";
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `il y a ${days}j`;
  } catch {
    return "";
  }
}

// ─── Commit card ─────────────────────────────────────────────────────────────

type HoloGitFileCommit = {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  timestamp: string
  subject: string
}

function CommitCard({ commit }: { commit: HoloGitFileCommit }) {
  const initials = commit.authorName
    .split(" ")
    .map((w: string) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="holo-glass rounded-holo-xl p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-holo-primary-surface text-[11px] font-semibold text-holo-primary-soft">
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-holo-text">{commit.subject}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-holo-text-faint">
            <span>{commit.authorName}</span>
            <span>·</span>
            <span>{relativeTime(commit.timestamp)}</span>
            <span className="ml-auto font-mono">{commit.shortHash}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = "toc" | "links";

interface InspectorProps {
  markdown?: string;
  filePath?: string;
}

export function Inspector({ markdown, filePath }: InspectorProps) {
  const [tab, setTab] = useState<Tab>("toc");
  const [commits, setCommits] = useState<HoloGitFileCommit[]>([]);
  const { gitState } = useConfig();

  const headings = useMemo(() => (markdown ? extractHeadings(markdown) : []), [markdown]);
  const links = useMemo(() => (markdown ? extractLinks(markdown) : []), [markdown]);

  useEffect(() => {
    if (!filePath || !gitState.isRepo) {
      setCommits([]);
      return;
    }
    window.holo?.gitGetFileLog(filePath, 10).then((result) => setCommits(result ?? [])).catch(() => setCommits([]));
  }, [filePath, gitState.isRepo]);

  return (
    <aside className="h-full overflow-y-auto holo-scrollbar p-4">
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setTab("toc")}
          className={cn(
            "rounded-holo-md px-3 py-2 text-sm transition",
            tab === "toc"
              ? "bg-holo-primary-surface text-holo-primary-soft"
              : "text-holo-text-muted hover:bg-holo-glass-hover",
          )}
        >
          Table des matières
        </button>
        <button
          onClick={() => setTab("links")}
          className={cn(
            "rounded-holo-md px-3 py-2 text-sm transition",
            tab === "links"
              ? "bg-holo-primary-surface text-holo-primary-soft"
              : "text-holo-text-muted hover:bg-holo-glass-hover",
          )}
        >
          Liens
        </button>
      </div>

      {/* Table des matières */}
      {tab === "toc" && (
        headings.length === 0 ? (
          <p className="text-sm text-holo-text-faint">
            {markdown ? "Aucun titre dans ce fichier." : "Ouvrez un fichier pour afficher la table des matières."}
          </p>
        ) : (
          <ol className="space-y-3 text-sm text-holo-text-muted">
            {headings.map((h, i) => (
              <li
                key={i}
                className={cn(
                  i === 0 && "rounded-holo-md bg-holo-glass px-3 py-2 text-holo-text",
                  h.level >= 3 ? "pl-4 text-holo-text-faint" : h.level === 2 ? "pl-2" : undefined,
                )}
              >
                {h.text}
              </li>
            ))}
          </ol>
        )
      )}

      {/* Liens */}
      {tab === "links" && (
        links.length === 0 ? (
          <p className="text-sm text-holo-text-faint">
            {markdown ? "Aucun lien dans ce fichier." : "Ouvrez un fichier pour afficher les liens."}
          </p>
        ) : (
          <ol className="space-y-3 text-sm text-holo-text-muted">
            {links.map((link, i) => {
              const isExternal = link.url.startsWith("http://") || link.url.startsWith("https://");
              return (
                <li key={i}>
                  <button
                    onClick={() => isExternal && window.holo?.openExternalUrl(link.url)}
                    className={cn(
                      "w-full rounded-holo-md px-3 py-2 text-left transition",
                      i === 0 ? "bg-holo-glass text-holo-text" : "text-holo-text-muted hover:bg-holo-glass-hover",
                    )}
                  >
                    <div className="truncate font-medium">{link.text}</div>
                    <div className="mt-0.5 truncate text-xs text-holo-text-faint">{link.url}</div>
                  </button>
                </li>
              );
            })}
          </ol>
        )
      )}

      {/* Activités git */}
      {markdown && (
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-[11px] uppercase tracking-wider text-holo-text-faint">Activités</span>
          </div>
          {commits.length === 0 ? (
            <p className="text-sm text-holo-text-faint">
              {gitState.isRepo ? "Aucun commit pour ce fichier." : "Dossier non versionné."}
            </p>
          ) : (
            <div className="space-y-3">
              {commits.map((c) => (
                <CommitCard key={c.hash} commit={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
