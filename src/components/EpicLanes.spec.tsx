import { render, screen, within } from '@testing-library/react'
import { EpicLanes } from './EpicLanes'

const lanes = [
  {
    epic: { id: 'e-1', title: 'Checkout', status: 'open', counts: { open: 1, blocked: 1 } },
    beads: [
      { id: 'b-1', title: 'Cart total', status: 'open' },
      { id: 'b-2', title: 'Pay button', status: 'blocked' },
    ],
  },
]

describe('the lanes view', () => {
  it('shows the blocked column first', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getAllByRole('group').map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Checkout: Blocked',
      'Checkout: Open',
      'Checkout: In progress',
      'Checkout: Closed',
    ])
  })

  it('shows the heading of each status column in the colour of the status', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    expect(screen.getByText('Blocked').style.getPropertyValue('--tone')).toBe('var(--ctp-red)')
    expect(screen.getByText('Open').style.getPropertyValue('--tone')).toBe('var(--ctp-blue)')
  })
})
