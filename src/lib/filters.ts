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

export const STATUS_FILTERS = ['ready', 'all', 'open', 'in_progress', 'closed'] as const

export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const BOARD_COLUMNS = ['open', 'in_progress', 'blocked', 'closed']

export const NO_EPIC = 'none'

export type ViewState = {
  db: string | null
  epic: string | null
  bead: string | null
  status: StatusFilter
  text: string
}

export type StoredFilters = { status?: string; text?: string }

const isStatusFilter = (value: string | null | undefined): value is StatusFilter =>
  STATUS_FILTERS.includes(value as StatusFilter)

export function readViewState(search: string, stored: StoredFilters): ViewState {
  const params = new URLSearchParams(search)
  const urlStatus = params.get('status')
  const status = isStatusFilter(urlStatus) ? urlStatus : isStatusFilter(stored.status) ? stored.status : 'ready'
  return {
    db: params.get('db'),
    epic: params.get('epic'),
    bead: params.get('bead'),
    status,
    text: params.get('q') ?? stored.text ?? '',
  }
}

export function writeViewState(state: ViewState): string {
  const params = new URLSearchParams()
  if (state.db) params.set('db', state.db)
  if (state.epic) params.set('epic', state.epic)
  if (state.bead) params.set('bead', state.bead)
  params.set('status', state.status)
  if (state.text) params.set('q', state.text)
  return `?${params.toString()}`
}

export function filterBeads(beads: Bead[], readyIds: string[], status: StatusFilter, text: string): Bead[] {
  const ready = new Set(readyIds)
  const needle = text.trim().toLowerCase()
  return beads.filter((bead) => {
    if (status === 'ready' && !ready.has(bead.id)) return false
    if (status !== 'ready' && status !== 'all' && bead.status !== status) return false
    return needle === '' || bead.title.toLowerCase().includes(needle)
  })
}

export const isEpic = (bead: Bead): boolean => bead.issue_type === 'epic'

export function childrenOf(beads: Bead[], epic: string): Bead[] {
  if (epic === NO_EPIC) {
    const ids = new Set(beads.map((bead) => bead.id))
    return beads.filter((bead) => !isEpic(bead) && !(bead.parent && ids.has(bead.parent)))
  }
  return beads.filter((bead) => bead.parent === epic)
}

export type EpicEntry = { id: string; title: string; status: string; counts: Record<string, number> }

const countByStatus = (beads: Bead[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const bead of beads) counts[bead.status] = (counts[bead.status] ?? 0) + 1
  return counts
}

export function epicsOf(beads: Bead[], status: StatusFilter): EpicEntry[] {
  const showClosed = status === 'all' || status === 'closed'
  const parents = new Set(beads.map((bead) => bead.parent))
  const isOpen = (bead: Bead) => bead.status !== 'closed'
  const epics = beads
    .filter((bead) => isEpic(bead) || parents.has(bead.id))
    .filter((bead) => showClosed || isOpen(bead) || childrenOf(beads, bead.id).some(isOpen))
    .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id))
    .map((epic) => ({
      id: epic.id,
      title: epic.title,
      status: epic.status,
      counts: countByStatus(childrenOf(beads, epic.id)),
    }))
  const orphans = childrenOf(beads, NO_EPIC)
  return [...epics, { id: NO_EPIC, title: 'No epic', status: 'open', counts: countByStatus(orphans) }]
}

export function columnsOf(beads: Bead[]): { status: string; beads: Bead[] }[] {
  const statuses = [...BOARD_COLUMNS, ...new Set(beads.map((bead) => bead.status))].filter(
    (status, index, all) => all.indexOf(status) === index,
  )
  return statuses.map((status) => ({
    status,
    beads: beads
      .filter((bead) => bead.status === status)
      .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id)),
  }))
}
