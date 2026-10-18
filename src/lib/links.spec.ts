import { childBeadsOf } from './links'

const beads = [
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
  { id: 't-3', title: 'Receipt mail', status: 'closed', parent: 'e-1' },
  { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', priority: 1 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1', priority: 2 },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
]

describe('the children of a bead', () => {
  it('lists each child of the bead with its title and status, the most urgent first', () => {
    expect(childBeadsOf(beads, 'e-1')).toEqual([
      { id: 't-2', title: 'Pay button', status: 'open' },
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-3', title: 'Receipt mail', status: 'closed' },
    ])
  })

  it('lists no child for a bead that has no child', () => {
    expect(childBeadsOf(beads, 't-4')).toEqual([])
  })
})
