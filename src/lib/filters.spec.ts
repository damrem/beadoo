import { BOARD_COLUMNS, childrenOf, columnsOf, columnStatusesOf, countLabel, epicsOf, filterBeads, groupByParent, labelsOf, lanesOf, NO_EPIC, orderedCounts, prioritiesOf, readViewState, statusesOf, statusTitle, statusTogglesOf, toggleStatus, typesOf, writeViewState } from './filters'
import type { Bead } from '../../shared/contract'
import type { BeadFilter, StatusFilter } from './filters'

const only = (change: Partial<BeadFilter>): BeadFilter => ({
  status: 'all',
  text: '',
  labels: [],
  type: null,
  priority: null,
  ...change,
})

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

  it('keeps the last filter of the user when the page opens with no link', () => {
    expect(readViewState('', { status: 'closed', text: 'cart' })).toMatchObject({
      status: ['closed'],
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

  it('keeps the last view of the user when the page opens with no link', () => {
    expect(readViewState('', { view: 'lanes' }).mode).toBe('lanes')
  })

  it('shows the default view and filters for each value that a link does not name, and not the last values of the user', () => {
    const lastVisit = { status: 'closed', text: 'zzzqqq', view: 'table', labels: ['front'], type: 'bug', priority: 2 }
    expect(readViewState('?view=lanes&db=.team&status=ready', lastVisit)).toMatchObject({
      mode: 'lanes',
      db: '.team',
      status: 'ready',
      text: '',
      labels: [],
      type: null,
      priority: null,
    })
  })

  it('shows the last view and filters of the user when the address names only the database', () => {
    const lastVisit = { status: 'closed', text: 'cart', view: 'table', labels: ['front'], type: 'bug', priority: 2 }
    expect(readViewState('?db=.team', lastVisit)).toMatchObject({
      mode: 'table',
      db: '.team',
      status: ['closed'],
      text: 'cart',
      labels: ['front'],
      type: 'bug',
      priority: 2,
    })
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
    const state = {
      mode: 'table' as const,
      db: 'shop',
      epic: 'e-1',
      bead: 't-1',
      status: ['open', 'in_progress'],
      text: 'cart',
      labels: ['front', 'urgent'],
      type: 'bug',
      priority: 0,
    }
    expect(readViewState(writeViewState(state), {})).toEqual(state)
  })

  it('shows all the labels, all the types and all the priorities when the user chose none', () => {
    expect(readViewState('', {})).toMatchObject({ labels: [], type: null, priority: null })
  })

  it('keeps the last label, type and priority filters of the user when the page opens with no link', () => {
    expect(readViewState('', { labels: ['front'], type: 'bug', priority: 2 })).toMatchObject({
      labels: ['front'],
      type: 'bug',
      priority: 2,
    })
  })

  it('follows the label, type and priority filters of the link before the last filters of the user', () => {
    expect(
      readViewState('?label=back&type=feature&priority=1', { labels: ['front'], type: 'bug', priority: 2 }),
    ).toMatchObject({ labels: ['back'], type: 'feature', priority: 1 })
  })

  it('ignores a priority that is not a number', () => {
    expect(readViewState('?priority=high', { priority: 'low' }).priority).toBeNull()
  })

  it('shows only the beads with no blocker under the ready filter', () => {
    expect(filterBeads(beads, ['t-1'], only({ status: 'ready' })).map((bead) => bead.id)).toEqual(['t-1'])
  })

  it('shows the beads of one status', () => {
    expect(filterBeads(beads, [], only({ status: ['in_progress'] })).map((bead) => bead.id)).toEqual(['t-2'])
  })

  it('shows the open and the in progress beads together when the user selects both', () => {
    expect(filterBeads(beads, [], only({ status: ['open', 'in_progress'] })).map((bead) => bead.id)).toEqual(['e-1', 't-1', 't-2', 't-4'])
  })

  it('opens an old link that holds one status', () => {
    expect(readViewState('?status=open', {}).status).toEqual(['open'])
    expect(readViewState('?status=all', {}).status).toBe('all')
  })

  it('opens a link that holds more than one status, and puts the statuses in the link again', () => {
    const state = readViewState('?status=in_progress&status=blocked', {})
    expect(state.status).toEqual(['in_progress', 'blocked'])
    expect(new URLSearchParams(writeViewState(state)).getAll('status')).toEqual(['in_progress', 'blocked'])
  })

  it('keeps the one status that the user stored before the page could select more than one', () => {
    expect(readViewState('', { status: 'closed' }).status).toEqual(['closed'])
    expect(readViewState('', { status: ['open', 'blocked'] }).status).toEqual(['open', 'blocked'])
  })

  it('adds a status to the selection, removes it on a second click, and shows all the beads when no status stays', () => {
    expect(toggleStatus('ready', 'blocked')).toEqual(['blocked'])
    expect(toggleStatus(['blocked'], 'in_progress')).toEqual(['in_progress', 'blocked'])
    expect(toggleStatus(['in_progress', 'blocked'], 'blocked')).toEqual(['in_progress'])
    expect(toggleStatus(['in_progress'], 'in_progress')).toBe('all')
  })

  it('clears the selected statuses when the user selects the ready or the all filter', () => {
    expect(toggleStatus(['open', 'closed'], 'ready')).toBe('ready')
    expect(toggleStatus(['open', 'closed'], 'all')).toBe('all')
  })

  it('offers the deferred status only when a loaded bead is deferred', () => {
    expect(statusTogglesOf(beads)).toEqual(['open', 'in_progress', 'blocked', 'closed'])
    expect(statusTogglesOf([...beads, { id: 't-9', title: 'Later', status: 'deferred' }])).toEqual(['open', 'in_progress', 'blocked', 'deferred', 'closed'])
  })

  it('finds the beads whose title holds the text that the user types, in any case', () => {
    expect(filterBeads(beads, [], only({ text: 'PAY' })).map((bead) => bead.id)).toEqual(['t-2'])
  })

  describe('the label, type and priority filters', () => {
    const tagged: Bead[] = [
      { id: 'b-1', title: 'Front bug', status: 'open', issue_type: 'bug', priority: 1, labels: ['front', 'urgent'] },
      { id: 'b-2', title: 'Front task', status: 'open', priority: 2, labels: ['front'] },
      { id: 'b-3', title: 'Back feature', status: 'open', issue_type: 'feature', priority: 1, labels: ['back', 'urgent'] },
      { id: 'b-4', title: 'No label', status: 'open', issue_type: 'bug' },
    ]
    const ids = (filter: Partial<BeadFilter>) => filterBeads(tagged, [], only(filter)).map((bead) => bead.id)

    it('shows only the beads that hold all the selected labels', () => {
      expect(ids({ labels: ['front'] })).toEqual(['b-1', 'b-2'])
      expect(ids({ labels: ['front', 'urgent'] })).toEqual(['b-1'])
      expect(ids({ labels: ['front', 'back'] })).toEqual([])
    })

    it('shows only the beads of the selected type, and counts a bead with no type as a task', () => {
      expect(ids({ type: 'bug' })).toEqual(['b-1', 'b-4'])
      expect(ids({ type: 'task' })).toEqual(['b-2'])
    })

    it('shows only the beads of the selected priority', () => {
      expect(ids({ priority: 1 })).toEqual(['b-1', 'b-3'])
    })

    it('shows only the beads that match the labels, the type, the priority, the status and the text together', () => {
      expect(ids({ labels: ['urgent'], type: 'bug', priority: 1, text: 'front' })).toEqual(['b-1'])
      expect(ids({ labels: ['urgent'], type: 'bug', priority: 1, status: ['closed'] })).toEqual([])
    })

    it('offers the labels, the types and the priorities that the loaded beads hold, each one time and in order', () => {
      expect(labelsOf(tagged)).toEqual(['back', 'front', 'urgent'])
      expect(typesOf(tagged)).toEqual(['bug', 'feature', 'task'])
      expect(prioritiesOf(tagged)).toEqual([1, 2])
    })
  })

  it('groups the beads that have no parent under "No epic"', () => {
    expect(childrenIn(beads, NO_EPIC).map((bead) => bead.id)).toEqual(['t-4'])
  })

  it('counts the children of each epic by status', () => {
    expect(epicsIn(beads, 'ready')).toEqual([
      { id: 'e-1', title: 'Checkout', status: 'open', counts: { open: 1, in_progress: 1, closed: 1 }, labels: [] },
      { id: NO_EPIC, title: 'No epic', status: 'open', counts: { open: 1 }, labels: [] },
    ])
  })

  it('gives an epic its own labels and the labels of its children, each one time', () => {
    const tagged: Bead[] = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', labels: ['repo:shop', 'front'] },
      { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1', labels: ['front', 'handoff'] },
      { id: 't-2', title: 'Pay button', status: 'closed', parent: 'e-1', labels: ['repo:shop', 'complexity:2'] },
      { id: 't-3', title: 'Fix the logo', status: 'open', labels: ['docs'] },
    ]
    const [epic, noEpic] = epicsIn(tagged, 'all')
    expect(epic.labels).toEqual(['repo:shop', 'front', 'handoff', 'complexity:2'])
    expect(noEpic.labels).toEqual([])
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

  it('shows only the open column under the ready filter, because a ready bead is always open', () => {
    expect(columnStatusesOf([beads[2]], 'ready')).toEqual(['open'])
  })

  it('shows all the status columns under the all filter', () => {
    expect(columnStatusesOf([beads[2]], 'all')).toEqual(BOARD_COLUMNS)
  })

  it('shows only the columns of the statuses that the user selected, in the usual order', () => {
    expect(columnStatusesOf([beads[3]], ['blocked', 'in_progress'])).toEqual(['in_progress', 'blocked'])
    expect(columnStatusesOf([], ['deferred'])).toEqual(['deferred'])
  })

  it('puts in each lane the beads of one epic that match the filter, and leaves out an epic with no match', () => {
    const list: Bead[] = [...beads, { id: 't-6', title: 'Search index', status: 'open', parent: 'e-2' }]
    const groups = groupByParent(list)
    const lanes = lanesOf(epicsOf(list, groups, 'ready'), groups, ['t-1', 't-4'], only({ status: 'ready' }), list)
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
    const [lane] = lanesOf(epicsOf(list, groups, 'all'), groups, [], only({}), list)
    expect(lane.beads.map((bead) => bead.id)).toEqual(['t-2', 't-1'])
  })

  describe('an epic with no children', () => {
    const list: Bead[] = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 'e-1.1', title: 'Payment', status: 'open', issue_type: 'epic', parent: 'e-1' },
      { id: 'e-2', title: 'Search', status: 'open', issue_type: 'epic', labels: ['front'] },
      { id: 'e-3', title: 'Old search', status: 'closed', issue_type: 'epic' },
    ]
    const laneIds = (status: StatusFilter, change: Partial<BeadFilter> = {}, readyIds = ['e-1', 'e-1.1', 'e-2']) => {
      const groups = groupByParent(list)
      return lanesOf(epicsOf(list, groups, status), groups, readyIds, only({ status, ...change }), list).map((lane) => lane.epic.id)
    }

    it('shows a lane for an empty epic, at the top level and inside another epic', () => {
      expect(laneIds('ready')).toEqual(['e-1', 'e-1.1', 'e-2'])
    })

    it('hides the lane of an empty epic that does not match the filter', () => {
      expect(laneIds('ready', { text: 'search' })).toEqual(['e-2'])
      expect(laneIds('ready', { labels: ['front'] })).toEqual(['e-2'])
      expect(laneIds('ready', { type: 'task' })).toEqual([])
    })

    it('shows the lane of a closed empty epic only under the all and closed filters', () => {
      expect(laneIds('ready')).not.toContain('e-3')
      expect(laneIds('all')).toContain('e-3')
      expect(laneIds(['closed'])).toEqual(['e-3'])
    })
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
