import { render, screen, within } from '@testing-library/react'
import { BeadCard } from './BeadCard'
import type { Bead } from '../../shared/contract'

const toneOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--tone')

const show = (bead: Partial<Bead>) =>
  render(<BeadCard bead={{ id: 'b-1', title: 'Fix the cart', status: 'blocked', ...bead }} onOpen={() => {}} />)

describe('the card of a bead', () => {
  it('shows the status of the bead as a coloured dot', () => {
    show({})
    expect(toneOf(screen.getByTitle('Blocked'))).toBe('var(--ctp-red)')
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
    show({ labels: ['repo:.claude'] })
    const chip = screen.getByTitle('repo:.claude')
    expect(within(chip).getByText('repo')).toBeInTheDocument()
    expect(within(chip).getByText('.claude')).toHaveClass('font-semibold')
    expect(within(chip).queryByText('repo:.claude')).not.toBeInTheDocument()
  })

  it('shows a wave for a handoff bead', () => {
    show({ labels: ['handoff'] })
    expect(screen.getByTitle('handoff')).toHaveTextContent('👋handoff')
  })
})
