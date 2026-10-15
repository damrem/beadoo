export type Bead = {
  id: string
  title: string
  status: string
  priority?: number
  issue_type?: string
  assignee?: string
  labels?: string[]
  parent?: string | null
  description?: string | null
  notes?: string | null
  heartbeat_at?: string
  updated_at?: string
  revision?: string | null
  close_reason?: string | null
  lease_expires_at?: string
  dependencies?: { id: string; title?: string; status?: string; dependency_type?: string }[]
}

export type BeadList = { beads: Bead[]; readyIds: string[] }

export type DatabaseEntry = { name: string; path: string; refused?: string; hasTunnel?: boolean }

export const STORE_NOT_OPEN = 'STORE_NOT_OPEN'

export const REFUSED = 'REFUSED'

export const NOT_FOUND = 'NOT_FOUND'

export const CONFLICT = 'CONFLICT'

export const EXPORT_MISMATCH = 'EXPORT_MISMATCH'

export const BEADS_DELETED = 'BEADS_DELETED'

export const STALE = 'STALE'

export const INVALID = 'INVALID'

export const PARTIAL_WRITE = 'PARTIAL_WRITE'

export const UNREACHABLE = 'UNREACHABLE'

export const UNKNOWN_ERROR = 'ERROR'

export type StoreErrorCode =
  | typeof STORE_NOT_OPEN
  | typeof REFUSED
  | typeof NOT_FOUND
  | typeof CONFLICT
  | typeof EXPORT_MISMATCH
  | typeof BEADS_DELETED
  | typeof STALE
  | typeof INVALID
  | typeof PARTIAL_WRITE
  | typeof UNREACHABLE

export const TUNNEL_ROUTE = '/api/tunnel/start'

export const CLAIM_ACTIONS = ['claim', 'unclaim', 'renew'] as const

export type ClaimAction = (typeof CLAIM_ACTIONS)[number]
