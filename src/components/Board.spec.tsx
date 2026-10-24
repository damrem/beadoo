import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Board } from './Board'
import { anyOf, READY_ONLY } from '@/lib/filters'

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
    render(<Board beads={beads.slice(0, 1)} status={READY_ONLY} onOpen={() => {}} />)
    expect(screen.getAllByRole('region').map((column) => column.getAttribute('aria-label'))).toEqual(['Open'])
  })

  it('shows only the columns of the statuses that the user selected', () => {
    render(<Board beads={beads.slice(1)} status={anyOf('in_progress', 'blocked')} onOpen={() => {}} />)
    expect(screen.getAllByRole('region').map((column) => column.getAttribute('aria-label'))).toEqual(['Blocked', 'In progress'])
  })

  it('shows each column in the colour of its status', () => {
    render(<Board beads={beads} onOpen={() => {}} />)
    expect(screen.getByRole('region', { name: 'Blocked' }).style.getPropertyValue('--tone')).toBe('var(--ctp-red)')
    expect(screen.getByRole('region', { name: 'Open' }).style.getPropertyValue('--tone')).toBe('var(--ctp-blue)')
  })

  it('shows the actions of each bead on its card, and a click on an action does not open the bead', async () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(
      <Board
        beads={beads}
        onOpen={onOpen}
        cardActions={(bead) => (bead.status === 'open' ? <button onClick={() => onAction(bead.id)}>Claim {bead.id}</button> : null)}
      />,
    )
    await userEvent.click(within(screen.getByRole('region', { name: 'Open' })).getByRole('button', { name: 'Claim b-1' }))
    expect(onAction).toHaveBeenCalledWith('b-1')
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Claim b-3' })).not.toBeInTheDocument()
  })
})
