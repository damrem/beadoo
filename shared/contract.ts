export type Bead = {
  id: string
  title: string
  status: string
  priority?: number
  issue_type?: string
  assignee?: string
  labels?: string[]
  parent?: string
  description?: string
  notes?: string
  heartbeat_at?: string
  lease_expires_at?: string
  dependencies?: { id: string; title?: string; status?: string; dependency_type?: string }[]
}

export type BeadList = { beads: Bead[]; readyIds: string[] }

export type DatabaseEntry = { name: string; path: string; refused?: string }

export const STORE_NOT_OPEN = 'STORE_NOT_OPEN'

export const REFUSED = 'REFUSED'

export const NOT_FOUND = 'NOT_FOUND'

export const UNKNOWN_ERROR = 'ERROR'

export type StoreErrorCode = typeof STORE_NOT_OPEN | typeof REFUSED | typeof NOT_FOUND
