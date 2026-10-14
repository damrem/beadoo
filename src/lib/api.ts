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

const pageToken = (): string =>
  document.querySelector<HTMLMetaElement>('meta[name="beads-token"]')?.content ?? ''

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, init)
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
  if (!response.ok) throw new ApiError(body.error ?? `HTTP ${response.status}`, body.code ?? 'ERROR')
  return body as T
}

export const send = <T>(path: string, method: string, payload?: unknown): Promise<T> =>
  request<T>(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-beads-token': pageToken() },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })

const query = (db: string) => `db=${encodeURIComponent(db)}`

export const api = {
  databases: () => request<{ databases: DatabaseEntry[] }>('/api/databases').then((body) => body.databases),
  beads: (db: string) => request<BeadList>(`/api/beads?${query(db)}`),
  bead: (db: string, id: string) => request<Bead>(`/api/beads/${encodeURIComponent(id)}?${query(db)}`),
}
