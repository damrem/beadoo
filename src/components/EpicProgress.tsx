import { progressLabel, progressOf, progressPercent } from '@/lib/progress'
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
