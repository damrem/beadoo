import { render, screen, within } from '@testing-library/react'
import { EpicLanes } from './EpicLanes'

const lanes = [
  {
    epic: { id: 'e-1', title: 'Checkout', status: 'open', counts: { open: 1, blocked: 1 }, labels: ['repo:shop', 'handoff'] },
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

  it('shows only the open column when the user shows the ready beads', () => {
    render(<EpicLanes lanes={[{ ...lanes[0], beads: lanes[0].beads.slice(0, 1) }]} status="ready" onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getAllByRole('group').map((cell) => cell.getAttribute('aria-label'))).toEqual(['Checkout: Open'])
  })

  it('shows only the columns of the statuses that the user selected', () => {
    render(<EpicLanes lanes={lanes} status={['open', 'blocked']} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getAllByRole('group').map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Checkout: Blocked',
      'Checkout: Open',
    ])
  })

  it('shows the heading of each status column in the colour of the status', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    expect(screen.getByText('Blocked').style.getPropertyValue('--tone')).toBe('var(--ctp-red)')
    expect(screen.getByText('Open').style.getPropertyValue('--tone')).toBe('var(--ctp-blue)')
  })

  it('shows the emoji of each status in the heading of its column', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    expect(screen.getByText('Blocked')).toHaveTextContent('⛔Blocked')
    expect(screen.getByText('Closed')).toHaveTextContent('✅Closed')
  })

  it('shows the labels of the epic and of its children in the epic column', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getByTitle('repo:shop')).toBeInTheDocument()
    expect(within(lane).getByTitle('handoff')).toHaveTextContent('👋handoff')
  })
})
