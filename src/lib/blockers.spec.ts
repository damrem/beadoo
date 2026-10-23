import type { Bead } from '../../shared/contract'
import { boardStatusOf, isReady, openBlockers, withBlockers } from '@/lib/blockers'
import { columnsOf } from '@/lib/filters'

const blocks = (issue: string, target: string) => ({ issue_id: issue, depends_on_id: target, type: 'blocks' })

const listed = (beads: Bead[]) => withBlockers(beads)

const byId = (beads: Bead[], id: string) => listed(beads).find((bead) => bead.id === id)!

describe('the blockers of a bead', () => {
  it('shows a bead with no blocker in the column of its own status', () => {
    const bead = byId([{ id: 't-1', title: 'Cart total', status: 'open' }], 't-1')
    expect(bead.blockers).toBeUndefined()
    expect(boardStatusOf(bead)).toBe('open')
  })

  it('shows a bead as blocked when one of its blockers is still open', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    const bead = byId(beads, 't-2')
    expect(bead.blockers).toEqual(['t-1'])
    expect(boardStatusOf(bead)).toBe('blocked')
  })

  it('does not show a bead as blocked when all its blockers are closed', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'closed' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(boardStatusOf(byId(beads, 't-2'))).toBe('open')
  })

  it('shows a bead in progress as blocked when it waits on an open bead', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'in_progress' },
      { id: 't-2', title: 'Pay button', status: 'in_progress', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(columnsOf(listed(beads), ['in_progress', 'blocked']).map((column) => [column.status, column.beads.map((bead) => bead.id)])).toEqual([
      ['in_progress', ['t-1']],
      ['blocked', ['t-2']],
    ])
  })

  it('keeps a closed bead in the closed column, also when a blocker is still open', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'closed', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(boardStatusOf(byId(beads, 't-2'))).toBe('closed')
  })

  it('does not count a parent or a related bead as a blocker', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Cart total', status: 'open' },
      {
        id: 't-2',
        title: 'Pay button',
        status: 'open',
        dependencies: [
          { issue_id: 't-2', depends_on_id: 'e-1', type: 'parent-child' },
          { issue_id: 't-2', depends_on_id: 't-1', type: 'related' },
        ],
      },
    ] as Bead[]
    expect(byId(beads, 't-2').blockers).toBeUndefined()
  })

  it('lists each open blocker one time, in order', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-3', title: 'Receipt mail', status: 'blocked' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-3'), blocks('t-2', 't-1'), blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(byId(beads, 't-2').blockers).toEqual(['t-1', 't-3'])
  })

  it('reads the status of each blocker from the detail of one bead', () => {
    const bead: Bead = {
      id: 't-2',
      title: 'Pay button',
      status: 'open',
      dependencies: [
        { id: 't-1', status: 'open', dependency_type: 'blocks' },
        { id: 't-3', status: 'closed', dependency_type: 'blocks' },
        { id: 'e-1', status: 'open', dependency_type: 'parent-child' },
      ],
    }
    expect(openBlockers(bead)).toEqual(['t-1'])
  })
})

describe('the beads that a blocker holds back', () => {
  it('lists each open bead that waits on the blocker, in order', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-3', title: 'Receipt mail', status: 'deferred', dependencies: [blocks('t-3', 't-1')] },
      { id: 't-2', title: 'Pay button', status: 'in_progress', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(byId(beads, 't-1').blocks).toEqual(['t-2', 't-3'])
  })

  it('does not count a closed bead as held back', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'closed', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(byId(beads, 't-1').blocks).toBeUndefined()
  })

  it('does not show a closed bead as a blocker', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'closed' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(byId(beads, 't-1').blocks).toBeUndefined()
  })

  it('counts only the beads that wait directly on the blocker', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
      { id: 't-3', title: 'Receipt mail', status: 'open', dependencies: [blocks('t-3', 't-2')] },
    ] as Bead[]
    expect(byId(beads, 't-1').blocks).toEqual(['t-2'])
    expect(byId(beads, 't-2').blocks).toEqual(['t-3'])
  })
})

describe('the ready beads', () => {
  const beads: Bead[] = [
    { id: 't-1', title: 'Cart total', status: 'open' },
    { id: 't-2', title: 'Pay button', status: 'open' },
    { id: 't-3', title: 'Receipt mail', status: 'in_progress' },
  ]

  it('marks as ready each bead that bd gives as ready, and no other bead', () => {
    expect(withBlockers(beads, ['t-1']).filter(isReady).map((bead) => bead.id)).toEqual(['t-1'])
  })

  it('marks no bead as ready before bd gives the ready beads', () => {
    expect(withBlockers(beads).filter(isReady)).toEqual([])
  })
})
