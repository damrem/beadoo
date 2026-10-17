import { render, screen } from '@testing-library/react'
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

  it('shows the priority in its colour', () => {
    show({ priority: 0 })
    expect(toneOf(screen.getByText('P0'))).toBe('var(--ctp-red)')
  })

  it('shows each label with its text unchanged, in a colour', () => {
    show({ labels: ['complexity:4', 'front'] })
    expect(toneOf(screen.getByText('complexity:4'))).toBe('var(--ctp-mauve)')
    expect(toneOf(screen.getByText('front'))).toMatch(/^var\(--ctp-/)
  })
})
