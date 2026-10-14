import { childrenOf, columnsOf, epicsOf, filterBeads, NO_EPIC, readViewState, writeViewState } from './filters'
import type { Bead } from './filters'

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

  it('ignores a filter name that it does not know', () => {
    expect(readViewState('?status=wrong', {}).status).toBe('ready')
  })

  it('puts the database, the epic, the open bead and the filters in the link', () => {
    const state = { db: 'shop', epic: 'e-1', bead: 't-1', status: 'open' as const, text: 'cart' }
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
    expect(childrenOf(beads, NO_EPIC).map((bead) => bead.id)).toEqual(['t-4'])
  })

  it('counts the children of each epic by status', () => {
    expect(epicsOf(beads, 'ready')).toEqual([
      { id: 'e-1', title: 'Checkout', status: 'open', counts: { open: 1, in_progress: 1, closed: 1 } },
      { id: NO_EPIC, title: 'No epic', status: 'open', counts: { open: 1 } },
    ])
  })

  it('shows the closed epics only under the all and closed filters', () => {
    expect(epicsOf(beads, 'all').map((epic) => epic.id)).toEqual(['e-2', 'e-1', NO_EPIC])
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
})
