import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { withBlockers } from '@/lib/blockers'
import type { Bead } from '../../shared/contract'
import { BeadGraph } from './BeadGraph'

const blocks = (issue: string, target: string) => ({ issue_id: issue, depends_on_id: target, type: 'blocks' })

const beads = withBlockers([
  { id: 't-1', title: 'Cart total', status: 'open' },
  { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
  { id: 't-3', title: 'Receipt mail', status: 'open', dependencies: [blocks('t-3', 't-0')] },
  { id: 't-0', title: 'Mail server', status: 'closed' },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
] as Bead[])

const linkOf = (container: HTMLElement, from: string, to: string) =>
  container.querySelector(`path[data-from="${from}"][data-to="${to}"]`)

describe('the bead graph', () => {
  it('shows the linked beads in the graph and the other beads apart', () => {
    render(<BeadGraph beads={beads} onOpen={() => {}} />)
    const graph = screen.getByRole('region', { name: 'Bead graph' })
    expect(within(graph).getAllByRole('button').map((node) => node.getAttribute('aria-label')).sort()).toEqual([
      't-0 Mail server',
      't-1 Cart total',
      't-2 Pay button',
      't-3 Receipt mail',
    ])
    const loose = screen.getByRole('region', { name: 'Beads with no link' })
    expect(within(loose).getAllByRole('button').map((node) => node.getAttribute('aria-label'))).toEqual(['t-4 Fix the logo'])
  })

  it('shows in red a link to a blocker that is still open, and in grey a link to a closed blocker', () => {
    const { container } = render(<BeadGraph beads={beads} onOpen={() => {}} />)
    expect(linkOf(container, 't-1', 't-2')?.getAttribute('class')).toContain('stroke-destructive')
    expect(linkOf(container, 't-0', 't-3')?.getAttribute('class')).not.toContain('stroke-destructive')
  })

  it('opens a bead when the user clicks it in the graph', async () => {
    const onOpen = vi.fn()
    render(<BeadGraph beads={beads} onOpen={onOpen} />)
    await userEvent.click(screen.getByRole('button', { name: 't-2 Pay button' }))
    expect(onOpen).toHaveBeenCalledWith('t-2')
  })

  it('tells the user when no bead matches the filters', () => {
    render(<BeadGraph beads={[]} onOpen={() => {}} />)
    expect(screen.getByText('No bead matches the filters.')).toBeInTheDocument()
  })
})
