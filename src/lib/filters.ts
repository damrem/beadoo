import type { Bead } from '../../shared/contract'
import { boardStatusOf, isBlocker } from '@/lib/blockers'
import type { BoardBead } from '@/lib/blockers'
import { mergedLabels } from '@/lib/labels'

export const STATUS_CHOICES = ['ready', 'all'] as const

export type StatusChoice = (typeof STATUS_CHOICES)[number]

export const STATUS_TOGGLES = ['open', 'in_progress', 'blocked', 'deferred', 'closed']

export const BLOCKER = 'blocker'

export const FILTER_TOGGLES = [...STATUS_TOGGLES, BLOCKER]

export type StatusFilter = StatusChoice | string[]

export const BOARD_COLUMNS = ['open', 'in_progress', 'blocked', 'closed']

export const NO_EPIC = 'none'

export const VIEW_MODES = ['lanes', 'table', 'epic', 'graph'] as const

export type ViewMode = (typeof VIEW_MODES)[number]

const STATUS_TITLES: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  closed: 'Closed',
  blocker: 'Blockers',
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
  epicFilter: BeadFilter
  boardFilter: BeadFilter
}

export type BeadFilter = {
  status: StatusFilter
  text: string
  labels: string[]
  type: string | null
  priority: number | null
}

export type StoredFilter = {
  status?: unknown
  text?: string
  labels?: unknown
  type?: unknown
  priority?: unknown
}

export type StoredFilters = StoredFilter & {
  view?: string
  epics?: StoredFilter
  board?: StoredFilter
}

export const EPIC_PREFIX = 'epics.'

export const BOARD_PREFIX = 'board.'

export const EPIC_STATUS: StatusFilter = STATUS_TOGGLES.filter((status) => status !== 'closed')

const isStatusChoice = (value: unknown): value is StatusChoice => STATUS_CHOICES.includes(value as StatusChoice)

const readStatus = (value: unknown): StatusFilter | null => {
  const values = Array.isArray(value) ? value : [value]
  const toggles = FILTER_TOGGLES.filter((status) => values.includes(status))
  if (toggles.length > 0) return toggles
  return STATUS_CHOICES.find((choice) => values.includes(choice)) ?? null
}

export const statusValues = (status: StatusFilter): string[] => (isStatusChoice(status) ? [status] : status)

export function toggleStatus(current: StatusFilter, clicked: string): StatusFilter {
  if (isStatusChoice(clicked)) return clicked
  const selected = isStatusChoice(current) ? [] : current
  const next = selected.includes(clicked)
    ? selected.filter((status) => status !== clicked)
    : FILTER_TOGGLES.filter((status) => status === clicked || selected.includes(status))
  return next.length > 0 ? next : 'all'
}

export const statusTogglesOf = (beads: Bead[]): string[] => [
  ...STATUS_TOGGLES.filter((status) => BOARD_COLUMNS.includes(status) || beads.some((bead) => boardStatusOf(bead) === status)),
  BLOCKER,
]

const statusesIn = (toggles: string[]): string[] => toggles.filter((toggle) => toggle !== BLOCKER)

const matchesToggles = (bead: Bead, toggles: string[]): boolean => {
  if (toggles.includes(BLOCKER) && !isBlocker(bead)) return false
  const statuses = statusesIn(toggles)
  return statuses.length === 0 || statuses.includes(boardStatusOf(bead))
}

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

function readFilter(params: URLSearchParams, prefix: string, stored: StoredFilter, status: StatusFilter): BeadFilter {
  const key = (name: string) => `${prefix}${name}`
  return {
    status: readStatus(params.getAll(key('status'))) ?? readStatus(stored.status) ?? status,
    text: params.get(key('q')) ?? stored.text ?? '',
    labels: params.has(key('label')) ? readLabels(params.getAll(key('label'))) : readLabels(stored.labels),
    type: params.has(key('type')) ? readType(params.get(key('type'))) : readType(stored.type),
    priority: params.has(key('priority')) ? readPriority(params.get(key('priority'))) : readPriority(stored.priority),
  }
}

function writeFilter(params: URLSearchParams, prefix: string, filter: BeadFilter) {
  const key = (name: string) => `${prefix}${name}`
  for (const status of statusValues(filter.status)) params.append(key('status'), status)
  if (filter.text) params.set(key('q'), filter.text)
  for (const label of filter.labels) params.append(key('label'), label)
  if (filter.type) params.set(key('type'), filter.type)
  if (filter.priority !== null) params.set(key('priority'), String(filter.priority))
}

export const headerFilterOf = (state: ViewState): BeadFilter => ({
  status: state.status,
  text: state.text,
  labels: state.labels,
  type: state.type,
  priority: state.priority,
})

export function readViewState(search: string, lastVisit: StoredFilters): ViewState {
  const params = new URLSearchParams(search)
  const namesSettings = [...params.keys()].some((key) => key !== 'db')
  const stored: StoredFilters = namesSettings ? {} : lastVisit
  const urlMode = params.get('view')
  const mode = isViewMode(urlMode) ? urlMode : isViewMode(stored.view) ? stored.view : 'epic'
  return {
    mode,
    db: params.get('db'),
    epic: params.get('epic'),
    bead: params.get('bead'),
    ...readFilter(params, '', stored, 'ready'),
    epicFilter: readFilter(params, EPIC_PREFIX, stored.epics ?? {}, EPIC_STATUS),
    boardFilter: readFilter(params, BOARD_PREFIX, stored.board ?? {}, 'ready'),
  }
}

export function writeViewState(state: ViewState): string {
  const params = new URLSearchParams()
  params.set('view', state.mode)
  if (state.db) params.set('db', state.db)
  if (state.epic) params.set('epic', state.epic)
  if (state.bead) params.set('bead', state.bead)
  writeFilter(params, '', headerFilterOf(state))
  writeFilter(params, EPIC_PREFIX, state.epicFilter)
  writeFilter(params, BOARD_PREFIX, state.boardFilter)
  return `?${params.toString()}`
}

export function filterBeads<T extends BoardBead>(beads: T[], readyIds: string[], filter: BeadFilter): T[] {
  const { status, labels, type, priority } = filter
  const ready = new Set(readyIds)
  const needle = filter.text.trim().toLowerCase()
  return beads.filter((bead) => {
    if (status === 'ready' && !ready.has(bead.id)) return false
    if (!isStatusChoice(status) && !matchesToggles(bead, status)) return false
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

export const byPriorityThenId = (a: Bead, b: Bead): number =>
  (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id)

export type EpicEntry = {
  id: string
  title: string
  status: string
  counts: Record<string, number>
  labels: string[]
  blockers?: number
}

const inStatusOrder = (statuses: string[]): string[] => [...new Set([...BOARD_COLUMNS, ...statuses])]

export const orderedCounts = (counts: Record<string, number>): { status: string; count: number }[] =>
  inStatusOrder(Object.keys(counts))
    .filter((status) => counts[status])
    .map((status) => ({ status, count: counts[status] }))

export const countLabel = (counts: Record<string, number>): string =>
  orderedCounts(counts)
    .map(({ status, count }) => `${count} ${statusTitle(status)}`)
    .join(' · ') || 'no bead'

export const countByStatus = (beads: Bead[]): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const bead of beads) {
    const status = boardStatusOf(bead)
    counts[status] = (counts[status] ?? 0) + 1
  }
  return counts
}

export function epicsOf(beads: Bead[], groups: Groups, status: StatusFilter): EpicEntry[] {
  const showClosed = status === 'all' || statusValues(status).includes('closed')
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
      blockers: childrenOf(groups, epic.id).filter(isBlocker).length,
      labels: mergedLabels(epic.labels, ...childrenOf(groups, epic.id).map((child) => child.labels)),
    }))
  return [
    ...epics,
    {
      id: NO_EPIC,
      title: 'No epic',
      status: 'open',
      counts: countByStatus(childrenOf(groups, NO_EPIC)),
      labels: [],
      blockers: childrenOf(groups, NO_EPIC).filter(isBlocker).length,
    },
  ]
}

export const statusesOf = (beads: Bead[]): string[] => inStatusOrder(beads.map(boardStatusOf))

export const READY_STATUSES = ['open']

export function columnStatusesOf(beads: Bead[], status: StatusFilter): string[] {
  if (status === 'all') return statusesOf(beads)
  const allowed = status === 'ready' ? READY_STATUSES : statusesIn(status)
  const held = beads.map(boardStatusOf)
  return inStatusOrder([...allowed, ...held]).filter((value) => allowed.includes(value) || held.includes(value))
}

export function columnsOf(beads: Bead[], statuses: string[] = statusesOf(beads)): { status: string; beads: Bead[] }[] {
  return statuses.map((status) => ({
    status,
    beads: beads
      .filter((bead) => boardStatusOf(bead) === status)
      .sort(byPriorityThenId),
  }))
}

export type Lane = { epic: EpicEntry; beads: BoardBead[] }

const asParent = (bead: Bead, children: Bead[]): Bead =>
  bead.status === 'closed' && children.some((child) => child.status !== 'closed') ? { ...bead, status: 'open' } : bead

export function epicListOf(beads: Bead[], groups: Groups, readyIds: string[], filter: BeadFilter): Lane[] {
  const parents = beads.filter((bead) => isEpic(bead) || groups.has(bead.id))
  const matching = new Set(
    filterBeads(parents.map((bead) => asParent(bead, childrenOf(groups, bead.id))), readyIds, filter).map((bead) => bead.id),
  )
  return epicsOf(beads, groups, 'all')
    .filter((epic) => (epic.id === NO_EPIC ? groups.has(NO_EPIC) : matching.has(epic.id)))
    .map((epic) => ({ epic, beads: childrenOf(groups, epic.id) }))
}

export function lanesOf(
  epics: EpicEntry[],
  groups: Groups,
  readyIds: string[],
  filter: BeadFilter,
  beads: Bead[],
): Lane[] {
  const childless = new Set(filterBeads(beads.filter((bead) => !groups.has(bead.id)), readyIds, filter).map((bead) => bead.id))
  return epics
    .map((epic) => ({
      epic,
      beads: filterBeads(childrenOf(groups, epic.id), readyIds, filter).sort(byPriorityThenId),
    }))
    .filter((lane) => lane.beads.length > 0 || childless.has(lane.epic.id))
}
