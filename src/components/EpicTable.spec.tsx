import { render, screen, within } from '@testing-library/react'
import { EpicTable } from './EpicTable'

const toneOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--tone')

const lanes = [
  {
    epic: { id: 'e-1', title: 'Checkout', status: 'open', counts: { blocked: 1 } },
    beads: [{ id: 'b-1', title: 'Pay button', status: 'blocked', priority: 1, labels: ['front', 'complexity:0'] }],
  },
]

describe('the table of the beads', () => {
  it('shows the status of each bead with its emoji and a dot in the colour of the status', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    const row = screen.getByRole('button', { name: 'b-1 Pay button' }).closest('tr')!
    const status = within(row).getByText('Blocked')
    expect(toneOf(status.querySelector('[aria-hidden="true"]'))).toBe('var(--ctp-red)')
    expect(status).toHaveTextContent('⛔Blocked')
  })

  it('shows the priority and each label in a coloured chip, with the full label text as a hint', () => {
    render(<EpicTable lanes={lanes} onOpen={() => {}} />)
    expect(toneOf(screen.getByText('P1'))).toBe('var(--ctp-peach)')
    expect(toneOf(screen.getByTitle('complexity:0'))).toBe('var(--ctp-teal)')
    expect(toneOf(screen.getByTitle('front'))).toMatch(/^var\(--ctp-/)
  })
})
