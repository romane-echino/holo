import { ExternalLink, GitCommit, GitPullRequestArrow, Minus, Plus } from 'lucide-react'
import { cn } from '../utils/global'

export type InspectorActivity = {
  hash: string
  shortHash: string
  authorName: string
  authorEmail: string
  timestamp: string
  subject: string
  added: number
  deleted: number
  additionsPreview: string[]
  deletionsPreview: string[]
  commitUrl: string | null
}

function relativeTime(isoString: string | undefined): string {
  if (!isoString) return ''

  try {
    const diff = Date.now() - new Date(isoString).getTime()
    const mins = Math.floor(diff / 60000)

    if (mins < 1) return "à l'instant"
    if (mins < 60) return `il y a ${mins}m`

    const hours = Math.floor(mins / 60)
    if (hours < 24) return `il y a ${hours}h`

    const days = Math.floor(hours / 24)
    return `il y a ${days}j`
  } catch {
    return ''
  }
}

function compactName(name: string) {
  if (!name) return 'Auteur inconnu'
  const parts = name.trim().split(/\s+/)
  if (parts.length <= 1) return parts[0]
  return `${parts[0]} ${parts[1]?.[0] ?? ''}.`
}

function DiffCounter({
  tone,
  value,
}: {
  tone: 'added' | 'deleted'
  value: number
}) {
  const isAdded = tone === 'added'

  if (!value) return null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none',
        isAdded ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300',
      )}
    >
      {isAdded ? <Plus size={9} /> : <Minus size={9} />}
      {value}
    </span>
  )
}

function PreviewLine({
  tone,
  children,
}: {
  tone: 'added' | 'deleted'
  children: string
}) {
  const isAdded = tone === 'added'

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-holo-sm px-2 py-1 font-mono text-[10px] leading-4',
        isAdded
          ? 'bg-emerald-400/[0.055] text-emerald-200/85'
          : 'bg-rose-400/[0.055] text-rose-200/85',
      )}
    >
      <span className={cn('shrink-0 select-none', isAdded ? 'text-emerald-300/80' : 'text-rose-300/80')}>
        {isAdded ? '+' : '-'}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  )
}

export function ActivityCard({
  activity,
  onClick,
  compact = false,
}: {
  activity: InspectorActivity
  onClick?: () => void
  compact?: boolean
}) {
  const clickable = Boolean(onClick)
  const hasDiffPreview = activity.additionsPreview.length > 0 || activity.deletionsPreview.length > 0
  const showPreview = hasDiffPreview && !compact

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={cn(
        'group/activity relative grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 text-left',
        clickable ? 'cursor-pointer' : 'cursor-default',
      )}
    >
      {/* Timeline rail */}
      <div className="relative flex justify-center">
        <div className="absolute bottom-[-0.9rem] top-5 w-px bg-holo-border-soft" />

        <div
          className={cn(
            'relative z-10 mt-1 flex size-5 items-center justify-center rounded-full border bg-holo-bg transition',
            clickable
              ? 'border-holo-border-soft text-holo-text-faint group-hover/activity:border-holo-primary/40 group-hover/activity:bg-holo-primary-surface group-hover/activity:text-holo-primary-soft'
              : 'border-holo-border-soft text-holo-text-faint',
          )}
        >
          <GitCommit size={11} />
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'min-w-0 rounded-holo-xl px-2.5 py-2 transition',
          clickable && 'hover:bg-holo-glass-hover active:scale-[0.995]',
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className='flex justify-between'>
                <p className="line-clamp-2 text-sm font-medium leading-5 text-holo-text">
              {compactName(activity.authorName)}
            </p>
             <span className='text-[11px] leading-4 text-white/60'>{relativeTime(activity.timestamp)}</span>
            </div>

          </div>

          {activity.commitUrl ? (
            <ExternalLink
              size={13}
              className="mt-0.5 shrink-0 text-holo-text-faint opacity-0 transition group-hover/activity:text-holo-primary-soft group-hover/activity:opacity-100"
            />
          ) : (
            <GitPullRequestArrow size={13} className="mt-0.5 shrink-0 text-holo-text-faint/55" />
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <DiffCounter tone="added" value={activity.added} />
          <DiffCounter tone="deleted" value={activity.deleted} />

          {!activity.added && !activity.deleted && (
            <span className="text-[10px] text-holo-text-faint">Aucun diff</span>
          )}
        </div>

        {showPreview && (
          <div className="mt-2 space-y-1">
            {activity.additionsPreview.slice(0, 1).map((line, index) => (
              <PreviewLine key={`add-${activity.hash}-${index}`} tone="added">
                {line}
              </PreviewLine>
            ))}

            {activity.deletionsPreview.slice(0, 1).map((line, index) => (
              <PreviewLine key={`del-${activity.hash}-${index}`} tone="deleted">
                {line}
              </PreviewLine>
            ))}
          </div>
        )}

        {!activity.commitUrl && !compact && (
          <p className="mt-2 text-[10px] leading-4 text-holo-text-faint">
            Remote non disponible
          </p>
        )}
      </div>
    </button>
  )
}

export function ActivityTimeline({
  activities,
  onActivityClick,
  compact = false,
}: {
  activities: InspectorActivity[]
  onActivityClick?: (activity: InspectorActivity) => void
  compact?: boolean
}) {
  if (!activities.length) {
    return (
      <div className="rounded-holo-xl border border-holo-border-soft bg-white/[0.018] px-3 py-5 text-center">
        <div className="mx-auto mb-3 flex size-8 items-center justify-center rounded-holo-lg bg-holo-glass text-holo-text-faint">
          <GitCommit size={15} />
        </div>
        <p className="text-sm font-medium text-holo-text">Aucune activité</p>
        <p className="mt-1 text-xs leading-5 text-holo-text-faint">Les commits récents apparaîtront ici.</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {activities.map((activity) => (
        <ActivityCard
          key={activity.hash}
          activity={activity}
          compact={compact}
          onClick={onActivityClick ? () => onActivityClick(activity) : undefined}
        />
      ))}
    </div>
  )
}
