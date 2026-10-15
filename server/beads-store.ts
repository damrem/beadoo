import { parseJson, runCheckedAsync } from '../../../lib/process.ts'
import type { RunAsync } from '../../../lib/process.ts'
import { NOT_FOUND, REFUSED, STORE_NOT_OPEN } from '../shared/contract.ts'
import type { Bead, BeadList, DatabaseEntry, StoreErrorCode } from '../shared/contract.ts'

export const BD_TIMEOUT_MS = 15_000

const UNKNOWN_ID = /not found|no issues found/

const BEAD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export class StoreError extends Error {
  readonly code: StoreErrorCode
  constructor(code: StoreErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export function createStore(run: RunAsync) {
  const bd = async (db: DatabaseEntry, args: string[]): Promise<unknown> => {
    if (db.refused) throw new StoreError(REFUSED, db.refused)
    const stdout = await runCheckedAsync(run, 'bd', ['-C', db.path, '--readonly', ...args, '--json'], { timeoutMs: BD_TIMEOUT_MS })
    return parseJson(stdout, `bd ${args[0]}`)
  }

  return {
    async listBeads(db: DatabaseEntry): Promise<BeadList> {
      const beads = (await bd(db, ['list', '--all', '-n', '0'])) as Bead[]
      if (!Array.isArray(beads) || beads.length === 0) {
        throw new StoreError(
          STORE_NOT_OPEN,
          `bd list gave no bead for ${db.path}: the store did not open, or the database is empty.`,
        )
      }
      const ready = (await bd(db, ['ready', '-n', '0'])) as Bead[]
      return { beads, readyIds: ready.map((bead) => bead.id) }
    },

    async showBead(db: DatabaseEntry, id: string): Promise<Bead> {
      const notFound = new StoreError(NOT_FOUND, `bd show gave no bead for ${id}`)
      if (!BEAD_ID.test(id)) throw notFound
      const shown = await bd(db, ['show', id]).catch((error: unknown) => {
        if (!(error instanceof StoreError) && error instanceof Error && UNKNOWN_ID.test(error.message)) throw notFound
        throw error
      })
      const [bead] = shown as Bead[]
      if (!bead) throw notFound
      return bead
    },
  }
}

export type Store = ReturnType<typeof createStore>
