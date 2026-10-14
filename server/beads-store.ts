import { parseJson, runChecked } from '../../../lib/process.ts'
import type { Run } from '../../../lib/process.ts'
import type { DatabaseEntry } from './config-rules.ts'

export const BD_TIMEOUT_MS = 15_000

export const STORE_NOT_OPEN = 'STORE_NOT_OPEN'

export type Bead = { id: string; title: string; status: string; parent?: string; [key: string]: unknown }

export type BeadList = { beads: Bead[]; readyIds: string[] }

export class StoreError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

export function createStore(run: Run) {
  const bd = (db: DatabaseEntry, args: string[]): unknown => {
    if (db.refused) throw new StoreError('REFUSED', db.refused)
    const stdout = runChecked(run, 'bd', ['-C', db.path, '--readonly', ...args, '--json'], { timeoutMs: BD_TIMEOUT_MS })
    return parseJson(stdout, `bd ${args[0]}`)
  }

  return {
    listBeads(db: DatabaseEntry): BeadList {
      const beads = bd(db, ['list', '--all', '-n', '0']) as Bead[]
      if (!Array.isArray(beads) || beads.length === 0) {
        throw new StoreError(
          STORE_NOT_OPEN,
          `bd list gave no bead for ${db.path}: the store did not open, or the database is empty.`,
        )
      }
      const ready = bd(db, ['ready', '-n', '0']) as Bead[]
      return { beads, readyIds: ready.map((bead) => bead.id) }
    },

    showBead(db: DatabaseEntry, id: string): Bead {
      const [bead] = bd(db, ['show', id]) as Bead[]
      if (!bead) throw new StoreError('NOT_FOUND', `bd show gave no bead for ${id}`)
      return bead
    },
  }
}

export type Store = ReturnType<typeof createStore>
