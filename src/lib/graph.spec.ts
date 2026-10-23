import type { Bead } from '../../shared/contract'
import { epicsOf, groupByParent, lanesOf } from '@/lib/filters'
import type { BeadFilter } from '@/lib/filters'
import { edgesOf, layoutGraph, NODE_HEIGHT } from '@/lib/graph'
import type { Box } from '@/lib/graph'

const blocks = (issue: string, target: string) =>
  ({ issue_id: issue, depends_on_id: target, type: 'blocks' }) as unknown as NonNullable<Bead['dependencies']>[number]

const graphOf = (beads: Bead[]) => {
  const groups = groupByParent(beads)
  const filter: BeadFilter = { status: 'all', text: '', labels: [], type: null, priority: null }
  return layoutGraph(lanesOf(epicsOf(beads, groups, 'all'), groups, [], filter, beads), beads)
}

const framesOf = (beads: Bead[]) => {
  const graph = graphOf(beads)
  return [...graph.frames, ...graph.apart]
}

const frameOf = (beads: Bead[], id: string) => framesOf(beads).find((frame) => frame.id === id)!

const cardsOf = (beads: Bead[], id: string) => frameOf(beads, id).zone.nodes.map((node) => node.bead.id)

const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const checkout = [
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
  { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', dependencies: [blocks('t-2', 't-1')] },
]

describe('the links of the bead graph', () => {
  it('links a blocker to the bead that waits on it', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(edgesOf(beads)).toEqual([{ from: 't-1', to: 't-2', kind: 'blocks' }])
  })

  it('links an epic to each of its children', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
    ]
    expect(edgesOf(beads)).toEqual([{ from: 'e-1', to: 't-1', kind: 'parent' }])
  })

  it('shows no link to a bead that the filters hide', () => {
    const beads = [{ id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', dependencies: [blocks('t-2', 't-1')] }] as Bead[]
    expect(edgesOf(beads)).toEqual([])
  })
})

describe('the frames of the bead graph', () => {
  it('shows each epic as a frame that holds the cards of its children', () => {
    const beads = [
      ...checkout,
      { id: 'e-2', title: 'Search', status: 'open', issue_type: 'epic', priority: 2 },
      { id: 't-3', title: 'Search box', status: 'open', parent: 'e-2' },
    ] as Bead[]
    expect(framesOf(beads).map((frame) => [frame.id, frame.zone.nodes.map((node) => node.bead.id).sort()])).toEqual([
      ['e-1', ['t-1', 't-2']],
      ['e-2', ['t-3']],
    ])
  })

  it('shows the beads with no epic in their own frame', () => {
    const beads = [...checkout, { id: 't-4', title: 'Fix the logo', status: 'open' }] as Bead[]
    expect(frameOf(beads, 'none').title).toBe('No epic')
    expect(cardsOf(beads, 'none')).toEqual(['t-4'])
  })

  it('links two cards of the same epic inside its frame', () => {
    expect(frameOf(checkout as Bead[], 'e-1').zone.edges).toEqual([{ from: 't-1', to: 't-2', kind: 'blocks' }])
  })

  it('shows each card to the right of the cards that block it in the same epic', () => {
    const columns = new Map(frameOf(checkout as Bead[], 'e-1').zone.nodes.map((node) => [node.bead.id, node.column]))
    expect([columns.get('t-1'), columns.get('t-2')]).toEqual([0, 1])
  })

  it('links two frames when a bead of one epic blocks a bead of another epic', () => {
    const beads = [
      ...checkout,
      { id: 'e-2', title: 'Receipts', status: 'open', issue_type: 'epic', priority: 2 },
      { id: 't-3', title: 'Receipt mail', status: 'open', parent: 'e-2', dependencies: [blocks('t-3', 't-2')] },
    ] as Bead[]
    const graph = graphOf(beads)
    expect(graph.edges.map(({ from, to, kind }) => ({ from, to, kind }))).toEqual([{ from: 'e-1', to: 'e-2', kind: 'blocks' }])
    expect(frameOf(beads, 'e-1').zone.edges).toEqual([{ from: 't-1', to: 't-2', kind: 'blocks' }])
  })

  it('links a parent epic to its sub-epic between their frames, and shows no card for the sub-epic', () => {
    const beads = [
      ...checkout,
      { id: 'e-1.1', title: 'Payment', status: 'open', issue_type: 'epic', parent: 'e-1' },
      { id: 't-3', title: 'Card form', status: 'open', parent: 'e-1.1' },
    ] as Bead[]
    expect(graphOf(beads).edges.map(({ from, to, kind }) => ({ from, to, kind }))).toEqual([
      { from: 'e-1', to: 'e-1.1', kind: 'parent' },
    ])
    expect(cardsOf(beads, 'e-1')).not.toContain('e-1.1')
    expect(cardsOf(beads, 'e-1.1')).toEqual(['t-3'])
  })

  it('shows a frame to the right of the frames that block it', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
      { id: 'e-2', title: 'Receipts', status: 'open', issue_type: 'epic', priority: 0, dependencies: [blocks('e-2', 'e-1')] },
    ] as Bead[]
    expect(frameOf(beads, 'e-2').x).toBeGreaterThan(frameOf(beads, 'e-1').x + frameOf(beads, 'e-1').width)
  })

  it('shows the frames with no link to another frame apart', () => {
    const beads = [
      ...checkout,
      { id: 'e-2', title: 'Search', status: 'open', issue_type: 'epic', priority: 2 },
      { id: 't-3', title: 'Search box', status: 'open', parent: 'e-2' },
    ] as Bead[]
    const graph = graphOf(beads)
    expect(graph.frames).toEqual([])
    expect(graph.apart.map((frame) => frame.id)).toEqual(['e-1', 'e-2'])
  })

  it('shows all the frames of a dependency cycle, with no overlap', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', dependencies: [blocks('e-1', 'e-2')] },
      { id: 'e-2', title: 'Receipts', status: 'open', issue_type: 'epic', dependencies: [blocks('e-2', 'e-1')] },
      { id: 'e-3', title: 'Search', status: 'open', issue_type: 'epic', dependencies: [blocks('e-3', 'e-1')] },
    ] as Bead[]
    const frames = graphOf(beads).frames
    expect(frames.map((frame) => frame.id).sort()).toEqual(['e-1', 'e-2', 'e-3'])
    for (const a of frames) for (const b of frames) if (a !== b) expect(overlap(a, b)).toBe(false)
  })
})

describe('the cards inside a frame', () => {
  it('puts no two cards at the same place', () => {
    const beads = [
      ...checkout,
      { id: 't-3', title: 'Receipt mail', status: 'open', parent: 'e-1', dependencies: [blocks('t-3', 't-1')] },
      { id: 't-4', title: 'Fix the logo', status: 'open', parent: 'e-1' },
    ] as Bead[]
    const nodes = frameOf(beads, 'e-1').zone.nodes
    for (const a of nodes) for (const b of nodes) if (a !== b) expect(overlap(a, b)).toBe(false)
  })

  it('leaves no empty band at the top of a frame', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1', priority: 0 },
      { id: 't-2', title: 'Tax rules', status: 'open', parent: 'e-1', priority: 1 },
      { id: 't-3', title: 'Pay button', status: 'open', parent: 'e-1', dependencies: [blocks('t-3', 't-1'), blocks('t-3', 't-2')] },
      { id: 't-4', title: 'Receipt mail', status: 'open', parent: 'e-1', dependencies: [blocks('t-4', 't-2')] },
    ] as Bead[]
    const { zone } = frameOf(beads, 'e-1')
    expect(Math.min(...zone.nodes.map((node) => node.y))).toBe(0)
    expect(Math.max(...zone.nodes.map((node) => node.y + NODE_HEIGHT))).toBe(zone.height)
  })
})
