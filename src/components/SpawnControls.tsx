import { useContext, useEffect, useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Emoji } from '@/components/Emoji'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { api } from '@/lib/api'
import { busyPlace, defaultTarget, proposedRequest, readSpawnChoice, sentRequest, usableLocations, writeSpawnChoice } from '@/lib/spawn-choice'
import { SpawnAllowed } from '@/lib/spawn-allowed'
import { cn } from '@/lib/utils'
import type { Bead } from '../../shared/contract'
import { isRisky, needsBranch, needsTarget, PERMISSION_MODES, spawnRequestProblem, WORKTREE_KINDS } from '../../shared/spawn'
import type { PermissionMode, SessionLocation, SpawnChoices, SpawnedSession, SpawnRequest, SpawnWorktree, WorktreeKind } from '../../shared/spawn'

const KIND_LABELS: Record<WorktreeKind, string> = {
  new: 'A new worktree',
  child: 'A child of a worktree',
  existing: 'An existing worktree',
  none: 'No worktree',
}

const MODE_LABELS: Record<PermissionMode, string> = {
  plan: 'Plan',
  default: 'Default',
  acceptEdits: 'Accept edits',
  bypassPermissions: 'Bypass permissions',
}

const PLACE_LABELS: Record<WorktreeKind, string> = {
  new: 'The new worktree',
  child: 'The child worktree',
  existing: 'The selected worktree',
  none: 'The main checkout',
}

const locationLabel = (kind: WorktreeKind, location: SessionLocation): string => {
  if (location === 'parent') return 'The parent worktree'
  if (location === 'epic') return 'The epic worktree'
  return PLACE_LABELS[kind]
}

const isRiskyKind = (kind: WorktreeKind) => kind === 'none'

const isRiskyMode = (mode: PermissionMode) => mode === 'bypassPermissions'

export const worktreeText = (worktree: SpawnWorktree): string =>
  [
    `${worktree.branch ?? worktree.path} · ${worktree.path}`,
    worktree.main ? 'main checkout' : '',
    worktree.merged ? 'merged' : '',
    worktree.heldBy ? `held by ${worktree.heldBy}` : '',
    worktree.busy ? 'a Claude session runs here' : '',
  ]
    .filter(Boolean)
    .join(' · ')

function Choices<T extends string>({
  legend,
  name,
  values,
  value,
  label,
  risky,
  onChange,
}: {
  legend: string
  name: string
  values: readonly T[]
  value: T
  label: (value: T) => string
  risky: (value: T) => boolean
  onChange: (value: T) => void
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{legend}</legend>
      {values.map((option) => (
        <label key={option} className={cn('flex items-center gap-2', risky(option) && 'font-medium text-destructive')}>
          <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
          {risky(option) && <Emoji emoji="⚠️" />}
          {label(option)}
        </label>
      ))}
    </fieldset>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {children}
    </div>
  )
}

const FAILED_CHOICES = (message: string): SpawnChoices => ({ repo: '', worktrees: [], problem: message })

function SpawnForm({
  db,
  bead,
  choices,
  onSpawn,
}: {
  db: string
  bead: Bead
  choices: SpawnChoices
  onSpawn: (request: SpawnRequest) => void
}) {
  const id = useId()
  const [form, setForm] = useState<SpawnRequest>(() => proposedRequest(bead, choices, readSpawnChoice(db)))
  const change = (next: Partial<SpawnRequest>) =>
    setForm((current) => {
      const merged = { ...current, ...next }
      if (needsTarget(merged.kind) && merged.target === undefined) merged.target = defaultTarget(choices)
      if (!usableLocations(merged, choices).includes(merged.location)) merged.location = 'worktree'
      if (!isRisky(merged)) delete merged.confirmed
      return merged
    })
  const problem = spawnRequestProblem(form)
  const busy = busyPlace(form, choices)
  const locations = usableLocations(form, choices)
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (problem) return
        onSpawn(form)
      }}
    >
      {choices.problem && (
        <Alert variant="destructive">
          <AlertTitle>The page could not list the worktrees</AlertTitle>
          <AlertDescription>{choices.problem}</AlertDescription>
        </Alert>
      )}
      <Choices
        legend="Worktree kind"
        name={`${id}-kind`}
        values={WORKTREE_KINDS}
        value={form.kind}
        label={(kind) => KIND_LABELS[kind]}
        risky={isRiskyKind}
        onChange={(kind) => change({ kind })}
      />
      {needsTarget(form.kind) && (
        <Field id={`${id}-target`} label={form.kind === 'child' ? 'Parent worktree' : 'Target worktree'}>
          <NativeSelect id={`${id}-target`} value={form.target ?? ''} onChange={(event) => change({ target: event.target.value })}>
            {choices.worktrees.map((worktree) => (
              <option key={worktree.path} value={worktree.path}>
                {worktreeText(worktree)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {needsBranch(form.kind) && (
        <Field id={`${id}-branch`} label="Branch of the session">
          <Input
            id={`${id}-branch`}
            className="font-mono"
            value={form.branch ?? ''}
            aria-invalid={problem !== null && problem.startsWith('Give the branch')}
            onChange={(event) => change({ branch: event.target.value.trim() })}
          />
        </Field>
      )}
      <Choices
        legend="Session location"
        name={`${id}-location`}
        values={locations}
        value={form.location}
        label={(location) => locationLabel(form.kind, location)}
        risky={() => false}
        onChange={(location) => change({ location })}
      />
      <Choices
        legend="Permission mode"
        name={`${id}-mode`}
        values={PERMISSION_MODES}
        value={form.mode}
        label={(mode) => MODE_LABELS[mode]}
        risky={isRiskyMode}
        onChange={(mode) => change({ mode })}
      />
      {busy && (
        <Alert>
          <AlertTitle>A Claude session already runs in this worktree</AlertTitle>
          <AlertDescription>
            <span className="font-mono break-all">{busy}</span>. You can start the session anyway.
          </AlertDescription>
        </Alert>
      )}
      {isRisky(form) && (
        <label className="flex items-start gap-2 font-medium text-destructive">
          <input type="checkbox" checked={form.confirmed === true} onChange={(event) => change({ confirmed: event.target.checked })} />
          <span>
            <Emoji emoji="⚠️" /> I confirm the risky choice:{' '}
            {[form.kind === 'none' && 'the session has no dedicated worktree', form.mode === 'bypassPermissions' && 'the session bypasses the permissions']
              .filter(Boolean)
              .join(', and ')}
            .
          </span>
        </label>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <Button type="submit" disabled={problem !== null}>
        Claim and spawn
      </Button>
    </form>
  )
}

type SpawnControlsProps = {
  db: string
  bead: Bead
  disabled: boolean
  spawning: boolean
  size?: 'sm' | 'xs'
  onSpawn: (request: SpawnRequest) => void
}

export function SpawnControls(props: SpawnControlsProps) {
  return useContext(SpawnAllowed) ? <SpawnButton {...props} /> : null
}

function SpawnButton({
  db,
  bead,
  disabled,
  spawning,
  size = 'sm',
  onSpawn,
}: SpawnControlsProps) {
  const [open, setOpen] = useState(false)
  const [choices, setChoices] = useState<SpawnChoices | null>(null)

  useEffect(() => {
    if (!open) return
    let live = true
    setChoices(null)
    api
      .spawnChoices(db, bead.id)
      .then((loaded) => live && setChoices(loaded))
      .catch((error: Error) => live && setChoices(FAILED_CHOICES(error.message)))
    return () => {
      live = false
    }
  }, [open, db, bead.id])

  return (
    <>
      <Button size={size} disabled={disabled} onClick={() => setOpen(true)}>
        {spawning ? 'Spawn…' : 'Spawn'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Spawn a session on {bead.id}</DialogTitle>
          <DialogDescription>The page claims the bead, then starts an interactive Claude session in Orca.</DialogDescription>
          {choices ? (
            <SpawnForm
              db={db}
              bead={bead}
              choices={choices}
              onSpawn={(request) => {
                writeSpawnChoice(db, request)
                setOpen(false)
                onSpawn(sentRequest(request))
              }}
            />
          ) : (
            <p className="text-muted-foreground">The page reads the worktrees of the repo.</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export function SessionStarted({ session }: { session: SpawnedSession }) {
  return (
    <Alert>
      <AlertTitle>A session started on the bead</AlertTitle>
      <AlertDescription>
        <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-1 text-sm">
          <dt>Worktree</dt>
          <dd className="font-mono break-all">{session.path}</dd>
          <dt>Branch</dt>
          <dd className="font-mono">{session.branch}</dd>
          {session.session && session.session !== session.path && (
            <>
              <dt>Session in</dt>
              <dd className="font-mono break-all">{session.session}</dd>
            </>
          )}
          {session.mode && (
            <>
              <dt>Mode</dt>
              <dd className="font-mono">{session.mode}</dd>
            </>
          )}
          <dt>Terminal</dt>
          <dd className="font-mono">{session.terminal}</dd>
        </dl>
        {session.warning && <p className="mt-2">{session.warning}</p>}
      </AlertDescription>
    </Alert>
  )
}

export function WorktreeKept({ path }: { path: string }) {
  return (
    <Alert>
      <AlertTitle>The worktree of the session stays</AlertTitle>
      <AlertDescription>
        <span className="font-mono break-all">{path}</span> stays on the disk. Remove it in Orca, or with git worktree remove.
      </AlertDescription>
    </Alert>
  )
}
