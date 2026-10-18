import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { claimActions } from '@/components/ClaimControls'
import { SessionStarted, SpawnControls, WorktreeKept } from '@/components/SpawnControls'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { releasedWorktree } from '@/lib/spawn-choice'
import type { Bead, ClaimAction } from '../../shared/contract'
import type { SpawnedSession, SpawnRequest } from '../../shared/spawn'

const LABELS: Record<ClaimAction, string> = { claim: 'Claim', unclaim: 'Unclaim', renew: 'Renew' }

type CardWrite = { id: string; action: ClaimAction | 'spawn' }

type Notice = { id: string; error?: string; failed?: 'claim' | 'spawn'; session?: SpawnedSession; released?: string }

export type CardWrites = ReturnType<typeof useCardWrites>

export function useCardWrites(db: string | null, onWritten: () => void) {
  const [writing, setWriting] = useState<CardWrite | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  useEffect(() => setNotice(null), [db])

  const claim = (bead: Bead, action: ClaimAction) => {
    if (!db) return
    setWriting({ id: bead.id, action })
    setNotice(null)
    api
      .claim(db, bead.id, action)
      .then((written) => {
        const released = action === 'unclaim' ? releasedWorktree(written) : undefined
        setNotice(released ? { id: bead.id, released } : null)
      })
      .catch((reason: Error) => setNotice({ id: bead.id, error: reason.message, failed: 'claim' }))
      .finally(() => {
        setWriting(null)
        onWritten()
      })
  }

  const spawn = (bead: Bead, request: SpawnRequest) => {
    if (!db) return
    setWriting({ id: bead.id, action: 'spawn' })
    setNotice(null)
    api
      .spawn(db, bead.id, request)
      .then((session) => setNotice({ id: bead.id, session }))
      .catch((reason: Error) => setNotice({ id: bead.id, error: reason.message, failed: 'spawn' }))
      .finally(() => {
        setWriting(null)
        onWritten()
      })
  }

  return { db, writing, notice, claim, spawn, dismiss: () => setNotice(null) }
}

export function CardActions({ bead, actor, writes }: { bead: Bead; actor: string | null; writes: CardWrites }) {
  const actions = claimActions(bead, actor)
  if (!writes.db || actions.length === 0) return null
  const busy = writes.writing !== null
  const mine = writes.writing?.id === bead.id ? writes.writing.action : null
  return (
    <div role="toolbar" aria-label={`Actions on ${bead.id}`} className="flex flex-wrap gap-1">
      {actions.map((action) => (
        <Button
          key={action}
          size="xs"
          variant={action === 'claim' ? 'default' : 'outline'}
          disabled={busy}
          onClick={() => writes.claim(bead, action)}
        >
          {mine === action ? `${LABELS[action]}…` : LABELS[action]}
        </Button>
      ))}
      {actions.includes('claim') && (
        <SpawnControls
          db={writes.db}
          bead={bead}
          size="xs"
          disabled={busy}
          spawning={mine === 'spawn'}
          onSpawn={(request) => writes.spawn(bead, request)}
        />
      )}
    </div>
  )
}

export const cardActionsOf =
  (actor: string | null, writes: CardWrites) =>
  (bead: Bead): ReactNode =>
    writes.db && claimActions(bead, actor).length > 0 ? <CardActions bead={bead} actor={actor} writes={writes} /> : null

export function CardNotice({ writes }: { writes: CardWrites }) {
  const { notice } = writes
  if (!notice) return null
  return (
    <div className="mx-4 mt-4 flex flex-col gap-2" aria-label={`Result on ${notice.id}`} role="region">
      {notice.error && (
        <Alert variant="destructive">
          <AlertTitle>
            {notice.failed === 'spawn' ? `The page could not start a session on ${notice.id}` : `The page could not change the claim of ${notice.id}`}
          </AlertTitle>
          <AlertDescription className="whitespace-pre-wrap">{notice.error}</AlertDescription>
        </Alert>
      )}
      {notice.session && <SessionStarted session={notice.session} />}
      {notice.released && <WorktreeKept path={notice.released} />}
      <Button size="xs" variant="ghost" className="self-end" onClick={writes.dismiss}>
        Dismiss
      </Button>
    </div>
  )
}
