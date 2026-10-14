import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Bead } from '@/lib/filters'

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.7rem] leading-none text-muted-foreground">
      {children}
    </span>
  )
}

export function BeadCard({ bead, onOpen }: { bead: Bead; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(bead.id)}
      className="w-full text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl"
      aria-label={`${bead.id} ${bead.title}`}
    >
      <Card size="sm" className="gap-2 hover:bg-accent">
        <CardHeader>
          <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span>{bead.id}</span>
            {bead.priority !== undefined && <Tag>P{bead.priority}</Tag>}
            {bead.issue_type && <Tag>{bead.issue_type}</Tag>}
          </div>
          <CardTitle className="text-sm">{bead.title}</CardTitle>
        </CardHeader>
        {(bead.assignee || (bead.labels?.length ?? 0) > 0) && (
          <CardContent className="flex flex-wrap gap-1">
            {bead.assignee && <span className="text-xs text-muted-foreground">@{bead.assignee}</span>}
            {bead.labels?.map((label) => <Tag key={label}>{label}</Tag>)}
          </CardContent>
        )}
      </Card>
    </button>
  )
}
