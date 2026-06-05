import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
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
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`)
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
    const [isEditing, setIsEditing] = useState(false)
    const [draftUrl, setDraftUrl] = useState(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
    const editorRootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
      setDraftUrl(parsed?.inputUrl ?? DEFAULT_YOUTUBE_URL)
    }, [parsed?.inputUrl])

    useEffect(() => {
      if (!isEditing) return
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }, [isEditing])

    const commit = () => {
      const trimmed = draftUrl.trim()
      const nextParsed = extractYouTubeData(trimmed)
      if (!nextParsed) {
        inputRef.current?.focus()
        return
      }

      const nextValue = buildYouTubeHtml(trimmed)
      if (nextValue !== node.value) {
        onChange({ ...node, value: nextValue })
      }
      setIsEditing(false)
    }

    useImperativeHandle(ref, () => ({
      focus: () => { setIsEditing(true) },
      clear: () => undefined,
      clearSlash: () => [],
      flush: () => undefined,
      getContent: () => [],
    }))

    if (!parsed) {
      return (
        <div className="rounded-holo-xl border border-dashed border-holo-border-soft px-3 py-2 text-sm text-holo-text-faint">
          Bloc YouTube non pris en charge
        </div>
      )
    }

    return (
      <div
        ref={editorRootRef}
        className="group relative my-4 rounded-holo-xl"
        onBlur={(event) => {
          const nextFocused = event.relatedTarget as Node | null
          if (nextFocused && editorRootRef.current?.contains(nextFocused)) return
          setIsEditing(false)
          setDraftUrl(parsed.inputUrl)
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setIsEditing((current) => !current)
          }}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/72 px-3 py-1.5 text-[11px] text-white opacity-0 shadow-[0_10px_20px_rgba(0,0,0,.22)] ring-1 ring-white/10 transition hover:bg-black/82 group-hover:opacity-100 group-focus-within:opacity-100"
          title="Modifier la vidéo YouTube"
          aria-label="Modifier la vidéo YouTube"
        >
          <Pencil size={12} />
          Modifier
        </button>

        {isEditing && (
          <div className="absolute right-2 top-12 z-20 w-[min(28rem,calc(100%-1rem))] rounded-holo-xl border border-holo-border-soft/80 bg-holo-bg-elevated/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,.26)] backdrop-blur-xl">
            <label className="block text-[11px] font-medium uppercase tracking-[0.18em] text-holo-text-faint">
              Lien YouTube
            </label>
            <input
              ref={inputRef}
              type="url"
              value={draftUrl}
              onChange={(event) => setDraftUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setIsEditing(false)
                  setDraftUrl(parsed.inputUrl)
                }
                if (event.key === 'Enter') {
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
              className="mt-2 w-full rounded-holo-lg border border-holo-border-soft bg-white/[0.03] px-3 py-2 text-sm text-holo-text outline-none transition focus:border-holo-primary/50 focus:ring-2 focus:ring-holo-primary/20"
            />
            {!extractYouTubeData(draftUrl.trim()) && draftUrl.trim() !== '' && (
              <p className="mt-2 text-xs text-amber-200">URL YouTube invalide.</p>
            )}
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setIsEditing(false)
                  setDraftUrl(parsed.inputUrl)
                }}
                className="rounded-holo-sm px-2 py-1 text-[11px] text-holo-text-faint hover:bg-holo-glass"
              >
                Annuler
              </button>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit()}
                className="rounded-holo-sm px-2 py-1 text-[11px] text-holo-primary-soft hover:bg-holo-primary/10"
              >
                Valider
              </button>
            </div>
          </div>
        )}

        <figure className="cursor-default rounded-holo-xl transition hover:opacity-95">
          <div className="overflow-hidden rounded-holo-xl border border-holo-border-soft/70 bg-black/25">
            <div className="aspect-video w-full bg-black">
              <iframe
                src={parsed.embedUrl}
                title="Vidéo YouTube"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full border-0"
              />
            </div>
          </div>
          <figcaption className="mt-2 text-center text-xs text-holo-text-faint">
            {parsed.inputUrl}
          </figcaption>
        </figure>
      </div>
    )
  },
)