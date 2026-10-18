import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('opens the epic when the user clicks the button in the lane header', async () => {
    const onOpen = vi.fn()
    render(<EpicLanes lanes={lanes} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open the epic Checkout' }))
    expect(onOpen).toHaveBeenCalledWith('e-1')
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

  it.each([
    [1, ['blocked'], '14rem repeat(1, minmax(14rem, 1fr))', '28rem'],
    [2, ['in_progress', 'blocked'], '14rem repeat(2, minmax(14rem, 1fr))', '42rem'],
    [4, 'all', '14rem repeat(4, minmax(14rem, 1fr))', '70rem'],
  ] as const)(
    'shares the free width between %i status columns, and keeps a minimum width for each column',
    (_count, status, columns, minWidth) => {
      const shown = status === 'all' ? lanes : [{ ...lanes[0], beads: lanes[0].beads.filter((bead) => bead.status === 'blocked') }]
      render(<EpicLanes lanes={shown} status={status === 'all' ? status : [...status]} onOpen={() => {}} />)
      const lane = screen.getByRole('region', { name: 'Checkout' })
      expect(lane.style.gridTemplateColumns).toBe(columns)
      expect(lane.parentElement?.style.minWidth).toBe(minWidth)
      expect(lane.parentElement).not.toHaveClass('w-max')
    },
  )

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

  it('shows a bar and the count of the closed children over all the children of the epic', () => {
    render(<EpicLanes lanes={[{ ...lanes[0], epic: { ...lanes[0].epic, counts: { open: 2, blocked: 2, closed: 13 } } }]} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    const bar = within(lane).getByRole('progressbar', { name: 'Checkout: 13/17 children closed' })
    expect(bar).toHaveAttribute('aria-valuenow', '13')
    expect(bar).toHaveAttribute('aria-valuemax', '17')
    expect(within(lane).getByText('13/17')).toBeInTheDocument()
  })

  it('warns that an open epic can close when all its children are closed', () => {
    render(<EpicLanes lanes={[{ ...lanes[0], epic: { ...lanes[0].epic, counts: { closed: 1 } } }]} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getByRole('note', { name: 'All the children are closed, so the epic can close.' })).toHaveTextContent('⚠️can close')
  })

  it('warns that a closed epic still has an open child', () => {
    render(<EpicLanes lanes={[{ ...lanes[0], epic: { ...lanes[0].epic, status: 'closed', counts: { open: 1 } } }]} onOpen={() => {}} />)
    const lane = screen.getByRole('region', { name: 'Checkout' })
    expect(within(lane).getByRole('note', { name: 'The epic is closed, but a child is still open.' })).toHaveTextContent('⚠️open child')
  })

  it('shows no warning on an epic whose status agrees with its children', () => {
    render(<EpicLanes lanes={lanes} onOpen={() => {}} />)
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('shows no progress bar on the lane of the beads that have no epic', () => {
    render(<EpicLanes lanes={[{ ...lanes[0], epic: { ...lanes[0].epic, id: 'none', title: 'No epic' } }]} onOpen={() => {}} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the actions of each bead on its card, and a click on an action does not open the bead', async () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(<EpicLanes lanes={lanes} onOpen={onOpen} cardActions={(bead) => <button onClick={() => onAction(bead.id)}>Spawn {bead.id}</button>} />)
    const cell = screen.getByRole('group', { name: 'Checkout: Blocked' })
    await userEvent.click(within(cell).getByRole('button', { name: 'Spawn b-2' }))
    expect(onAction).toHaveBeenCalledWith('b-2')
    expect(onOpen).not.toHaveBeenCalled()
  })
})
