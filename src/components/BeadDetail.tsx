import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Tag } from '@/components/BeadCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { Bead } from '@/lib/filters'
import { formatLeaseTime, leaseLabel, leaseState } from '@/lib/lease'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Text({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <pre className="font-sans text-sm whitespace-pre-wrap">{value}</pre>
    </section>
  )
}

type Load = { id: string; bead?: Bead; error?: string }

export function BeadDetail({
  db,
  id,
  onClose,
  onOpen,
}: {
  db: string
  id: string | null
  onClose: () => void
  onOpen: (id: string) => void
}) {
  const [load, setLoad] = useState<Load | null>(null)

  useEffect(() => {
    if (!id) return
    let live = true
    setLoad({ id })
    api
      .bead(db, id)
      .then((bead) => live && setLoad({ id, bead }))
      .catch((error: Error) => live && setLoad({ id, error: error.message }))
    return () => {
      live = false
    }
  }, [db, id])

  const bead = load?.id === id ? load.bead : undefined
  const error = load?.id === id ? load.error : undefined
  const blockers = bead?.dependencies?.filter((dep) => dep.dependency_type !== 'parent-child') ?? []
  const now = new Date()
  const leaseText = bead && leaseLabel(leaseState(bead, now), now)
  const heartbeat = bead?.heartbeat_at ? new Date(bead.heartbeat_at) : undefined

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetDescription className="font-mono">{id}</SheetDescription>
          <SheetTitle>{bead?.title ?? (error ? 'Bead' : 'Loading the bead')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {!bead && !error && <Skeleton className="h-40 w-full" />}
          {bead && (
            <>
              <dl className="flex flex-col gap-1.5">
                <Field label="Status">{bead.status}</Field>
                <Field label="Priority">P{bead.priority}</Field>
                <Field label="Type">{bead.issue_type}</Field>
                <Field label="Assignee">{bead.assignee ?? 'nobody'}</Field>
                {leaseText && <Field label="Lease">{leaseText}</Field>}
                {leaseText && heartbeat && !Number.isNaN(heartbeat.getTime()) && (
                  <Field label="Last heartbeat">{formatLeaseTime(heartbeat, now)}</Field>
                )}
                <Field label="Parent">
                  {bead.parent ? (
                    <button type="button" className="font-mono underline" onClick={() => onOpen(bead.parent!)}>
                      {bead.parent}
                    </button>
                  ) : (
                    'none'
                  )}
                </Field>
                <Field label="Labels">
                  <span className="flex flex-wrap gap-1">
                    {bead.labels?.map((label) => <Tag key={label}>{label}</Tag>)}
                  </span>
                </Field>
                <Field label="Dependencies">
                  {blockers.length === 0
                    ? 'none'
                    : blockers.map((dep) => (
                        <button
                          key={dep.id}
                          type="button"
                          className="mr-2 font-mono underline"
                          onClick={() => onOpen(dep.id)}
                        >
                          {dep.id}
                        </button>
                      ))}
                </Field>
              </dl>
              <Text label="Description" value={bead.description} />
              <Text label="Notes" value={bead.notes} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
