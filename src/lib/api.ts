import type { Bead } from './filters'

export type DatabaseEntry = { name: string; path: string; refused?: string }

export type BeadList = { beads: Bead[]; readyIds: string[] }

export class ApiError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path)
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!response.ok) throw new ApiError(body.error ?? `HTTP ${response.status}`, body.code ?? 'ERROR')
  return body as T
}

const query = (db: string) => `db=${encodeURIComponent(db)}`

export const api = {
  databases: () => request<{ databases: DatabaseEntry[] }>('/api/databases').then((body) => body.databases),
  beads: (db: string) => request<BeadList>(`/api/beads?${query(db)}`),
  bead: (db: string, id: string) => request<Bead>(`/api/beads/${encodeURIComponent(id)}?${query(db)}`),
}
