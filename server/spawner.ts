import { homedir } from 'node:os'
import { realBaseIo } from '../../../lib/cli.ts'
import { realRun } from '../../../lib/process.ts'
import { createSessionWorktree, startSessionTerminal } from '../../../skills/handoffs/scripts/start-handoff-session.ts'
import type { Io, SessionWorktree } from '../../../skills/handoffs/scripts/start-handoff-session.ts'
import { beadSessionCommand, releasedNote, startedNote } from '../../../skills/handoffs/scripts/start-handoff-session-rules.ts'
import { CONFLICT, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED } from '../shared/contract.ts'
import type { DatabaseEntry } from '../shared/contract.ts'
import { ID, stampOf } from '../shared/edit.ts'
import { branchProblem } from '../shared/spawn.ts'
import type { SpawnedSession } from '../shared/spawn.ts'
import { StoreError } from './beads-store.ts'
import type { Store } from './beads-store.ts'

export const ORCA_TIMEOUT_MS = 120_000

export const realSpawnIo = (): Io => {
  const base = realBaseIo()
  const home = homedir()
  return {
    ...base,
    home,
    cwd: home,
    run: (command, args, options) => realRun(command, args, { timeoutMs: ORCA_TIMEOUT_MS, ...options }),
  }
}

export function createSpawner(store: Store, io: Io, now: () => Date = () => new Date()) {
  const running = new Set<string>()

  const giveBack = async (db: DatabaseEntry, id: string, worktree: SessionWorktree | undefined, reason: string) => {
    const kept = worktree ? ` The worktree ${worktree.path} stays.` : ''
    try {
      await store.writeClaim(db, id, 'unclaim')
      if (worktree) await store.appendNote(db, id, releasedNote(stampOf(now()), worktree.path, reason))
      return new StoreError(SPAWN_FAILED, `${reason}\nThe bead ${id} is open again.${kept}`)
    } catch (error) {
      return new StoreError(
        SPAWN_FAILED,
        `${reason}\nThe page could not give the bead ${id} back: ${(error as Error).message}.${kept} Release the claim of the bead.`,
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
          worktree = createSessionWorktree(io, db.path, { branch, lineage: 'independent' })
          terminal = startSessionTerminal(io, worktree, beadSessionCommand(id, db.path, worktree.path))
        } catch (error) {
          throw await giveBack(db, id, worktree, (error as Error).message)
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
