import { countLabel, orderedCounts } from '@/lib/filters'
import { statusTone, toneStyle } from '@/lib/tones'

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
          className="block h-full tone-dot"
          style={{ ...toneStyle(statusTone(part.status)), width: `${(100 * part.count) / total}%` }}
        />
      ))}
    </div>
  )
}
