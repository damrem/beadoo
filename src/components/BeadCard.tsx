import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ToneDot } from '@/components/ToneDot'
import type { Bead } from '../../shared/contract'
import { statusTitle } from '@/lib/filters'
import { leaseLabel, leaseState } from '@/lib/lease'
import type { Tone } from '@/lib/palette'
import { labelTone, priorityTone, statusTone, toneStyle, typeStyle } from '@/lib/tones'
import { cn } from '@/lib/utils'

const PATTERN_CLASSES = {
  none: '',
  stripes: 'pattern-stripes',
  dots: 'pattern-dots',
  hatch: 'pattern-hatch',
  lines: 'pattern-lines',
}

export function Tag({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] leading-none',
        tone ? 'tone-chip' : 'text-muted-foreground',
      )}
      style={tone ? toneStyle(tone) : undefined}
    >
      {children}
    </span>
  )
}

export function BeadCard({ bead, onOpen }: { bead: Bead; onOpen: (id: string) => void }) {
  const now = new Date()
  const lease = leaseState(bead, now)
  const leaseText = leaseLabel(lease, now)
  const type = typeStyle(bead.issue_type)
  return (
    <button
      type="button"
      onClick={() => onOpen(bead.id)}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl"
      aria-label={`${bead.id} ${bead.title}`}
    >
      <Card
        size="sm"
        data-type={bead.issue_type}
        className="gap-2 pt-0 ring-2 ring-(color:--tone)/60 hover:bg-accent"
        style={toneStyle(type.tone)}
      >
        <CardHeader
          data-pattern={type.pattern}
          className={cn('tone-tint pt-(--card-spacing) pb-2', PATTERN_CLASSES[type.pattern])}
        >
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <ToneDot tone={statusTone(bead.status)} title={statusTitle(bead.status)} />
            <span>{bead.id}</span>
            {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
            {bead.issue_type && <Tag tone={type.tone}>{bead.issue_type}</Tag>}
          </div>
          <CardTitle className="text-sm">{bead.title}</CardTitle>
        </CardHeader>
        {(bead.assignee || leaseText || (bead.labels?.length ?? 0) > 0) && (
          <CardContent className="flex flex-wrap gap-1">
            {bead.assignee && <span className="text-xs text-muted-foreground">@{bead.assignee}</span>}
            {leaseText && (
              <span className={lease.kind === 'expired' ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {leaseText}
              </span>
            )}
            {bead.labels?.map((label) => (
              <Tag key={label} tone={labelTone(label)}>
                {label}
              </Tag>
            ))}
          </CardContent>
        )}
      </Card>
    </button>
  )
}
