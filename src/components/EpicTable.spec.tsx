import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EpicTable } from './EpicTable'

const toneOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--tone')

const lanes = [
  {
    epic: { id: 'e-1', title: 'Checkout', status: 'open', counts: { blocked: 1 }, labels: ['repo:shop', 'front'] },
    beads: [{ id: 'b-1', title: 'Pay button', status: 'blocked', priority: 1, labels: ['front', 'complexity:0'] }],
  },
]

describe('the table of the beads', () => {
  it('shows the status of each bead with its emoji and no coloured dot', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: 'b-1 Pay button' }).closest('tr')!
    const status = within(row).getByText('Blocked')
    expect(status.querySelector('.tone-dot')).toBeNull()
    expect(status).toHaveTextContent('⛔Blocked')
  })

  it('shows the priority and each label in a coloured chip, with the full label text as a hint', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: 'b-1 Pay button' }).closest('tr')!
    expect(toneOf(within(row).getByText('P1'))).toBe('var(--ctp-peach)')
    expect(toneOf(within(row).getByTitle('complexity:0'))).toBe('var(--ctp-teal)')
    expect(toneOf(within(row).getByTitle('front'))).toMatch(/^var\(--ctp-/)
  })

  it('shows the labels of the epic and of its children in the epic row, each one time', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    const epicRow = screen.getByRole('rowheader', { name: /Checkout/ })
    expect(Array.from(epicRow.querySelectorAll<HTMLElement>('.tone-chip[title]'), (chip) => chip.title)).toEqual(['repo:shop', 'front'])
    expect(within(epicRow).getByText('shop')).toHaveClass('font-semibold')
  })

  it('shows the actions of each bead in an actions column, and a click on an action does not open the bead', async () => {
    const onOpen = vi.fn()
    const onAction = vi.fn()
    render(<EpicTable lanes={lanes} onOpen={onOpen} cardActions={(bead) => <button onClick={() => onAction(bead.id)}>Claim {bead.id}</button>} />)
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getByRole('rowheader', { name: /Checkout/ })).toHaveAttribute('colspan', '7')
    await userEvent.click(screen.getByRole('button', { name: 'Claim b-1' }))
    expect(onAction).toHaveBeenCalledWith('b-1')
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('shows no actions column when the page gives no action', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })
})
