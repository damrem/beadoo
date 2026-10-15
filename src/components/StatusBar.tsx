import { cn } from '@/lib/utils'
import { countLabel, orderedCounts } from '@/lib/filters'

const SEGMENT_COLORS: Record<string, string> = {
  open: 'bg-slate-500',
  in_progress: 'bg-orange-600',
  blocked: 'bg-red-600',
  closed: 'bg-slate-300',
  deferred: 'bg-violet-500',
}

export function StatusBar({ title, counts }: { title: string; counts: Record<string, number> }) {
  const parts = orderedCounts(counts)
  const total = parts.reduce((sum, part) => sum + part.count, 0)
  return (
    <div
      role="img"
      aria-label={`${title}: ${countLabel(counts)}`}
      className="flex h-2 w-40 shrink-0 overflow-hidden rounded-full bg-muted"
    >
      {parts.map((part) => (
        <span
          key={part.status}
          data-status={part.status}
          className={cn('block h-full', SEGMENT_COLORS[part.status] ?? 'bg-muted-foreground')}
          style={{ width: `${(100 * part.count) / total}%` }}
        />
      ))}
    </div>
  )
}
