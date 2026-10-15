import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checked, parseJson, runCheckedAsync, withoutWarnings } from '../../../lib/process.ts'
import type { RunAsync } from '../../../lib/process.ts'
import { BEADS_DELETED, CONFLICT, EXPORT_MISMATCH, INVALID, NOT_FOUND, PARTIAL_WRITE, REFUSED, STALE, STORE_NOT_OPEN, UNREACHABLE } from '../shared/contract.ts'
import type { Bead, BeadList, ClaimAction, DatabaseEntry, StoreErrorCode } from '../shared/contract.ts'
import { closes, editableOf, editProblem, ID, stampOf, versionOf, withEntry } from '../shared/edit.ts'
import type { EditableFields, EditRequest } from '../shared/edit.ts'
import { createWriteQueue } from './write-queue.ts'

export const BD_TIMEOUT_MS = 15_000

export const EXPORT_FILE = '.beads/issues.jsonl'

const UNKNOWN_ID = /not found|no issues? found/

const CLAIM_CONFLICT = /claimed by|not claimable|is not assigned/

const NOT_A_REPO = /not a git repository/

const SERVER_DOWN = /dolt server unreachable[^\n]*/i

const RECONCILE_LOSS = /auto-export: reconciled [1-9]\d* deleted[^\n]*/

const CLAIM_ARGS: Record<ClaimAction, (id: string) => string[]> = {
  claim: (id) => ['update', id, '--claim'],
  unclaim: (id) => ['unclaim', id],
  renew: (id) => ['heartbeat', id],
}

export class StoreError extends Error {
  readonly code: StoreErrorCode
  readonly bead?: Bead
  constructor(code: StoreErrorCode, message: string, bead?: Bead) {
    super(message)
    this.code = code
    this.bead = bead
  }
}

class UnfinishedWrite extends Error {}

const unreachable = (db: DatabaseEntry, error: unknown): StoreError | null => {
  const down = error instanceof Error ? SERVER_DOWN.exec(error.message) : null
  return down
    ? new StoreError(UNREACHABLE, `The database "${db.name}" does not answer: ${down[0].trim()}. Start its tunnel or its Dolt server.`)
    : null
}

type Env = Record<string, string | undefined>

export type StoreOptions = { env?: Env; now?: () => Date }

const added = (from: string[], to: string[]) => to.filter((value) => !from.includes(value))

function editCommands(id: string, current: EditableFields, request: EditRequest, stamp: string): string[][] {
  const { changes } = request
  const flags: string[] = []
  const text = (flag: string, value: string | undefined, now: string) => {
    if (value !== undefined && value !== now) flags.push(`--${flag}=${value}`)
  }
  text('title', changes.title, current.title)
  text('description', changes.description, current.description)
  const notes = request.noteEntry?.trim() ? withEntry(changes.notes ?? current.notes, stamp, request.noteEntry) : changes.notes
  text('notes', notes, current.notes)
  if (changes.priority !== undefined && changes.priority !== current.priority) flags.push(`--priority=${changes.priority}`)
  text('type', changes.issue_type, current.issue_type)
  text('parent', changes.parent, current.parent)
  const closing = closes(current, changes)
  if (changes.status !== undefined && !closing) text('status', changes.status, current.status)
  if (changes.labels) {
    for (const label of added(current.labels, changes.labels)) flags.push(`--add-label=${label}`)
    for (const label of added(changes.labels, current.labels)) flags.push(`--remove-label=${label}`)
  }
  const commands: string[][] = []
  if (changes.dependencies) {
    for (const dep of added(current.dependencies, changes.dependencies)) commands.push(['dep', 'add', id, dep])
    for (const dep of added(changes.dependencies, current.dependencies)) commands.push(['dep', 'remove', id, dep])
  }
  if (closing) commands.push(['close', id, `--reason=${request.closeReason?.trim() ?? ''}`])
  if (flags.length > 0) commands.push(['update', id, ...flags])
  return commands
}

const referencesOf = (current: EditableFields, changes: EditRequest['changes']): string[] => [
  ...(changes.parent && changes.parent !== current.parent ? [changes.parent] : []),
  ...(changes.dependencies ? added(current.dependencies, changes.dependencies) : []),
]

export function createStore(run: RunAsync, { env = process.env, now = () => new Date() }: StoreOptions = {}) {
  const queue = createWriteQueue()
  const usable = (db: DatabaseEntry) => {
    if (db.refused) throw new StoreError(REFUSED, db.refused)
  }

  const bd = async (db: DatabaseEntry, args: string[]): Promise<unknown> => {
    usable(db)
    const stdout = await runCheckedAsync(run, 'bd', ['-C', db.path, '--readonly', ...args, '--json'], {
      timeoutMs: BD_TIMEOUT_MS,
    }).catch((error: unknown) => {
      throw unreachable(db, error) ?? error
    })
    return parseJson(stdout, `bd ${args[0]}`)
  }

  const allBeads = async (db: DatabaseEntry): Promise<Bead[]> => {
    const beads = (await bd(db, ['list', '--all', '-n', '0'])) as Bead[]
    if (!Array.isArray(beads) || beads.length === 0) {
      throw new StoreError(
        STORE_NOT_OPEN,
        `bd list gave no bead for ${db.path}: the store did not open, or the database is empty.`,
      )
    }
    return beads
  }

  const notFound = (id: string) => new StoreError(NOT_FOUND, `bd show gave no bead for ${id}`)

  const editError = (id: string) => (error: unknown): never => {
    if (error instanceof Error && UNKNOWN_ID.test(error.message)) {
      throw error.message.includes(`"${id}"`) ? notFound(id) : new StoreError(INVALID, error.message)
    }
    throw error
  }

  const writeError = (id: string) => (error: unknown): never => {
    if (error instanceof Error && CLAIM_CONFLICT.test(error.message)) throw new StoreError(CONFLICT, error.message)
    if (error instanceof Error && UNKNOWN_ID.test(error.message)) throw notFound(id)
    throw error
  }

  const writeBd = async (db: DatabaseEntry, command: string[], what: string, onError: (error: unknown) => never) => {
    const name = await actor(db)
    const as = name ? ['--actor', name] : []
    const result = await run('bd', ['-C', db.path, ...as, ...command, '--json'], { timeoutMs: BD_TIMEOUT_MS })
    const loss = RECONCILE_LOSS.exec(`${result.stderr}\n${result.stdout}`)
    if (loss) {
      throw new StoreError(
        BEADS_DELETED,
        `bd deleted beads from ${db.path} when it wrote ${what}: "${loss[0].trim()}". The page did not export the beads. Restore the deleted beads before the next write.`,
      )
    }
    try {
      checked(result, 'bd', command)
    } catch (error) {
      if (result.status === null) throw new UnfinishedWrite((error as Error).message)
      const down = unreachable(db, error)
      if (down) throw down
      onError(error)
    }
  }

  const gitText = async (db: DatabaseEntry, args: string[]): Promise<string> => {
    const result = await run('git', ['-C', db.path, ...args], { timeoutMs: BD_TIMEOUT_MS })
    return result.status === 0 ? result.stdout.trim() : ''
  }

  const actor = async (db: DatabaseEntry): Promise<string> =>
    env.BEADS_ACTOR?.trim() || (await gitText(db, ['config', 'user.name'])) || env.USER?.trim() || ''

  const onServer = async (db: DatabaseEntry): Promise<boolean> => {
    const result = await run('bd', ['-C', db.path, 'context', '--json'], { timeoutMs: BD_TIMEOUT_MS })
    const unknownMode = (detail: string) =>
      new Error(
        `The write is done, but bd context could not tell whether ${db.path} is on a Dolt server, so the page did not export the beads: ${detail}. When the database is not on a Dolt server, run bd export -o ${join(db.path, EXPORT_FILE)}.`,
      )
    if (result.status !== 0) {
      throw unknownMode(
        withoutWarnings(result.stderr).trim() ||
          (result.status === null ? `did not finish in ${BD_TIMEOUT_MS / 1000} s` : `exit ${result.status}`),
      )
    }
    let mode: unknown
    try {
      mode = (parseJson(result.stdout, 'bd context') as { dolt_mode?: unknown }).dolt_mode
    } catch (error) {
      throw unknownMode((error as Error).message)
    }
    if (mode !== 'server' && mode !== 'embedded') throw unknownMode(`dolt_mode is ${JSON.stringify(mode)}`)
    return mode === 'server'
  }

  const tracksExport = async (db: DatabaseEntry): Promise<boolean> => {
    const result = await run('git', ['-C', db.path, 'ls-files', '--', EXPORT_FILE], { timeoutMs: BD_TIMEOUT_MS })
    if (result.status === 0) return result.stdout.trim() !== '' && !(await onServer(db))
    if (NOT_A_REPO.test(result.stderr)) return false
    const detail = (result.stderr || result.stdout).trim() || `exit ${result.status ?? 'none'}`
    throw new Error(
      `The write is done, but git could not tell whether ${db.path} tracks ${EXPORT_FILE}, so the page did not export the beads: ${detail}. Run bd export -o ${join(db.path, EXPORT_FILE)}.`,
    )
  }

  const exportAndCheck = async (db: DatabaseEntry) => {
    if (!(await tracksExport(db))) return
    const file = join(db.path, EXPORT_FILE)
    const exported = await run('bd', ['-C', db.path, 'export', '-o', file], { timeoutMs: BD_TIMEOUT_MS })
    if (exported.status !== 0) {
      const detail = (withoutWarnings(exported.stderr) || exported.stdout).trim()
      const failure =
        exported.status === null
          ? `did not finish in ${BD_TIMEOUT_MS / 1000} s`
          : `failed (exit ${exported.status})`
      throw new Error(`The write is done, but bd export ${failure}: ${detail}. Run bd export -o ${file}.`)
    }
    const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim() !== '').length
    const beads = await allBeads(db)
    if (lines !== beads.length) {
      throw new StoreError(
        EXPORT_MISMATCH,
        `The write is done, but ${file} holds ${lines} lines and bd list gives ${beads.length} beads. Run bd export -o ${file}, then compare again.`,
      )
    }
  }

  const latest = (db: DatabaseEntry, id: string): Promise<Bead | undefined> => showBead(db, id).catch(() => undefined)

  const showBead = async (db: DatabaseEntry, id: string): Promise<Bead> => {
    if (!ID.test(id)) throw notFound(id)
    const shown = await bd(db, ['show', id]).catch((error: unknown) => {
      if (!(error instanceof StoreError) && error instanceof Error && UNKNOWN_ID.test(error.message)) throw notFound(id)
      throw error
    })
    const [bead] = shown as Bead[]
    if (!bead) throw notFound(id)
    return bead
  }

  return {
    async listBeads(db: DatabaseEntry): Promise<BeadList> {
      const ready = bd(db, ['ready', '-n', '0']) as Promise<Bead[]>
      ready.catch(() => undefined)
      const beads = await allBeads(db)
      return { beads, readyIds: (await ready).map((bead) => bead.id) }
    },

    showBead,

    async actor(db: DatabaseEntry): Promise<string> {
      usable(db)
      return actor(db)
    },

    async writeClaim(db: DatabaseEntry, id: string, action: ClaimAction): Promise<Bead> {
      usable(db)
      if (!ID.test(id)) throw notFound(id)
      await queue(async () => {
        await writeBd(db, CLAIM_ARGS[action](id), 'the claim', writeError(id))
        if (action !== 'renew') await exportAndCheck(db)
      })
      return showBead(db, id)
    },

    async editBead(db: DatabaseEntry, id: string, request: EditRequest): Promise<Bead> {
      usable(db)
      if (!ID.test(id)) throw notFound(id)
      await queue(async () => {
        const bead = await showBead(db, id)
        if (versionOf(bead) !== request.version) {
          throw new StoreError(
            STALE,
            `Somebody changed ${id} after the page read it. Compare the fields, then save again.`,
            bead,
          )
        }
        const current = editableOf(bead)
        const problem = editProblem(request, current)
        if (problem) throw new StoreError(INVALID, problem)
        const missing: string[] = []
        for (const reference of referencesOf(current, request.changes)) {
          await showBead(db, reference).catch((error: unknown) => {
            if (error instanceof StoreError && error.code === NOT_FOUND) missing.push(reference)
            else throw error
          })
        }
        if (missing.length > 0) {
          throw new StoreError(INVALID, `The database has no bead ${missing.join(', ')}, so the page did not change ${id}.`)
        }
        const commands = editCommands(id, current, request, stampOf(now()))
        let done = 0
        try {
          for (const command of commands) {
            await writeBd(db, command, 'the edit', editError(id))
            done += 1
          }
        } catch (error) {
          const cause = (error as Error).message
          if (error instanceof StoreError && error.code === BEADS_DELETED) {
            throw new StoreError(BEADS_DELETED, cause, await latest(db, id))
          }
          if (done === 0 && !(error instanceof UnfinishedWrite)) throw error
          const message =
            done > 0
              ? `The page wrote ${done} of ${commands.length} changes of the edit, then ${cause}`
              : `bd did not finish the first change of the edit, so the page cannot tell whether bd wrote it: ${cause}`
          const exported = await exportAndCheck(db).then(
            () => '',
            (exportError: Error) => `\n${exportError.message}`,
          )
          throw new StoreError(PARTIAL_WRITE, `${message}${exported}`, await latest(db, id))
        }
        if (commands.length > 0) {
          await exportAndCheck(db).catch(async (error: Error) => {
            throw new StoreError(error instanceof StoreError ? error.code : PARTIAL_WRITE, error.message, await latest(db, id))
          })
        }
      })
      return showBead(db, id)
    },
  }
}

export type Store = ReturnType<typeof createStore>
