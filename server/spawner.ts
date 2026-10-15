import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { realRunAsync } from '../../../lib/process.ts'
import { createSessionWorktree, startSessionTerminal, WorktreeStepError } from '../../../skills/handoffs/scripts/start-handoff-session.ts'
import type { SessionIo, SessionWorktree } from '../../../skills/handoffs/scripts/start-handoff-session.ts'
import { beadSessionCommand, releasedMessage, releasedNote, startedNote, worktreeStays } from '../../../skills/handoffs/scripts/start-handoff-session-rules.ts'
import { CONFLICT, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED } from '../shared/contract.ts'
import type { DatabaseEntry } from '../shared/contract.ts'
import { ID, stampOf } from '../shared/edit.ts'
import { branchProblem } from '../shared/spawn.ts'
import type { SpawnedSession } from '../shared/spawn.ts'
import { StoreError } from './beads-store.ts'
import type { Store } from './beads-store.ts'

const ORCA_TIMEOUT_MS = 120_000

export const realSpawnIo = (): SessionIo => ({
  cwd: homedir(),
  exists: existsSync,
  log: (line) => process.stderr.write(`${line}\n`),
  run: (command, args, options) => realRunAsync(command, args, { timeoutMs: ORCA_TIMEOUT_MS, ...options }),
})

export function createSpawner(store: Store, io: SessionIo, now: () => Date = () => new Date()) {
  const running = new Set<string>()

  const giveBack = async (db: DatabaseEntry, id: string, worktree: SessionWorktree | undefined, reason: string) => {
    try {
      await store.writeClaim(db, id, 'unclaim')
      if (worktree) await store.appendNote(db, id, releasedNote(stampOf(now()), worktree.path, reason))
      return new StoreError(SPAWN_FAILED, releasedMessage(reason, id, worktree?.path))
    } catch (error) {
      return new StoreError(
        SPAWN_FAILED,
        `${reason}\nThe page could not give the bead ${id} back: ${(error as Error).message}.${worktreeStays(worktree?.path)} Release the claim of the bead.`,
      )
    }
  }

  return {
    async spawn(db: DatabaseEntry, id: string, branch: string): Promise<SpawnedSession> {
      if (db.refused) throw new StoreError(REFUSED, db.refused)
      if (!ID.test(id)) throw new StoreError(NOT_FOUND, `bd show gave no bead for ${id}`)
      const problem = branchProblem(branch)
      if (problem) throw new StoreError(INVALID, problem)
      const key = `${db.name}\n${id}`
      if (running.has(key)) throw new StoreError(CONFLICT, `The page already starts a session on ${id}.`)
      running.add(key)
      try {
        await store.writeClaim(db, id, 'claim')
        let worktree: SessionWorktree | undefined
        let terminal: string
        try {
          worktree = await createSessionWorktree(io, db.path, { branch, lineage: 'independent' })
          terminal = await startSessionTerminal(io, worktree, beadSessionCommand(id, db.path, worktree.path))
        } catch (error) {
          const made = worktree ?? (error instanceof WorktreeStepError ? error.worktree : undefined)
          throw await giveBack(db, id, made, (error as Error).message)
        }
        const session = { worktree: worktree.id, path: worktree.path, branch: worktree.branch, terminal }
        try {
          return { bead: await store.appendNote(db, id, startedNote(stampOf(now()), worktree.path)), ...session }
        } catch (error) {
          const warning = `The session runs, but the page could not write the note of the start: ${(error as Error).message}`
          return { bead: await store.showBead(db, id), ...session, warning }
        }
      } finally {
        running.delete(key)
      }
    },
  }
}

export type Spawner = ReturnType<typeof createSpawner>
