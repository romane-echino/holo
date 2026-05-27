/**
 * ContextMenu — Composant générique de menu contextuel / dropdown
 *
 * Supporte deux modes de positionnement :
 * - Coordonnées souris (x, y) → clic-droit
 * - Ancre DOM (anchorEl) → dropdown attaché à un bouton
 */
import React, { useEffect, useRef, useState } from 'react'
import { cn } from '../utils/global'

export type ContextMenuAction =
  | {
      type: 'item'
      label: string
      icon?: React.ComponentType<{ size?: number; className?: string }>
      onClick: () => void
      variant?: 'default' | 'danger' | 'warning'
      disabled?: boolean
    }
  | { type: 'separator' }
  | { type: 'header'; label: string }

interface ContextMenuProps {
  /** Coordonnées absolues (mode clic-droit) */
  x?: number
  y?: number
  /** Élément ancre (mode dropdown bouton) — positionne le menu en-dessous à droite */
  anchorEl?: HTMLElement | null
  /** Alignement horizontal du menu par rapport à l'ancre */
  anchorAlign?: 'left' | 'right'
  items: ContextMenuAction[]
  onClose: () => void
  minWidth?: number
}

export function ContextMenu({
  x,
  y,
  anchorEl,
  anchorAlign = 'right',
  items,
  onClose,
  minWidth = 192,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  // Calcule la position après le premier rendu pour éviter le débordement viewport
  useEffect(() => {
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect()
      const menuW = minWidth
      const menuH = ref.current?.offsetHeight ?? 200
      let left = anchorAlign === 'right' ? rect.right - menuW : rect.left
      let top = rect.bottom + 6
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8
      if (left < 8) left = 8
      if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6
      if (top < 8) top = 8
      setPos({ left, top })
    } else if (x !== undefined && y !== undefined) {
      const menuW = minWidth
      const menuH = ref.current?.offsetHeight ?? 200
      let left = x
      let top = y
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8
      if (left < 8) left = 8
      if (top + menuH > window.innerHeight - 8) top = y - menuH
      if (top < 8) top = 8
      setPos({ left, top })
    }
  }, [x, y, anchorEl, anchorAlign, minWidth])

  // Ferme sur clic extérieur et Escape
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Position initiale avant calcul (hors-écran pour éviter le flash)
  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, minWidth }
    : { left: x ?? -9999, top: y ?? -9999, minWidth, opacity: 0, pointerEvents: 'none' }

  return (
    <>
      {/* Overlay transparent pour fermer sur clic en dehors */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose() }}
      />

      <div
        ref={ref}
        className="fixed z-50 overflow-hidden rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl shadow-[0_8px_30px_rgba(0,0,0,.4)]"
        style={style}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items.map((item, i) => {
          if (item.type === 'separator') {
            return <div key={i} className="mx-2 my-1 h-px bg-holo-border-soft" />
          }

          if (item.type === 'header') {
            return (
              <div key={i} className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wide text-holo-text-faint">
                {item.label}
              </div>
            )
          }

          const Icon = item.icon
          const variant = item.variant ?? 'default'

          return (
            <button
              key={i}
              disabled={item.disabled}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition',
                variant === 'default' && 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                variant === 'danger' && 'text-red-400/80 hover:bg-red-500/10 hover:text-red-400',
                variant === 'warning' && 'text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-400',
                item.disabled && 'cursor-not-allowed opacity-40',
              )}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick()
                  onClose()
                }
              }}
            >
              {Icon && <Icon size={13} className="shrink-0" />}
              {item.label}
            </button>
          )
        })}
      </div>
    </>
  )
}
