import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checked, parseJson, runCheckedAsync } from '../../../lib/process.ts'
import type { RunAsync } from '../../../lib/process.ts'
import { BEADS_DELETED, CONFLICT, EXPORT_MISMATCH, NOT_FOUND, REFUSED, STORE_NOT_OPEN } from '../shared/contract.ts'
import type { Bead, BeadList, ClaimAction, DatabaseEntry, StoreErrorCode } from '../shared/contract.ts'
import { createWriteQueue } from './write-queue.ts'

export const BD_TIMEOUT_MS = 15_000

export const EXPORT_FILE = '.beads/issues.jsonl'

const UNKNOWN_ID = /not found|no issues? found/

const HELD_BY_OTHER = /claimed by/

const NOT_A_REPO = /not a git repository/

const RECONCILE_LOSS = /auto-export: reconciled [1-9]\d* deleted[^\n]*/

const BEAD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

const CLAIM_ARGS: Record<ClaimAction, (id: string) => string[]> = {
  claim: (id) => ['update', id, '--claim'],
  unclaim: (id) => ['unclaim', id],
  renew: (id) => ['heartbeat', id],
}

export class StoreError extends Error {
  readonly code: StoreErrorCode
  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

type Env = Record<string, string | undefined>

export type StoreOptions = { env?: Env }

export function createStore(run: RunAsync, { env = process.env }: StoreOptions = {}) {
  const queue = createWriteQueue()
  const usable = (db: DatabaseEntry) => {
    if (db.refused) throw new StoreError(REFUSED, db.refused)
  }

  const bd = async (db: DatabaseEntry, args: string[]): Promise<unknown> => {
    usable(db)
    const stdout = await runCheckedAsync(run, 'bd', ['-C', db.path, '--readonly', ...args, '--json'], { timeoutMs: BD_TIMEOUT_MS })
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

  const writeError = (id: string) => (error: unknown) => {
    if (error instanceof Error && HELD_BY_OTHER.test(error.message)) throw new StoreError(CONFLICT, error.message)
    if (error instanceof Error && UNKNOWN_ID.test(error.message)) throw notFound(id)
    throw error
  }

  const gitText = async (db: DatabaseEntry, args: string[]): Promise<string> => {
    const result = await run('git', ['-C', db.path, ...args], { timeoutMs: BD_TIMEOUT_MS })
    return result.status === 0 ? result.stdout.trim() : ''
  }

  const actor = async (db: DatabaseEntry): Promise<string> =>
    env.BEADS_ACTOR?.trim() || (await gitText(db, ['config', 'user.name'])) || env.USER?.trim() || ''

  const tracksExport = async (db: DatabaseEntry): Promise<boolean> => {
    const result = await run('git', ['-C', db.path, 'ls-files', '--', EXPORT_FILE], { timeoutMs: BD_TIMEOUT_MS })
    if (result.status === 0) return result.stdout.trim() !== ''
    if (NOT_A_REPO.test(result.stderr)) return false
    const detail = (result.stderr || result.stdout).trim() || `exit ${result.status ?? 'none'}`
    throw new Error(
      `The write is done, but git could not tell whether ${db.path} tracks ${EXPORT_FILE}, so the page did not export the beads: ${detail}. Run bd export -o ${join(db.path, EXPORT_FILE)}.`,
    )
  }

  const exportAndCheck = async (db: DatabaseEntry) => {
    if (!(await tracksExport(db))) return
    const file = join(db.path, EXPORT_FILE)
    await runCheckedAsync(run, 'bd', ['-C', db.path, 'export', '-o', file], { timeoutMs: BD_TIMEOUT_MS })
    const lines = (await readFile(file, 'utf8')).split('\n').filter((line) => line.trim() !== '').length
    const beads = await allBeads(db)
    if (lines !== beads.length) {
      throw new StoreError(
        EXPORT_MISMATCH,
        `The write is done, but ${file} holds ${lines} lines and bd list gives ${beads.length} beads. Run bd export -o ${file}, then compare again.`,
      )
    }
  }

  const showBead = async (db: DatabaseEntry, id: string): Promise<Bead> => {
    if (!BEAD_ID.test(id)) throw notFound(id)
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
      if (!BEAD_ID.test(id)) throw notFound(id)
      await queue(async () => {
        const name = await actor(db)
        const as = name ? ['--actor', name] : []
        const args = ['-C', db.path, ...as, ...CLAIM_ARGS[action](id), '--json']
        const result = await run('bd', args, { timeoutMs: BD_TIMEOUT_MS })
        const loss = RECONCILE_LOSS.exec(`${result.stderr}\n${result.stdout}`)
        if (loss) {
          throw new StoreError(
            BEADS_DELETED,
            `bd deleted beads from ${db.path} when it wrote the claim: "${loss[0].trim()}". The page did not export the beads. Restore the deleted beads before the next write.`,
          )
        }
        try {
          checked(result, 'bd', args)
        } catch (error) {
          writeError(id)(error)
        }
        if (action !== 'renew') await exportAndCheck(db)
      })
      return showBead(db, id)
    },
  }
}

export type Store = ReturnType<typeof createStore>
