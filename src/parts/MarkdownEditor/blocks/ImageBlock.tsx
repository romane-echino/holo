/**
 * ImageBlock.tsx — Bloc image
 *
 * Affiche une image avec alt-text et caption optionnelle.
 * Modes d'affichage : pleine largeur (full), bannière, miniature, 25 %, 50 %.
 * En cas d'erreur de chargement, affiche un placeholder.
 */

import { type CSSProperties, useEffect, useRef, useState } from 'react'
import { Expand, ImageOff, LayoutGrid, RectangleHorizontal, Square, X } from 'lucide-react'
import type { ImageDisplayMode, ImageMetadata, ImageNode } from '../lib/types'
import { cn } from '../../../utils/global'

interface ImageBlockProps {
  node: ImageNode
  isSelected?: boolean
  onSelect?: () => void
  onChange?: (node: ImageNode) => void
}

const DISPLAY_MODE_OPTIONS: { value: ImageDisplayMode; label: string; Icon: typeof Expand }[] = [
  { value: 'full', label: 'Pleine largeur', Icon: Expand },
  { value: 'banner', label: 'Bannière', Icon: RectangleHorizontal },
  { value: 'thumbnail', label: 'Miniature', Icon: Square },
  { value: 'half', label: '50 %', Icon: LayoutGrid },
  { value: 'quarter', label: '25 %', Icon: LayoutGrid },
]

function getDisplayModeLabel(mode: ImageDisplayMode): string {
  return DISPLAY_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Pleine largeur'
}

function isLocalRelativePath(url: string) {
  return url !== '' && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('file://')
}

export function ImageBlock({ node, isSelected, onSelect, onChange }: ImageBlockProps) {
  const [error, setError] = useState(false)
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false)
  const modeMenuRef = useRef<HTMLDivElement>(null)

  const displayMode: ImageDisplayMode = node.data?.holoImage?.displayMode ?? 'full'

  useEffect(() => {
    if (!node.url || !isLocalRelativePath(node.url)) return
    setError(false)
    setResolvedSrc(null)
    window.holo?.loadImage(node.url)
      .then((res) => { if (res.ok) setResolvedSrc(res.dataUrl) })
      .catch(() => setError(true))
  }, [node.url])

  useEffect(() => {
    if (!isModeMenuOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!modeMenuRef.current?.contains(event.target as Node)) setIsModeMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isModeMenuOpen])

  const displaySrc = isLocalRelativePath(node.url) ? resolvedSrc : node.url

  const setDisplayMode = (mode: ImageDisplayMode) => {
    setIsModeMenuOpen(false)
    if (!onChange || mode === displayMode) return
    const holoImage: ImageMetadata = { ...(node.data?.holoImage ?? {}) }
    if (mode === 'full') delete holoImage.displayMode
    else holoImage.displayMode = mode
    onChange({ ...node, data: { ...(node.data ?? {}), holoImage } })
  }

  if (error || !node.url) {
    return (
      <div
        onClick={onSelect}
        className={cn(
          'my-4 flex cursor-pointer items-center gap-3 rounded-holo-xl border border-dashed px-4 py-6 text-holo-text-faint transition',
          isSelected ? 'border-holo-primary/60 ring-2 ring-holo-primary/40' : 'border-holo-border-soft',
        )}
      >
        <ImageOff size={18} className="shrink-0" />
        <div>
          <p className="text-sm">{node.alt || 'Image non disponible'}</p>
          {node.url && (
            <p className="mt-0.5 truncate font-mono text-[11px] opacity-60">{node.url}</p>
          )}
        </div>
      </div>
    )
  }

  // Calcule le style de la figure et de l'image selon le mode d'affichage.
  const figureStyle: CSSProperties = {}
  let figureWidthClass = ''
  let imgClassName = 'rounded-holo-xl'
  switch (displayMode) {
    case 'banner':
      figureWidthClass = 'w-full'
      imgClassName += ' h-48 w-full object-cover'
      break
    case 'thumbnail':
      figureWidthClass = 'w-fit'
      imgClassName += ' h-40 w-40 object-cover'
      break
    case 'quarter':
      figureWidthClass = 'w-fit'
      figureStyle.width = '25%'
      imgClassName += ' h-auto w-full'
      break
    case 'half':
      figureWidthClass = 'w-fit'
      figureStyle.width = '50%'
      imgClassName += ' h-auto w-full'
      break
    case 'full':
    default:
      imgClassName += ' h-auto max-w-full'
      break
  }

  return (
    <>
      <figure
        className={cn('group relative my-4 cursor-pointer rounded-holo-xl transition', figureWidthClass, isSelected && 'ring-2 ring-holo-primary/60')}
        style={figureStyle}
        onClick={onSelect}
      >
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          {onChange && (
            <div ref={modeMenuRef} className="relative">
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  setIsModeMenuOpen((open) => !open)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-black/72 px-2.5 py-1.5 text-[11px] text-white shadow-[0_10px_20px_rgba(0,0,0,.2)] ring-1 ring-white/10 transition hover:bg-black/82"
                title="Mode d'affichage"
                aria-label="Mode d'affichage"
                aria-haspopup="menu"
                aria-expanded={isModeMenuOpen}
              >
                <LayoutGrid size={12} />
                {getDisplayModeLabel(displayMode)}
              </button>
              {isModeMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-[9999] mt-1 min-w-[160px] overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  {DISPLAY_MODE_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={value === displayMode}
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setDisplayMode(value)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-holo-md px-2.5 py-2 text-left text-sm transition',
                        value === displayMode
                          ? 'bg-holo-glass-hover text-holo-text'
                          : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                      )}
                    >
                      <Icon size={14} className="shrink-0" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setIsFullscreen(true)
            }}
            className="inline-flex items-center gap-1 rounded-full bg-black/72 px-2.5 py-1.5 text-[11px] text-white shadow-[0_10px_20px_rgba(0,0,0,.2)] ring-1 ring-white/10 transition hover:bg-black/82"
            title="Voir l'image en plein écran"
            aria-label="Voir l'image en plein écran"
          >
            <Expand size={12} />
          </button>
        </div>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={node.alt}
          title={node.title ?? undefined}
          onError={() => setError(true)}
          className={imgClassName}
          loading="lazy"
        />
      ) : isLocalRelativePath(node.url) ? (
        <div className="my-4 flex items-center gap-3 rounded-holo-xl border border-dashed border-holo-border-soft px-4 py-6 text-holo-text-faint">
          <span className="text-xs opacity-60">Chargement…</span>
        </div>
      ) : null}
      {(node.alt || node.title) && (
        <figcaption className="mt-2 text-center text-xs text-holo-text-faint">
          {node.title || node.alt}
        </figcaption>
      )}
      </figure>

      {isFullscreen && displaySrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          onClick={() => setIsFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Image en plein écran"
        >
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setIsFullscreen(false)
            }}
            className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-full bg-black/70 px-3 py-2 text-sm text-white ring-1 ring-white/10"
            aria-label="Fermer l'image en plein écran"
          >
            <X size={14} />
            Fermer
          </button>
          <img
            src={displaySrc}
            alt={node.alt}
            title={node.title ?? undefined}
            className="max-h-full max-w-full rounded-holo-xl object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
