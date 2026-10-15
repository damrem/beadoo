import { useId, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Bead } from '../../shared/contract'
import { branchFor, branchProblem } from '../../shared/spawn'
import type { SpawnedSession } from '../../shared/spawn'

export function SpawnControls({
  bead,
  disabled,
  spawning,
  onSpawn,
}: {
  bead: Bead
  disabled: boolean
  spawning: boolean
  onSpawn: (branch: string) => void
}) {
  const id = useId()
  const [branch, setBranch] = useState(() => branchFor(bead))
  const problem = branchProblem(branch)
  return (
    <div className="flex w-full flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Branch of the session
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          className="font-mono"
          value={branch}
          aria-invalid={problem !== null}
          disabled={disabled}
          onChange={(event) => setBranch(event.target.value.trim())}
        />
        <Button size="sm" disabled={disabled || problem !== null} onClick={() => onSpawn(branch)}>
          {spawning ? 'Claim and spawn…' : 'Claim and spawn'}
        </Button>
      </div>
      {problem && <p className="text-xs text-destructive">{problem}</p>}
    </div>
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
          <dt>Terminal</dt>
          <dd className="font-mono">{session.terminal}</dd>
        </dl>
        {session.warning && <p className="mt-2">{session.warning}</p>}
      </AlertDescription>
    </Alert>
  )
}
