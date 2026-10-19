import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeadCard } from './BeadCard'
import type { BoardBead } from '@/lib/blockers'

const toneOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--tone')

const show = (bead: Partial<BoardBead>) =>
  render(<BeadCard bead={{ id: 'b-1', title: 'Fix the cart', status: 'blocked', ...bead }} onOpen={() => {}} />)

describe('the card of a bead', () => {
  it('shows the status of the bead as its emoji, with the status name on hover', () => {
    const { container } = show({})
    expect(screen.getByTitle('Blocked')).toHaveTextContent('⛔')
    expect(container.querySelector('.tone-dot')).toBeNull()
  })

  it('gives the card the border colour and the header pattern of its type', () => {
    const { container } = show({ issue_type: 'epic' })
    const card = container.querySelector('[data-type="epic"]')
    expect(toneOf(card)).toBe('var(--ctp-mauve)')
    expect(card?.querySelector('[data-pattern="stripes"]')).toHaveClass('pattern-stripes', 'tone-tint')
  })

  it('shows the id without the project prefix and gives the full id on hover', () => {
    show({ id: 'claude-258.1' })
    expect(screen.getByText('258.1')).toHaveAttribute('title', 'claude-258.1')
  })

  it('shows the type of the bead with its emoji', () => {
    show({ issue_type: 'bug' })
    expect(screen.getByText('bug')).toHaveTextContent('🐛bug')
  })

  it('shows the priority in its colour', () => {
    show({ priority: 0 })
    expect(toneOf(screen.getByText('P0'))).toBe('var(--ctp-red)')
  })

  it('shows each label in a colour, with its full text as a hint', () => {
    show({ labels: ['complexity:4', 'front'] })
    expect(toneOf(screen.getByTitle('complexity:4'))).toBe('var(--ctp-mauve)')
    expect(toneOf(screen.getByTitle('front'))).toMatch(/^var\(--ctp-/)
    expect(screen.getByTitle('front')).toHaveTextContent(/^front$/)
  })

  it('shows a label with a colon as a property, with the name and the value apart', () => {
    show({ labels: ['repo:.team'] })
    const chip = screen.getByTitle('repo:.team')
    expect(within(chip).getByText('repo')).toBeInTheDocument()
    expect(within(chip).getByText('.team')).toHaveClass('font-semibold')
    expect(within(chip).queryByText('repo:.team')).not.toBeInTheDocument()
  })

  it('shows a wave for a handoff bead', () => {
    show({ labels: ['handoff'] })
    expect(screen.getByTitle('handoff')).toHaveTextContent('👋handoff')
  })
  it('shows how many open beads the bead waits on, and their ids', () => {
    show({ status: 'open', blockers: ['claude-0fo.3', 'claude-0fo.5'] })
    const waits = screen.getByText(/waits on 2/)
    expect(waits).toHaveTextContent('waits on 2: 0fo.3, 0fo.5')
    expect(waits).toHaveAttribute('title', 'claude-0fo.3, claude-0fo.5')
  })

  it('shows no wait line for a bead with no open blocker', () => {
    show({ status: 'open' })
    expect(screen.queryByText(/waits on/)).not.toBeInTheDocument()
  })
  it('marks a ready bead, so the user sees that it can start now', () => {
    show({ status: 'open', ready: true })
    expect(screen.getByText('ready')).toHaveAttribute('title', 'No open blocker: the bead can start now')
  })

  it('shows no ready mark on a bead that is not ready', () => {
    show({ status: 'open' })
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
  })

  it('shows the actions of the bead on the card, and a click on an action does not open the bead', async () => {
    const onOpen = vi.fn()
    const onClaim = vi.fn()
    render(
      <BeadCard
        bead={{ id: 'b-1', title: 'Fix the cart', status: 'open' }}
        onOpen={onOpen}
        actions={<button onClick={onClaim}>Claim</button>}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Claim' }))
    expect(onClaim).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'b-1 Fix the cart' }))
    expect(onOpen).toHaveBeenCalledWith('b-1')
  })

  it('shows no action row on a card with no action', () => {
    show({ status: 'open' })
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
