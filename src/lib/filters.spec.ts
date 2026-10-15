import { BOARD_COLUMNS, childrenOf, columnsOf, countLabel, epicsOf, filterBeads, groupByParent, lanesOf, NO_EPIC, orderedCounts, readViewState, statusesOf, statusTitle, writeViewState } from './filters'
import type { Bead } from '../../shared/contract'
import type { StatusFilter } from './filters'

const epicsIn = (list: Bead[], status: StatusFilter) => epicsOf(list, groupByParent(list), status)
const childrenIn = (list: Bead[], epic: string) => childrenOf(groupByParent(list), epic)

const beads: Bead[] = [
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
  { id: 'e-2', title: 'Old search', status: 'closed', issue_type: 'epic', priority: 0 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
  { id: 't-2', title: 'Pay button', status: 'in_progress', parent: 'e-1' },
  { id: 't-3', title: 'Receipt mail', status: 'closed', parent: 'e-1' },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
]

describe('the filters of the page', () => {
  it('shows the ready beads when the user chose no filter', () => {
    expect(readViewState('', {}).status).toBe('ready')
  })

  it('keeps the last filter of the user when the link holds none', () => {
    expect(readViewState('?db=shop', { status: 'closed', text: 'cart' })).toMatchObject({
      db: 'shop',
      status: 'closed',
      text: 'cart',
    })
  })

  it('follows the filter of the link before the last filter of the user', () => {
    expect(readViewState('?status=all&q=pay', { status: 'closed', text: 'cart' })).toMatchObject({
      status: 'all',
      text: 'pay',
    })
  })

  it('shows the board of one epic when the user chose no view', () => {
    expect(readViewState('', {}).mode).toBe('epic')
  })

  it('keeps the last view of the user when the link holds none', () => {
    expect(readViewState('?db=shop', { view: 'lanes' }).mode).toBe('lanes')
  })

  it('follows the view of the link before the last view of the user', () => {
    expect(readViewState('?view=table', { view: 'lanes' }).mode).toBe('table')
  })

  it('ignores a view name that it does not know', () => {
    expect(readViewState('?view=wrong', { view: 'other' }).mode).toBe('epic')
  })

  it('ignores a filter name that it does not know', () => {
    expect(readViewState('?status=wrong', {}).status).toBe('ready')
  })

  it('puts the view, the database, the epic, the open bead and the filters in the link', () => {
    const state = { mode: 'table' as const, db: 'shop', epic: 'e-1', bead: 't-1', status: 'open' as const, text: 'cart' }
    expect(readViewState(writeViewState(state), {})).toEqual(state)
  })

  it('shows only the beads with no blocker under the ready filter', () => {
    expect(filterBeads(beads, ['t-1'], 'ready', '').map((bead) => bead.id)).toEqual(['t-1'])
  })

  it('shows the beads of one status', () => {
    expect(filterBeads(beads, [], 'in_progress', '').map((bead) => bead.id)).toEqual(['t-2'])
  })

  it('finds the beads whose title holds the text that the user types, in any case', () => {
    expect(filterBeads(beads, [], 'all', 'PAY').map((bead) => bead.id)).toEqual(['t-2'])
  })

  it('groups the beads that have no parent under "No epic"', () => {
    expect(childrenIn(beads, NO_EPIC).map((bead) => bead.id)).toEqual(['t-4'])
  })

  it('counts the children of each epic by status', () => {
    expect(epicsIn(beads, 'ready')).toEqual([
      { id: 'e-1', title: 'Checkout', status: 'open', counts: { open: 1, in_progress: 1, closed: 1 } },
      { id: NO_EPIC, title: 'No epic', status: 'open', counts: { open: 1 } },
    ])
  })

  it('shows the closed epics only under the all and closed filters', () => {
    expect(epicsIn(beads, 'all').map((epic) => epic.id)).toEqual(['e-2', 'e-1', NO_EPIC])
  })

  it('lists a parent that is not an epic, with its children, so that its children show on a board', () => {
    const withChore: Bead[] = [
      ...beads,
      { id: 'c-1', title: 'Tidy the repo', status: 'closed', issue_type: 'chore' },
      { id: 'c-1.1', title: 'Remove the old script', status: 'closed', parent: 'c-1' },
    ]
    expect(epicsIn(withChore, 'all').map((epic) => epic.id)).toContain('c-1')
    expect(childrenIn(withChore, 'c-1').map((bead) => bead.id)).toEqual(['c-1.1'])
  })

  it('shows a parent that is not an epic only in the epic list, and not also as a card under "No epic"', () => {
    const withChore: Bead[] = [
      ...beads,
      { id: 'c-1', title: 'Tidy the repo', status: 'open', issue_type: 'chore' },
      { id: 'c-1.1', title: 'Remove the old script', status: 'open', parent: 'c-1' },
    ]
    expect(childrenIn(withChore, NO_EPIC).map((bead) => bead.id)).toEqual(['t-4'])
  })

  it('keeps a closed epic in the list while one of its children is still open', () => {
    const withOpenChild: Bead[] = [...beads, { id: 't-6', title: 'Search index', status: 'open', parent: 'e-2' }]
    expect(epicsIn(withOpenChild, 'ready').map((epic) => epic.id)).toEqual(['e-2', 'e-1', NO_EPIC])
  })

  it('shows a bead whose parent is not in the database under "No epic"', () => {
    const lost: Bead[] = [...beads, { id: 't-7', title: 'Lost task', status: 'open', parent: 'gone' }]
    expect(childrenIn(lost, NO_EPIC).map((bead) => bead.id)).toEqual(['t-4', 't-7'])
  })

  it('puts each bead in the column of its status, and adds a column for an unusual status', () => {
    const columns = columnsOf([...beads.slice(2), { id: 't-5', title: 'Later', status: 'deferred' }])
    expect(columns.map((column) => [column.status, column.beads.map((bead) => bead.id)])).toEqual([
      ['open', ['t-1', 't-4']],
      ['in_progress', ['t-2']],
      ['blocked', []],
      ['closed', ['t-3']],
      ['deferred', ['t-5']],
    ])
  })

  it('puts in each lane the beads of one epic that match the filter, and leaves out an epic with no match', () => {
    const list: Bead[] = [...beads, { id: 't-6', title: 'Search index', status: 'open', parent: 'e-2' }]
    const groups = groupByParent(list)
    const lanes = lanesOf(epicsOf(list, groups, 'ready'), groups, ['t-1', 't-4'], 'ready', '')
    expect(lanes.map((lane) => [lane.epic.id, lane.beads.map((bead) => bead.id)])).toEqual([
      ['e-1', ['t-1']],
      [NO_EPIC, ['t-4']],
    ])
  })

  it('sorts the beads of a lane by priority', () => {
    const list: Bead[] = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Late', status: 'open', parent: 'e-1', priority: 3 },
      { id: 't-2', title: 'Urgent', status: 'open', parent: 'e-1', priority: 0 },
    ]
    const groups = groupByParent(list)
    const [lane] = lanesOf(epicsOf(list, groups, 'all'), groups, [], 'all', '')
    expect(lane.beads.map((bead) => bead.id)).toEqual(['t-2', 't-1'])
  })

  it('shows the statuses of the epic counts in the same order as the status columns', () => {
    const counts = { deferred: 1, closed: 1, blocked: 1, in_progress: 1, open: 1 }
    const list: Bead[] = Object.keys(counts).map((status, index) => ({ id: `t-${index}`, title: status, status }))
    expect(orderedCounts(counts).map((part) => part.status)).toEqual(statusesOf(list))
    expect(statusesOf(list).slice(0, BOARD_COLUMNS.length)).toEqual(BOARD_COLUMNS)
  })

  it('names a status with the same words in the epic counts and in the bead rows', () => {
    expect(countLabel({ in_progress: 1, needs_peer_review: 2 })).toBe(
      `1 ${statusTitle('in_progress')} · 2 ${statusTitle('needs_peer_review')}`,
    )
    expect(statusTitle('in_progress')).toBe('In progress')
    expect(statusTitle('needs_peer_review')).toBe('Needs peer review')
  })

  it('names each status of the children of an epic with its count, also an unusual status', () => {
    expect(countLabel({ closed: 1, deferred: 2, open: 3 })).toBe('3 Open · 1 Closed · 2 Deferred')
    expect(countLabel({})).toBe('no bead')
  })
})
