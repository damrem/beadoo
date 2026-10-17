import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BeadId } from '@/components/BeadId'
import { Emoji } from '@/components/Emoji'
import type { Bead } from '../../shared/contract'
import { labelEmoji, statusEmoji, typeEmoji } from '@/lib/emojis'
import { statusTitle } from '@/lib/filters'
import { labelParts } from '@/lib/labels'
import { leaseLabel, leaseState } from '@/lib/lease'
import type { Tone } from '@/lib/palette'
import { labelTone, priorityTone, toneStyle, typeStyle } from '@/lib/tones'
import { cn } from '@/lib/utils'

const PATTERN_CLASSES = {
  none: '',
  stripes: 'pattern-stripes',
  dots: 'pattern-dots',
  hatch: 'pattern-hatch',
  lines: 'pattern-lines',
}

export function Tag({ tone, title, children }: { tone?: Tone; title?: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] leading-none',
        tone ? 'tone-chip' : 'text-muted-foreground',
      )}
      style={tone ? toneStyle(tone) : undefined}
    >
      {children}
    </span>
  )
}

export function TypeTag({ type }: { type: string }) {
  return (
    <Tag tone={typeStyle(type).tone}>
      <Emoji emoji={typeEmoji(type)} />
      {type}
    </Tag>
  )
}

export function StatusTag({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Emoji emoji={statusEmoji(status)} />
      {statusTitle(status)}
    </span>
  )
}

export function LabelTag({ label }: { label: string }) {
  const property = labelParts(label)
  return (
    <Tag tone={labelTone(label)} title={label}>
      <Emoji emoji={labelEmoji(label)} />
      {property ? (
        <>
          <span className="text-muted-foreground">{property.name}</span>
          <span className="border-l border-(color:--tone)/50 pl-1 font-semibold">{property.value}</span>
        </>
      ) : (
        label
      )}
    </Tag>
  )
}

export function LabelTags({ labels }: { labels?: string[] }) {
  if (!labels?.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <LabelTag key={label} label={label} />
      ))}
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
            <span title={statusTitle(bead.status)}>
              <Emoji emoji={statusEmoji(bead.status)} />
            </span>
            <BeadId id={bead.id} />
            {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
            {bead.issue_type && <TypeTag type={bead.issue_type} />}
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
            {bead.labels?.map((label) => <LabelTag key={label} label={label} />)}
          </CardContent>
        )}
      </Card>
    </button>
  )
}
