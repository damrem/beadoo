import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LabelTags } from '@/components/BeadCard'
import { BeadEditor } from '@/components/BeadEditor'
import { claimActions, ClaimControls } from '@/components/ClaimControls'
import { SessionStarted, SpawnControls } from '@/components/SpawnControls'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import type { Bead, ClaimAction } from '../../shared/contract'
import type { SpawnedSession } from '../../shared/spawn'
import { formatLeaseTime, leaseLabel, leaseState } from '@/lib/lease'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Text({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
      <pre className="font-sans text-sm whitespace-pre-wrap">{value}</pre>
    </section>
  )
}

type Load = { id: string; bead?: Bead; error?: string }

type Write = { id: string; action: ClaimAction | 'spawn' | null; error?: string; failed?: 'claim' | 'spawn'; session?: SpawnedSession }

export function BeadDetail({
  db,
  id,
  actor,
  onClose,
  onOpen,
  onWritten,
}: {
  db: string
  id: string | null
  actor: string | null
  onClose: () => void
  onOpen: (id: string) => void
  onWritten: () => void
}) {
  const [load, setLoad] = useState<Load | null>(null)
  const [write, setWrite] = useState<Write | null>(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    setWrite(null)
    setEditing(false)
  }, [db, id])

  useEffect(() => {
    if (!id) return
    let live = true
    setLoad((current) => (current?.id === id && current.bead ? current : { id }))
    api
      .bead(db, id)
      .then((bead) => live && setLoad({ id, bead }))
      .catch((error: Error) => live && setLoad({ id, error: error.message }))
    return () => {
      live = false
    }
  }, [db, id, reload])

  const runClaim = (beadId: string, action: ClaimAction) => {
    setWrite({ id: beadId, action })
    api
      .claim(db, beadId, action)
      .then((bead) => {
        setLoad((current) => (current?.id === beadId ? { id: beadId, bead } : current))
        setWrite(null)
      })
      .catch((reason: Error) => {
        setWrite({ id: beadId, action: null, error: reason.message })
        setReload((count) => count + 1)
      })
      .finally(onWritten)
  }

  const runSpawn = (beadId: string, branch: string) => {
    setWrite({ id: beadId, action: 'spawn' })
    api
      .spawn(db, beadId, branch)
      .then((session) => {
        setLoad((current) => (current?.id === beadId ? { id: beadId, bead: session.bead } : current))
        setWrite({ id: beadId, action: null, session })
      })
      .catch((reason: Error) => {
        setWrite({ id: beadId, action: null, error: reason.message, failed: 'spawn' })
        setReload((count) => count + 1)
      })
      .finally(onWritten)
  }

  const bead = load?.id === id ? load.bead : undefined
  const error = load?.id === id ? load.error : undefined
  const writing = write?.id === id ? write.action : null
  const writeError = write?.id === id ? write.error : undefined
  const session = write?.id === id ? write.session : undefined
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
          {writeError && (
            <Alert variant="destructive">
              <AlertTitle>
                {write?.failed === 'spawn' ? 'The page could not start a session' : 'The page could not change the claim'}
              </AlertTitle>
              <AlertDescription>{writeError}</AlertDescription>
            </Alert>
          )}
          {session && <SessionStarted session={session} />}
          {bead && editing && (
            <BeadEditor
              key={bead.id}
              db={db}
              bead={bead}
              onCancel={() => setEditing(false)}
              onSaved={(saved) => {
                setLoad((current) => (current?.id === saved.id ? { id: saved.id, bead: saved } : current))
                setEditing(false)
                onWritten()
              }}
              onPartlySaved={(written) => {
                setLoad((current) => (current?.id === written.id ? { id: written.id, bead: written } : current))
                onWritten()
              }}
            />
          )}
          {bead && !editing && (
            <>
              <div className="flex flex-wrap gap-2">
                <ClaimControls
                  bead={bead}
                  actor={actor}
                  writing={writing}
                  onAction={(action) => runClaim(bead.id, action)}
                />
                <Button size="sm" variant="outline" disabled={writing !== null} onClick={() => setEditing(true)}>
                  Edit
                </Button>
                {claimActions(bead, actor).includes('claim') && (
                  <SpawnControls
                    key={bead.id}
                    bead={bead}
                    disabled={writing !== null}
                    spawning={writing === 'spawn'}
                    onSpawn={(branch) => runSpawn(bead.id, branch)}
                  />
                )}
              </div>
              <dl className="flex flex-col gap-1.5">
                <Field label="Status">{bead.status}</Field>
                {bead.status === 'closed' && bead.close_reason && <Field label="Close reason">{bead.close_reason}</Field>}
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
                  <LabelTags labels={bead.labels} />
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
