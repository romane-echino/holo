import { cn } from '../utils/global'
import { peerInitials } from '../lib/realtime/peers'

type Peer = { clientId: number; name: string; email?: string; color: string }

const SIZE_CLASS = {
  xs: 'size-4 text-[8px] ring-1',
  sm: 'size-5 text-[9px] ring-2',
  md: 'size-6 text-[10px] ring-2',
} as const

/** Pastilles d'initiales colorées, empilées ; cliquables si `onPeerClick` est fourni. */
export function PeerAvatars<T extends Peer>({
  peers,
  max = 3,
  size = 'sm',
  className,
  onPeerClick,
  peerTitle,
}: {
  peers: T[]
  max?: number
  size?: keyof typeof SIZE_CLASS
  className?: string
  onPeerClick?: (peer: T) => void
  peerTitle?: (peer: T) => string
}) {
  if (peers.length === 0) return null
  const visible = peers.slice(0, max)
  const overflow = peers.length - visible.length
  return (
    <span className={cn('flex shrink-0', size === 'xs' ? '-space-x-1' : '-space-x-1.5', className)}>
      {visible.map((peer) => {
        const initials = size === 'xs' ? peerInitials(peer.name).slice(0, 1) : peerInitials(peer.name)
        const classes = cn('flex items-center justify-center rounded-full font-semibold leading-none text-black/80 ring-holo-bg', SIZE_CLASS[size])
        return onPeerClick ? (
          <button
            key={peer.clientId}
            type="button"
            className={cn(classes, 'holo-no-drag relative cursor-pointer transition-transform hover:z-10 hover:scale-110')}
            style={{ backgroundColor: peer.color }}
            aria-label={peer.name}
            title={peerTitle?.(peer)}
            onClick={() => onPeerClick(peer)}
          >
            {initials}
          </button>
        ) : (
          <span key={peer.clientId} className={classes} style={{ backgroundColor: peer.color }} aria-label={peer.name}>
            {initials}
          </span>
        )
      })}
      {overflow > 0 && (
        <span className={cn('flex items-center justify-center rounded-full bg-holo-glass-strong leading-none text-holo-text-muted ring-holo-bg', SIZE_CLASS[size])}>
          +{overflow}
        </span>
      )}
    </span>
  )
}
