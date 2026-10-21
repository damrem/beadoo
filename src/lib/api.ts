import { TUNNEL_ROUTE, UNKNOWN_ERROR } from '../../shared/contract'
import type { Bead, BeadList, ClaimAction, Commit, DatabaseEntry } from '../../shared/contract'
import type { EditRequest } from '../../shared/edit'
import type { SpawnChoices, SpawnedSession, SpawnRequest } from '../../shared/spawn'

export class ApiError extends Error {
  readonly code: string
  readonly bead?: Bead
  constructor(message: string, code: string, bead?: Bead) {
    super(message)
    this.code = code
    this.bead = bead
  }
}

const pageToken = (): string =>
  document.querySelector<HTMLMetaElement>('meta[name="beads-token"]')?.content ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init)
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string; bead?: Bead }
  if (!response.ok) throw new ApiError(body.error ?? `HTTP ${response.status}`, body.code ?? UNKNOWN_ERROR, body.bead)
  return body as T
}

const query = (db: string) => `db=${encodeURIComponent(db)}`

export const api = {
  databases: () => request<{ databases: DatabaseEntry[]; spawn?: boolean }>('/api/databases'),
  beads: (db: string) => request<BeadList>(`/api/beads?${query(db)}`),
  bead: (db: string, id: string) => request<Bead>(`/api/beads/${encodeURIComponent(id)}?${query(db)}`),
  actor: (db: string) => request<{ actor: string }>(`/api/actor?${query(db)}`).then((body) => body.actor),
  claim: (db: string, id: string, action: ClaimAction) =>
    request<Bead>(`/api/beads/${encodeURIComponent(id)}/${action}?${query(db)}`, {
      method: 'POST',
      headers: { 'x-beads-token': pageToken() },
    }),
  startTunnel: (db: string) =>
    request<{ started: string }>(`${TUNNEL_ROUTE}?${query(db)}`, {
      method: 'POST',
      headers: { 'x-beads-token': pageToken() },
    }).then(() => undefined),
  commits: (db: string, id: string) =>
    request<{ commits: Commit[] }>(`/api/beads/${encodeURIComponent(id)}/commits?${query(db)}`).then((body) => body.commits),
  spawnChoices: (db: string, id: string) => request<SpawnChoices>(`/api/beads/${encodeURIComponent(id)}/spawn-choices?${query(db)}`),
  spawn: (db: string, id: string, spawn: SpawnRequest) =>
    request<SpawnedSession>(`/api/beads/${encodeURIComponent(id)}/spawn?${query(db)}`, {
      method: 'POST',
      headers: { 'x-beads-token': pageToken(), 'content-type': 'application/json' },
      body: JSON.stringify(spawn),
    }),
  edit: (db: string, id: string, edit: EditRequest) =>
    request<Bead>(`/api/beads/${encodeURIComponent(id)}/edit?${query(db)}`, {
      method: 'POST',
      headers: { 'x-beads-token': pageToken(), 'content-type': 'application/json' },
      body: JSON.stringify(edit),
    }),
}
