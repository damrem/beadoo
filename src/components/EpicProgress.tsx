import { Tag } from '@/components/BeadCard'
import { Emoji } from '@/components/Emoji'
import { epicMismatch, MISMATCH_TEXTS, progressLabel, progressOf, progressPercent } from '@/lib/progress'
import { statusTone, toneStyle } from '@/lib/tones'

export function EpicProgress({ title, counts }: { title: string; counts: Record<string, number> }) {
  const progress = progressOf(counts)
  const label = progressLabel(progress)
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={`${title}: ${label} children closed`}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.closed}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full tone-dot"
          style={{ ...toneStyle(statusTone('closed')), width: `${progressPercent(progress)}%` }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">{label}</span>
    </div>
  )
}

export function EpicWarning({ status, counts }: { status: string; counts: Record<string, number> }) {
  const mismatch = epicMismatch(status, progressOf(counts))
  if (!mismatch) return null
  const text = MISMATCH_TEXTS[mismatch]
  return (
    <span role="note" aria-label={text.full}>
      <Tag tone="yellow" title={text.full}>
        <Emoji emoji="⚠️" />
        {text.short}
      </Tag>
    </span>
  )
}
