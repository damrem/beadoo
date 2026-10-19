import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { realRunAsync } from './process.ts'
import { createSessionWorktree, startSessionTerminal, WorktreeStepError } from './orca.ts'
import type { SessionIo, SessionWorktree } from './orca.ts'
import { beadSessionCommand, DEFAULT_SESSION_COMMAND, pathKey, releasedMessage, releasedNote, worktreeStays } from './orca-rules.ts'
import { CONFLICT, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED } from '../shared/contract.ts'
import type { Bead, DatabaseEntry } from '../shared/contract.ts'
import { ID, stampOf } from '../shared/edit.ts'
import { spawnRequestProblem } from '../shared/spawn.ts'
import type { SpawnChoices, SpawnedSession, SpawnRequest } from '../shared/spawn.ts'
import { lastStarted, startedLine } from '../shared/started-note.ts'
import { StoreError, writeIsDone } from './beads-store.ts'
import type { Store } from './beads-store.ts'
import { claudeWorktreePaths, mergedBranches, parentOf, repoWorktrees, worktreeAt } from './orca-worktrees.ts'
import type { RepoWorktree } from './orca-worktrees.ts'

const ORCA_TIMEOUT_MS = 120_000

export const realSpawnIo = (): SessionIo => ({
  cwd: homedir(),
  exists: existsSync,
  log: (line) => process.stderr.write(`${line}\n`),
  run: (command, args, options) => realRunAsync(command, args, { timeoutMs: ORCA_TIMEOUT_MS, ...options }),
})

type Known = { worktrees: RepoWorktree[]; target?: RepoWorktree; epic?: RepoWorktree }

export type SpawnerOptions = { now?: () => Date; sessionCommand?: () => string }

export function createSpawner(
  store: Store,
  io: SessionIo,
  { now = () => new Date(), sessionCommand = () => DEFAULT_SESSION_COMMAND }: SpawnerOptions = {},
) {
  const running = new Set<string>()

  const giveBack = async (db: DatabaseEntry, id: string, worktree: SessionWorktree | undefined, reason: string) => {
    const problems: string[] = []
    try {
      await store.writeClaim(db, id, 'unclaim')
    } catch (error) {
      const cause = (error as Error).message
      if (!writeIsDone(error)) {
        return new StoreError(
          SPAWN_FAILED,
          `${reason}\nThe page could not give the bead ${id} back: ${cause}.${worktreeStays(worktree?.path)} Release the claim of the bead.`,
        )
      }
      problems.push(cause)
    }
    if (worktree) {
      await store.appendNote(db, id, releasedNote(stampOf(now()), worktree.path, reason)).catch((error: Error) => {
        problems.push(writeIsDone(error) ? error.message : `The page could not write the released note: ${error.message}`)
      })
    }
    return new StoreError(SPAWN_FAILED, [releasedMessage(reason, id, worktree?.path), ...problems].join('\n'))
  }

  const epicWorktree = async (db: DatabaseEntry, bead: Bead): Promise<{ id: string; path: string } | undefined> => {
    if (!bead.parent) return undefined
    const epic = await store.showBead(db, bead.parent).catch(() => undefined)
    const path = lastStarted(epic?.notes)?.worktree
    return path && io.exists(path) ? { id: bead.parent, path } : undefined
  }

  const heldWorktrees = async (db: DatabaseEntry, id: string): Promise<Map<string, string>> => {
    const held = new Map<string, string>()
    const { beads } = await store.listBeads(db)
    for (const bead of beads) {
      if (bead.id === id || bead.status !== 'in_progress') continue
      const path = lastStarted(bead.notes)?.worktree
      if (path && !held.has(pathKey(path))) held.set(pathKey(path), bead.id)
    }
    return held
  }

  const known = async (db: DatabaseEntry, bead: Bead, request: SpawnRequest): Promise<Known> => {
    if (request.kind === 'new') return { worktrees: [] }
    const worktrees = await repoWorktrees(io, db.path).catch((error: Error) => {
      throw new StoreError(SPAWN_FAILED, `The page could not read the worktrees of the repo ${db.path}: ${error.message}`)
    })
    const result: Known = { worktrees }
    if (request.target) {
      result.target = worktreeAt(worktrees, request.target)
      if (!result.target) throw new StoreError(INVALID, `Orca knows no worktree ${request.target} in the repo ${db.path}.`)
    }
    if (request.location === 'epic') {
      const epic = await epicWorktree(db, bead)
      if (!epic) throw new StoreError(INVALID, `The epic of the bead ${bead.id} has no started worktree that still exists.`)
      result.epic = worktreeAt(worktrees, epic.path)
      if (!result.epic) throw new StoreError(INVALID, `Orca knows no worktree ${epic.path} for the epic ${epic.id}.`)
    }
    if (request.kind === 'none' && request.location === 'worktree' && !worktrees.some((worktree) => worktree.main)) {
      throw new StoreError(INVALID, `Orca knows no main checkout of the repo ${db.path}.`)
    }
    if (request.kind === 'existing' && request.location === 'parent' && result.target && !parentOf(worktrees, result.target)) {
      throw new StoreError(INVALID, `The worktree ${result.target.path} has no parent worktree.`)
    }
    return result
  }

  return {
    async choices(db: DatabaseEntry, id: string): Promise<SpawnChoices> {
      if (db.refused) throw new StoreError(REFUSED, db.refused)
      if (!ID.test(id)) throw new StoreError(NOT_FOUND, `bd show gave no bead for ${id}`)
      const bead = await store.showBead(db, id)
      const [epic, held] = await Promise.all([epicWorktree(db, bead), heldWorktrees(db, id).catch(() => new Map<string, string>())])
      const base: SpawnChoices = { repo: db.path, worktrees: [], ...(epic ? { epic } : {}) }
      try {
        const [worktrees, busy, merged] = await Promise.all([
          repoWorktrees(io, db.path),
          claudeWorktreePaths(io).catch(() => new Set<string>()),
          mergedBranches(io, db.path).catch(() => new Set<string>()),
        ])
        return {
          ...base,
          worktrees: worktrees.map((worktree) => {
            const parent = parentOf(worktrees, worktree)
            const heldBy = held.get(pathKey(worktree.path))
            return {
              path: worktree.path,
              branch: worktree.branch,
              ...(worktree.main ? { main: true } : {}),
              ...(!worktree.main && merged.has(worktree.branch) ? { merged: true } : {}),
              ...(parent ? { parent: parent.path } : {}),
              ...(heldBy ? { heldBy } : {}),
              ...(busy.has(pathKey(worktree.path)) ? { busy: true } : {}),
            }
          }),
        }
      } catch (error) {
        return { ...base, problem: (error as Error).message }
      }
    },

    async spawn(db: DatabaseEntry, id: string, request: SpawnRequest): Promise<SpawnedSession> {
      if (db.refused) throw new StoreError(REFUSED, db.refused)
      if (!ID.test(id)) throw new StoreError(NOT_FOUND, `bd show gave no bead for ${id}`)
      const problem = spawnRequestProblem(request)
      if (problem) throw new StoreError(INVALID, problem)
      const key = `${db.name}\n${id}`
      if (running.has(key)) throw new StoreError(CONFLICT, `The page already starts a session on ${id}.`)
      running.add(key)
      try {
        const current = await store.showBead(db, id)
        if (current.status === 'in_progress' || current.status === 'closed') {
          const holder = current.status === 'in_progress' && current.assignee ? ` ${current.assignee} holds it.` : ''
          throw new StoreError(CONFLICT, `The bead ${id} is ${current.status}, so the page starts no session on it.${holder}`, current)
        }
        const { worktrees, target, epic } = await known(db, current, request)
        const claimed = await store.writeClaim(db, id, 'claim').catch(async (error: Error) => {
          throw writeIsDone(error) ? await giveBack(db, id, undefined, error.message) : error
        })
        let made: SessionWorktree | undefined
        let worktree: SessionWorktree
        let session: SessionWorktree
        let parent: string | undefined
        let terminal: string
        try {
          if (request.kind === 'new' || request.kind === 'child') {
            parent = target?.path
            made = await createSessionWorktree(io, db.path, {
              branch: request.branch!,
              lineage: request.kind === 'child' ? 'child' : 'independent',
              ...(parent ? { parent } : {}),
            })
            worktree = made
          } else if (request.kind === 'existing') {
            worktree = target!
            parent = parentOf(worktrees, target!)?.path
          } else {
            worktree = request.location === 'epic' ? epic! : worktrees.find((candidate) => candidate.main)!
          }
          if (request.location === 'parent') session = request.kind === 'child' ? target! : parentOf(worktrees, target!)!
          else if (request.location === 'epic') session = epic!
          else session = worktree
          const command = beadSessionCommand(id, db.path, request.kind === 'none' ? undefined : worktree.path, {
            mode: request.mode,
            sessionPath: session.path,
            template: sessionCommand(),
          })
          terminal = await startSessionTerminal(io, session, command, made !== undefined && session === made)
        } catch (error) {
          const left = made ?? (error instanceof WorktreeStepError ? error.worktree : undefined)
          throw await giveBack(db, id, left, (error as Error).message)
        }
        const started = {
          worktree: worktree.id,
          path: worktree.path,
          branch: worktree.branch,
          terminal,
          session: session.path,
          kind: request.kind,
          location: request.location,
          mode: request.mode,
        }
        const note = startedLine({
          at: stampOf(now()),
          kind: request.kind,
          worktree: worktree.path,
          branch: worktree.branch,
          ...(parent ? { parent } : {}),
          location: request.location,
          mode: request.mode,
        })
        try {
          return { bead: await store.appendNote(db, id, note), ...started }
        } catch (error) {
          const warning = `The session runs, but the page could not write the note of the start: ${(error as Error).message}`
          return { bead: await store.showBead(db, id).catch(() => claimed), ...started, warning }
        }
      } finally {
        running.delete(key)
      }
    },
  }
}

export type Spawner = ReturnType<typeof createSpawner>
