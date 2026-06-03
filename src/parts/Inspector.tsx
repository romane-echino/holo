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

function slugifyHeading(text: string): string {
  return 'heading-' + text.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]+/gi, '-').replace(/^-+|-+$/g, '')
}

function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null
  while (current) {
    const style = window.getComputedStyle(current)
    const isScrollable = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight
    if (isScrollable) return current
    current = current.parentElement
  }
  return null
}

function scrollHeadingWithOffset(target: HTMLElement, offset = 64) {
  const scrollParent = findScrollParent(target)
  if (!scrollParent) {
    const top = window.scrollY + target.getBoundingClientRect().top - offset
    window.scrollTo({ top, behavior: 'smooth' })
    return
  }

  const targetRect = target.getBoundingClientRect()
  const parentRect = scrollParent.getBoundingClientRect()
  const top = scrollParent.scrollTop + targetRect.top - parentRect.top - offset
  scrollParent.scrollTo({ top, behavior: 'smooth' })
}

function extractFootnotes(markdown: string): { label: string; content: string }[] {
  const footnotes: { label: string; content: string }[] = []
  // Matches: [^label]: content (single-line)
  const regex = /^\[\^([^\]]+)\]:\s*(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = regex.exec(markdown)) !== null) {
    footnotes.push({ label: m[1], content: m[2].trim() })
  }
  return footnotes
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

type Tab = "toc" | "links" | "notes";

interface InspectorProps {
  markdown?: string;
  filePath?: string;
}

export function Inspector({ markdown, filePath }: InspectorProps) {
  const [tab, setTab] = useState<Tab>("toc");
  const [commits, setCommits] = useState<HoloGitFileCommit[]>([]);
  const { gitState } = useConfig();

  const headings = useMemo(() => (markdown ? extractHeadings(markdown) : []), [markdown]);
  const tocNumbers = useMemo(() => {
    const counters: Record<number, number> = {}
    return headings.map(h => {
      counters[h.level] = (counters[h.level] ?? 0) + 1
      Object.keys(counters).forEach(k => { if (Number(k) > h.level) delete counters[Number(k)] })
      const min = Math.min(...Object.keys(counters).map(Number))
      const parts: number[] = []
      for (let l = min; l <= h.level; l++) parts.push(counters[l] ?? 0)
      return parts.join('.')
    })
  }, [headings]);
  const links = useMemo(() => (markdown ? extractLinks(markdown) : []), [markdown]);
  const footnotes = useMemo(() => (markdown ? extractFootnotes(markdown) : []), [markdown]);

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
        <button
          onClick={() => setTab("notes")}
          className={cn(
            "rounded-holo-md px-3 py-2 text-sm transition",
            tab === "notes"
              ? "bg-holo-primary-surface text-holo-primary-soft"
              : "text-holo-text-muted hover:bg-holo-glass-hover",
          )}
        >
          Notes
        </button>
      </div>

      {/* Table des matières */}
      {tab === "toc" && (
        headings.length === 0 ? (
          <p className="text-sm text-holo-text-faint">
            {markdown ? "Aucun titre dans ce fichier." : "Ouvrez un fichier pour afficher la table des matières."}
          </p>
        ) : (
          <ol className="space-y-1 text-sm text-holo-text-muted">
            {headings.map((h, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-baseline gap-2 rounded-holo-md px-3 py-1.5 transition hover:bg-holo-glass",
                  h.level >= 3 ? "pl-4 text-holo-text-faint" : h.level === 2 ? "pl-2" : "text-holo-text",
                )}
              >
                <button
                  className="flex items-baseline gap-2 w-full text-left"
                  onClick={() => {
                    const el = document.getElementById(slugifyHeading(h.text))
                    if (el) scrollHeadingWithOffset(el, 64)
                  }}
                  title={h.text}
                >
                  <span className="shrink-0 font-mono text-[10px] text-holo-text-faint/60">{tocNumbers[i]}</span>
                  <span className="truncate">{h.text}</span>
                </button>
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

      {/* Notes (footnotes) */}
      {tab === "notes" && (
        footnotes.length === 0 ? (
          <p className="text-sm text-holo-text-faint">
            {markdown ? "Aucune note dans ce fichier." : "Ouvrez un fichier pour afficher les notes."}
          </p>
        ) : (
          <ol className="space-y-2 text-sm text-holo-text-muted">
            {footnotes.map((fn, i) => (
              <li key={i} className="rounded-holo-lg border border-holo-border-soft bg-holo-glass px-3 py-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded bg-holo-primary-surface px-1.5 py-px font-mono text-[10px] text-holo-primary-soft">{fn.label}</span>
                </div>
                <p className="text-xs leading-relaxed text-holo-text-faint">{fn.content}</p>
              </li>
            ))}
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
              {commits.slice(0, 5).map((c) => (
                <CommitCard key={c.hash} commit={c} />
              ))}
              {commits.length > 5 && (
                <p className="text-[11px] text-holo-text-faint">
                  {commits.length - 5} autre{commits.length - 5 > 1 ? 's' : ''} activité{commits.length - 5 > 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
