import { render, screen } from '@testing-library/react'
import { Board } from './Board'

const beads = [
  { id: 'b-1', title: 'Cart total', status: 'open' },
  { id: 'b-2', title: 'Pay button', status: 'blocked' },
  { id: 'b-3', title: 'Receipt mail', status: 'in_progress' },
]

describe('the board of an epic', () => {
  it('shows the blocked column first', () => {
    render(<Board beads={beads} onOpen={() => {}} />)
    expect(screen.getAllByRole('region').map((column) => column.getAttribute('aria-label'))).toEqual([
      'Blocked',
      'Open',
      'In progress',
      'Closed',
    ])
  })

  it('shows only the open column when the user shows the ready beads', () => {
    render(<Board beads={beads.slice(0, 1)} status="ready" onOpen={() => {}} />)
    expect(screen.getAllByRole('region').map((column) => column.getAttribute('aria-label'))).toEqual(['Open'])
  })

  it('shows only the columns of the statuses that the user selected', () => {
    render(<Board beads={beads.slice(1)} status={['in_progress', 'blocked']} onOpen={() => {}} />)
    expect(screen.getAllByRole('region').map((column) => column.getAttribute('aria-label'))).toEqual(['Blocked', 'In progress'])
  })

  it('shows each column in the colour of its status', () => {
    render(<Board beads={beads} onOpen={() => {}} />)
    expect(screen.getByRole('region', { name: 'Blocked' }).style.getPropertyValue('--tone')).toBe('var(--ctp-red)')
    expect(screen.getByRole('region', { name: 'Open' }).style.getPropertyValue('--tone')).toBe('var(--ctp-blue)')
  })
})
