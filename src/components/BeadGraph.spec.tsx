import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { withBlockers } from '@/lib/blockers'
import { epicsOf, groupByParent, lanesOf } from '@/lib/filters'
import type { Bead } from '../../shared/contract'
import { BeadGraph } from './BeadGraph'

const blocks = (issue: string, target: string) => ({ issue_id: issue, depends_on_id: target, type: 'blocks' })

const beads = withBlockers([
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
  { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', dependencies: [blocks('t-2', 't-1')] },
  { id: 't-0', title: 'Mail server', status: 'closed', parent: 'e-1' },
  { id: 't-5', title: 'Receipt text', status: 'open', parent: 'e-1', dependencies: [blocks('t-5', 't-0')] },
  { id: 'e-2', title: 'Receipts', status: 'open', issue_type: 'epic', priority: 2 },
  { id: 't-3', title: 'Receipt mail', status: 'open', parent: 'e-2', dependencies: [blocks('t-3', 't-2')] },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
] as Bead[])

const groups = groupByParent(beads)

const lanes = lanesOf(epicsOf(beads, groups, 'all'), groups, [], { status: 'all', text: '', labels: [], type: null, priority: null }, beads)

const linkOf = (container: HTMLElement, from: string, to: string) =>
  container.querySelector(`path[data-from="${from}"][data-to="${to}"]`)

const cardsIn = (frame: string) =>
  within(screen.getByRole('group', { name: frame }))
    .getAllByRole('button')
    .map((button) => button.getAttribute('aria-label'))
    .sort()

describe('the bead graph', () => {
  it('shows each epic in its own frame, with the epic at the top and its children inside', () => {
    render(<BeadGraph lanes={lanes} beads={beads} onOpen={() => {}} />)
    expect(cardsIn('Checkout')).toEqual(['e-1 Checkout', 't-0 Mail server', 't-1 Cart total', 't-2 Pay button', 't-5 Receipt text'])
    expect(cardsIn('Receipts')).toEqual(['e-2 Receipts', 't-3 Receipt mail'])
    expect(cardsIn('No epic')).toEqual(['t-4 Fix the logo'])
  })

  it('draws a link between two epics from frame to frame, and not from card to card', () => {
    const { container } = render(<BeadGraph lanes={lanes} beads={beads} onOpen={() => {}} />)
    expect(linkOf(container, 'e-1', 'e-2')).not.toBeNull()
    expect(linkOf(container, 't-2', 't-3')).toBeNull()
  })

  it('shows in red a link to a blocker that is still open, and in grey a link to a closed blocker', () => {
    const { container } = render(<BeadGraph lanes={lanes} beads={beads} onOpen={() => {}} />)
    expect(linkOf(container, 't-1', 't-2')?.getAttribute('class')).toContain('stroke-destructive')
    expect(linkOf(container, 't-0', 't-5')?.getAttribute('class')).not.toContain('stroke-destructive')
    expect(linkOf(container, 'e-1', 'e-2')?.getAttribute('class')).toContain('stroke-destructive')
  })

  it('opens a bead when the user clicks its card, and an epic when the user clicks the top of its frame', async () => {
    const onOpen = vi.fn()
    render(<BeadGraph lanes={lanes} beads={beads} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 't-2 Pay button' }))
    await userEvent.click(screen.getByRole('button', { name: 'e-2 Receipts' }))
    expect(onOpen.mock.calls).toEqual([['t-2'], ['e-2']])
  })

  it('tells the user when no bead matches the filters', () => {
    render(<BeadGraph lanes={[]} beads={[]} onOpen={() => {}} />)
    expect(screen.getByText('No bead matches the filters.')).toBeInTheDocument()
  })
})
