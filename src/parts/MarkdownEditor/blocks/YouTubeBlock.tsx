import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { PlaySquare, Video } from 'lucide-react'
import type { InlineEditorHandle } from '../InlineEditor'
import type { HtmlNode } from './DetailsBlock'

interface YouTubeBlockProps {
  node: HtmlNode
  onChange: (node: HtmlNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

interface ParsedYouTubeBlock {
  videoId: string
  embedUrl: string
  inputUrl: string
}

const DEFAULT_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const YOUTUBE_IFRAME_SRC_REGEX = /<iframe[^>]+src=["'](?<src>[^"']+)["'][^>]*>/i

function normalizeYouTubeId(candidate: string | null | undefined): string | null {
  if (!candidate) return null
  const cleaned = candidate.trim()
  return /^[A-Za-z0-9_-]{11}$/.test(cleaned) ? cleaned : null
}

function extractStartSeconds(url: URL): number | null {
  const raw = url.searchParams.get('start') ?? url.searchParams.get('t')
  if (!raw) return null
  const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$|^(\d+)$/)
  if (!match) return null
  if (match[4]) return Number(match[4])
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  const seconds = Number(match[3] ?? 0)
  return (hours * 3600) + (minutes * 60) + seconds
}

function extractYouTubeData(value: string): { videoId: string; startSeconds: number | null } | null {
  const trimmed = value.trim()
  const srcMatch = trimmed.match(YOUTUBE_IFRAME_SRC_REGEX)
  const source = srcMatch?.groups?.src ?? trimmed

  const directId = normalizeYouTubeId(source)
  if (directId) return { videoId: directId, startSeconds: null }

  try {
    const url = new URL(source)
    const hostname = url.hostname.replace(/^www\./, '')
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const startSeconds = extractStartSeconds(url)

    if (hostname === 'youtu.be') {
      const videoId = normalizeYouTubeId(pathSegments[0])
      return videoId ? { videoId, startSeconds } : null
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'youtube-nocookie.com') {
      if (pathSegments[0] === 'watch') {
        const videoId = normalizeYouTubeId(url.searchParams.get('v'))
        return videoId ? { videoId, startSeconds } : null
      }

      if (pathSegments[0] === 'embed' || pathSegments[0] === 'shorts' || pathSegments[0] === 'live') {
        const videoId = normalizeYouTubeId(pathSegments[1])
        return videoId ? { videoId, startSeconds } : null
      }
    }
  } catch {
    return null
  }

  return null
}

function buildEmbedUrl(videoId: string, startSeconds?: number | null): string {
  const url = new URL(`https://www.youtube.com/embed/${videoId}`)
  if (startSeconds && startSeconds > 0) {
    url.searchParams.set('start', String(startSeconds))
  }
  return url.toString()
}

export function buildYouTubeHtml(value: string): string {
  const parsed = extractYouTubeData(value) ?? extractYouTubeData(DEFAULT_YOUTUBE_URL)
  const embedUrl = buildEmbedUrl(parsed!.videoId, parsed!.startSeconds)
  return `<iframe src="${embedUrl}" title="Vidéo YouTube" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
}

export function parseYouTubeHtml(value: string): ParsedYouTubeBlock | null {
  const parsed = extractYouTubeData(value)
  if (!parsed) return null

  return {
    videoId: parsed.videoId,
    embedUrl: buildEmbedUrl(parsed.videoId, parsed.startSeconds),
    inputUrl: `https://www.youtube.com/watch?v=${parsed.videoId}`,
  }
}

export function isYouTubeHtmlNode(node: unknown): node is HtmlNode {
  return Boolean(
    node
    && typeof node === 'object'
    && 'type' in node
    && 'value' in node
    && (node as { type?: string }).type === 'html'
    && typeof (node as { value?: string }).value === 'string'
    && parseYouTubeHtml((node as { value: string }).value),
  )
}

export const YouTubeBlock = forwardRef<InlineEditorHandle, YouTubeBlockProps>(
  function YouTubeBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const parsed = useMemo(() => parseYouTubeHtml(node.value), [node.value])
    const [editing, setEditing] = useState(false)
    const [draftUrl, setDraftUrl] = useState(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      setDraftUrl(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
    }, [parsed?.inputUrl])

    const draftParsed = useMemo(() => extractYouTubeData(draftUrl), [draftUrl])

    const commit = () => {
      if (!draftParsed) return
      setEditing(false)
      const nextValue = buildYouTubeHtml(draftUrl)
      if (nextValue !== node.value) {
        onChange({ ...node, value: nextValue })
      }
    }

    useImperativeHandle(ref, () => ({
      focus: () => {
        setEditing(true)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
      },
      clear: () => setDraftUrl(''),
      clearSlash: () => [],
      flush: () => { commit() },
      getContent: () => [],
    }))

    const handleEditorBlur = (event: React.FocusEvent<HTMLDivElement>) => {
      const nextFocused = event.relatedTarget as Node | null
      if (nextFocused && editorRootRef.current?.contains(nextFocused)) return
      commit()
    }

    if (!parsed && !editing) {
      return (
        <div className="rounded-holo-xl border border-dashed border-holo-border-soft px-3 py-2 text-sm text-holo-text-faint">
          Bloc YouTube non pris en charge
        </div>
      )
    }

    if (editing) {
      return (
        <div
          ref={editorRootRef}
          onBlur={handleEditorBlur}
          className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30"
        >
          <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint">
              <PlaySquare size={12} className="text-red-300" />
              youtube
            </div>
            <div className="flex items-center gap-2">
              <button
                onMouseDown={(event) => { event.preventDefault(); commit() }}
                disabled={!draftParsed}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-primary-soft enabled:hover:bg-holo-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Valider
              </button>
              <button
                onMouseDown={(event) => {
                  event.preventDefault()
                  setDraftUrl(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
                  setEditing(false)
                }}
                className="rounded-holo-sm px-2 py-0.5 text-[11px] text-holo-text-faint hover:bg-holo-glass"
              >
                Annuler
              </button>
            </div>
          </div>

          <div className="grid gap-px bg-holo-border-soft/50 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3 bg-black/10 px-4 py-4">
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-holo-text-faint">
                URL YouTube
              </label>
              <input
                ref={inputRef}
                type="url"
                value={draftUrl}
                onChange={(event) => setDraftUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setDraftUrl(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
                    setEditing(false)
                  }
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault()
                    commit()
                    onEnterAtEnd?.()
                  }
                  if (event.key === 'Backspace' && draftUrl === '') {
                    event.preventDefault()
                    onBackspaceAtStart?.()
                  }
                }}
                placeholder={DEFAULT_YOUTUBE_URL}
                className="w-full rounded-holo-lg border border-holo-border-soft bg-white/[0.03] px-3 py-2 text-sm text-holo-text outline-none transition focus:border-holo-primary/50 focus:ring-2 focus:ring-holo-primary/20"
              />
              <p className="text-xs text-holo-text-faint">
                Colle un lien youtu.be, watch, embed, shorts ou directement un identifiant vidéo.
              </p>
              {!draftParsed && draftUrl.trim() !== '' && (
                <p className="rounded-holo-md border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  URL YouTube invalide.
                </p>
              )}
            </div>

            <div className="bg-[linear-gradient(180deg,rgba(239,68,68,0.08),rgba(0,0,0,0))] p-4">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-black/10 px-2.5 py-1 text-[11px] text-holo-text-faint">
                <Video size={11} className="text-red-300" />
                Aperçu YouTube
              </div>
              <div className="overflow-hidden rounded-holo-lg border border-holo-border-soft bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
                {draftParsed ? (
                  <div className="aspect-video w-full bg-black">
                    <iframe
                      src={buildEmbedUrl(draftParsed.videoId, draftParsed.startSeconds)}
                      title="Vidéo YouTube"
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-holo-text-faint">
                    Entrez un lien YouTube valide pour afficher l’aperçu.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="group relative my-4 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-glass/30">
        <div className="flex items-center justify-between gap-3 border-b border-holo-border-soft/60 px-4 py-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 rounded-full border border-holo-border-soft bg-white/[0.03] px-2.5 py-1 text-[11px] text-holo-text-faint transition hover:text-holo-text"
            title="Cliquer pour modifier la vidéo YouTube"
          >
            <PlaySquare size={12} className="text-red-300" />
            youtube
          </button>
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          className="block w-full p-4 text-left"
          title="Cliquer pour modifier le lien YouTube"
        >
          <div className="overflow-hidden rounded-holo-lg border border-holo-border-soft bg-black/30 shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
            <div className="aspect-video w-full bg-black">
              <iframe
                src={parsed?.embedUrl ?? buildEmbedUrl('dQw4w9WgXcQ')}
                title="Vidéo YouTube"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="pointer-events-none h-full w-full border-0"
              />
            </div>
          </div>
        </button>
      </div>
    )
  },
)