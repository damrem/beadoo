import type { Bead } from '../../shared/contract'
import { mergedLabels } from '@/lib/labels'

export const STATUS_FILTERS = ['ready', 'all', 'open', 'in_progress', 'closed'] as const

export type StatusFilter = (typeof STATUS_FILTERS)[number]

export const BOARD_COLUMNS = ['open', 'in_progress', 'blocked', 'closed']

export const NO_EPIC = 'none'

export const VIEW_MODES = ['lanes', 'table', 'epic'] as const

export type ViewMode = (typeof VIEW_MODES)[number]

const STATUS_TITLES: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
}

export const statusTitle = (status: string): string => {
  const words = status.replaceAll('_', ' ')
  return STATUS_TITLES[status] ?? words.charAt(0).toUpperCase() + words.slice(1)
}

export type ViewState = {
  mode: ViewMode
  db: string | null
  epic: string | null
  bead: string | null
  status: StatusFilter
  text: string
  labels: string[]
  type: string | null
  priority: number | null
}

export type BeadFilter = Pick<ViewState, 'status' | 'text' | 'labels' | 'type' | 'priority'>

export type StoredFilters = {
  status?: string
  text?: string
  view?: string
  labels?: unknown
  type?: unknown
  priority?: unknown
}

const isStatusFilter = (value: string | null | undefined): value is StatusFilter =>
  STATUS_FILTERS.includes(value as StatusFilter)

const isViewMode = (value: string | null | undefined): value is ViewMode => VIEW_MODES.includes(value as ViewMode)

const DEFAULT_TYPE = 'task'

export const typeOf = (bead: Bead): string => bead.issue_type || DEFAULT_TYPE

const readPriority = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const priority = Number(value)
  return Number.isInteger(priority) && priority >= 0 ? priority : null
}

const readType = (value: unknown): string | null => (isLabel(value) ? value : null)

const isLabel = (value: unknown): value is string => typeof value === 'string' && value !== ''

const readLabels = (value: unknown): string[] => (Array.isArray(value) ? [...new Set(value.filter(isLabel))] : [])

export function readViewState(search: string, lastVisit: StoredFilters): ViewState {
  const params = new URLSearchParams(search)
  const stored: StoredFilters = params.size > 0 ? {} : lastVisit
  const urlStatus = params.get('status')
  const status = isStatusFilter(urlStatus) ? urlStatus : isStatusFilter(stored.status) ? stored.status : 'ready'
  const urlMode = params.get('view')
  const mode = isViewMode(urlMode) ? urlMode : isViewMode(stored.view) ? stored.view : 'epic'
  return {
    mode,
    db: params.get('db'),
    epic: params.get('epic'),
    bead: params.get('bead'),
    status,
    text: params.get('q') ?? stored.text ?? '',
    labels: params.has('label') ? readLabels(params.getAll('label')) : readLabels(stored.labels),
    type: params.has('type') ? readType(params.get('type')) : readType(stored.type),
    priority: params.has('priority') ? readPriority(params.get('priority')) : readPriority(stored.priority),
  }
}

export function writeViewState(state: ViewState): string {
  const params = new URLSearchParams()
  params.set('view', state.mode)
  if (state.db) params.set('db', state.db)
  if (state.epic) params.set('epic', state.epic)
  if (state.bead) params.set('bead', state.bead)
  params.set('status', state.status)
  if (state.text) params.set('q', state.text)
  for (const label of state.labels) params.append('label', label)
  if (state.type) params.set('type', state.type)
  if (state.priority !== null) params.set('priority', String(state.priority))
  return `?${params.toString()}`
}

export function filterBeads(beads: Bead[], readyIds: string[], filter: BeadFilter): Bead[] {
  const { status, labels, type, priority } = filter
  const ready = new Set(readyIds)
  const needle = filter.text.trim().toLowerCase()
  return beads.filter((bead) => {
    if (status === 'ready' && !ready.has(bead.id)) return false
    if (status !== 'ready' && status !== 'all' && bead.status !== status) return false
    if (type !== null && typeOf(bead) !== type) return false
    if (priority !== null && bead.priority !== priority) return false
    if (!labels.every((label) => bead.labels?.includes(label))) return false
    return needle === '' || bead.title.toLowerCase().includes(needle)
  })
}

const sortedValues = <T extends string | number>(values: T[]): T[] =>
  [...new Set(values)].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))))

export const labelsOf = (beads: Bead[]): string[] => sortedValues(beads.flatMap((bead) => bead.labels ?? []))

export const typesOf = (beads: Bead[]): string[] => sortedValues(beads.map(typeOf))

export const prioritiesOf = (beads: Bead[]): number[] =>
  sortedValues(beads.flatMap((bead) => (bead.priority === undefined ? [] : [bead.priority])))

export const isEpic = (bead: Bead): boolean => bead.issue_type === 'epic'

export type Groups = Map<string, Bead[]>

export function groupByParent(beads: Bead[]): Groups {
  const ids = new Set(beads.map((bead) => bead.id))
  const parents = new Set(beads.flatMap((bead) => (bead.parent && ids.has(bead.parent) ? [bead.parent] : [])))
  const groups: Groups = new Map()
  for (const bead of beads) {
    const key = bead.parent && ids.has(bead.parent) ? bead.parent : isEpic(bead) || parents.has(bead.id) ? null : NO_EPIC
    if (key === null) continue
    const group = groups.get(key)
    if (group) group.push(bead)
    else groups.set(key, [bead])
  }
  return groups
}

export const childrenOf = (groups: Groups, epic: string): Bead[] => groups.get(epic) ?? []

const byPriorityThenId = (a: Bead, b: Bead): number =>
  (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id)

export type EpicEntry = { id: string; title: string; status: string; counts: Record<string, number>; labels: string[] }

const inStatusOrder = (statuses: string[]): string[] => [...new Set([...BOARD_COLUMNS, ...statuses])]

export const orderedCounts = (counts: Record<string, number>): { status: string; count: number }[] =>
  inStatusOrder(Object.keys(counts))
    .filter((status) => counts[status])
    .map((status) => ({ status, count: counts[status] }))

export const countLabel = (counts: Record<string, number>): string =>
  orderedCounts(counts)
    .map(({ status, count }) => `${count} ${statusTitle(status)}`)
    .join(' · ') || 'no bead'

const countByStatus = (beads: Bead[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const bead of beads) counts[bead.status] = (counts[bead.status] ?? 0) + 1
  return counts
}

export function epicsOf(beads: Bead[], groups: Groups, status: StatusFilter): EpicEntry[] {
  const showClosed = status === 'all' || status === 'closed'
  const isOpen = (bead: Bead) => bead.status !== 'closed'
  const epics = beads
    .filter((bead) => isEpic(bead) || groups.has(bead.id))
    .filter((bead) => showClosed || isOpen(bead) || childrenOf(groups, bead.id).some(isOpen))
    .sort(byPriorityThenId)
    .map((epic) => ({
      id: epic.id,
      title: epic.title,
      status: epic.status,
      counts: countByStatus(childrenOf(groups, epic.id)),
      labels: mergedLabels(epic.labels, ...childrenOf(groups, epic.id).map((child) => child.labels)),
    }))
  return [
    ...epics,
    { id: NO_EPIC, title: 'No epic', status: 'open', counts: countByStatus(childrenOf(groups, NO_EPIC)), labels: [] },
  ]
}

export const statusesOf = (beads: Bead[]): string[] => inStatusOrder(beads.map((bead) => bead.status))

export function columnsOf(beads: Bead[], statuses: string[] = statusesOf(beads)): { status: string; beads: Bead[] }[] {
  return statuses.map((status) => ({
    status,
    beads: beads
      .filter((bead) => bead.status === status)
      .sort(byPriorityThenId),
  }))
}

export type Lane = { epic: EpicEntry; beads: Bead[] }

export function lanesOf(
  epics: EpicEntry[],
  groups: Groups,
  readyIds: string[],
  filter: BeadFilter,
): Lane[] {
  return epics
    .map((epic) => ({
      epic,
      beads: filterBeads(childrenOf(groups, epic.id), readyIds, filter).sort(byPriorityThenId),
    }))
    .filter((lane) => lane.beads.length > 0)
}
