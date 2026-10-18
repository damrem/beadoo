import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { LabelTags, StatusTag, Tag, TypeTag } from '@/components/BeadCard'
import { BeadId } from '@/components/BeadId'
import { BeadLink, CopyLinkButton } from '@/components/BeadLink'
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
import { priorityTone } from '@/lib/tones'
import { formatLeaseTime, leaseLabel, leaseState } from '@/lib/lease'
import { beadUrl } from '@/lib/urls'

const Markdown = lazy(() => import('@/components/Markdown').then((module) => ({ default: module.Markdown })))

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
      <Suspense fallback={<p className="text-sm whitespace-pre-wrap">{value}</p>}>
        <Markdown text={value} />
      </Suspense>
    </section>
  )
}

type Load = { id: string; bead?: Bead; error?: string }

type Write = { id: string; action: ClaimAction | 'spawn' | null; error?: string; failed?: 'claim' | 'spawn'; session?: SpawnedSession }

export type BeadState = ReturnType<typeof useBead>

export function useBead(db: string, id: string | null, onWritten: () => void) {
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

  const show = (written: Bead) => setLoad((current) => (current?.id === written.id ? { id: written.id, bead: written } : current))

  return {
    bead: load?.id === id ? load.bead : undefined,
    error: load?.id === id ? load.error : undefined,
    writing: write?.id === id ? write.action : null,
    writeError: write?.id === id ? write.error : undefined,
    failed: write?.id === id ? write.failed : undefined,
    session: write?.id === id ? write.session : undefined,
    editing,
    setEditing,
    runClaim,
    runSpawn,
    show,
  }
}

export const beadTitle = (state: BeadState): string => state.bead?.title ?? (state.error ? 'Bead' : 'Loading the bead')

export function BeadBody({
  db,
  actor,
  state,
  onOpen,
  onWritten,
}: {
  db: string
  actor: string | null
  state: BeadState
  onOpen?: (id: string) => void
  onWritten: () => void
}) {
  const { bead, error, writing, writeError, failed, session, editing, setEditing, runClaim, runSpawn, show } = state
  const blockers = bead?.dependencies?.filter((dep) => dep.dependency_type !== 'parent-child') ?? []
  const now = new Date()
  const leaseText = bead && leaseLabel(leaseState(bead, now), now)
  const heartbeat = bead?.heartbeat_at ? new Date(bead.heartbeat_at) : undefined

  return (
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
            {failed === 'spawn' ? 'The page could not start a session' : 'The page could not change the claim'}
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
            show(saved)
            setEditing(false)
            onWritten()
          }}
          onPartlySaved={(written) => {
            show(written)
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
            <Field label="Status">
              <StatusTag status={bead.status} />
            </Field>
            {bead.status === 'closed' && bead.close_reason && <Field label="Close reason">{bead.close_reason}</Field>}
            <Field label="Priority">
              {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
            </Field>
            <Field label="Type">{bead.issue_type && <TypeTag type={bead.issue_type} />}</Field>
            <Field label="Assignee">{bead.assignee ?? 'nobody'}</Field>
            {leaseText && <Field label="Lease">{leaseText}</Field>}
            {leaseText && heartbeat && !Number.isNaN(heartbeat.getTime()) && (
              <Field label="Last heartbeat">{formatLeaseTime(heartbeat, now)}</Field>
            )}
            <Field label="Parent">{bead.parent ? <BeadLink db={db} id={bead.parent} onOpen={onOpen} /> : 'none'}</Field>
            <Field label="Labels">
              <LabelTags labels={bead.labels} />
            </Field>
            <Field label="Dependencies">
              {blockers.length === 0
                ? 'none'
                : blockers.map((dep) => <BeadLink key={dep.id} db={db} id={dep.id} onOpen={onOpen} className="mr-2" />)}
            </Field>
          </dl>
          <Text label="Description" value={bead.description} />
          <Text label="Notes" value={bead.notes} />
        </>
      )}
    </div>
  )
}

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
  const state = useBead(db, id, onWritten)

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetDescription className="flex items-center gap-2 font-mono">
            {id && (
              <>
                <a href={beadUrl(db, id)} target="_blank" rel="noreferrer" className="underline" aria-label={`Open ${id} as a page`}>
                  <BeadId id={id} />
                </a>
                <CopyLinkButton db={db} id={id} />
              </>
            )}
          </SheetDescription>
          <SheetTitle>{beadTitle(state)}</SheetTitle>
        </SheetHeader>
        <BeadBody db={db} actor={actor} state={state} onOpen={onOpen} onWritten={onWritten} />
      </SheetContent>
    </Sheet>
  )
}
