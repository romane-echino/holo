/**
 * ImageBlock.tsx — Bloc image
 *
 * Affiche une image avec alt-text et caption optionnelle.
 * En cas d'erreur de chargement, affiche un placeholder.
 */

import { useEffect, useState } from 'react'
import { Expand, ImageOff, X } from 'lucide-react'
import type { ImageNode } from '../lib/types'
import { cn } from '../../../utils/global'

interface ImageBlockProps {
  node: ImageNode
  isSelected?: boolean
  onSelect?: () => void
}

function isLocalRelativePath(url: string) {
  return url !== '' && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('file://')
}

export function ImageBlock({ node, isSelected, onSelect }: ImageBlockProps) {
  const [error, setError] = useState(false)
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!node.url || !isLocalRelativePath(node.url)) return
    setError(false)
    setResolvedSrc(null)
    window.holo?.loadImage(node.url)
      .then((res) => { if (res.ok) setResolvedSrc(res.dataUrl) })
      .catch(() => setError(true))
  }, [node.url])

  const displaySrc = isLocalRelativePath(node.url) ? resolvedSrc : node.url

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

  return (
    <>
      <figure
        className={cn('group relative my-4 cursor-pointer rounded-holo-xl transition', isSelected && 'ring-2 ring-holo-primary/60')}
        onClick={onSelect}
      >
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            setIsFullscreen(true)
          }}
          className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/72 px-2.5 py-1.5 text-[11px] text-white opacity-0 shadow-[0_10px_20px_rgba(0,0,0,.2)] ring-1 ring-white/10 transition hover:bg-black/82 group-hover:opacity-100 group-focus-within:opacity-100"
          title="Voir l'image en plein écran"
          aria-label="Voir l'image en plein écran"
        >
          <Expand size={12} />
        </button>
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={node.alt}
          title={node.title ?? undefined}
          onError={() => setError(true)}
          className="max-w-full rounded-holo-xl"
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
