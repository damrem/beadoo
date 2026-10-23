import type { Bead } from '../../shared/contract'
import { edgesOf, graphBeadsOf, layoutGraph, NODE_HEIGHT } from '@/lib/graph'
import type { Lane } from '@/lib/filters'

const blocks = (issue: string, target: string) =>
  ({ issue_id: issue, depends_on_id: target, type: 'blocks' }) as unknown as NonNullable<Bead['dependencies']>[number]

const nodesOf = (beads: Bead[]) => layoutGraph(beads).zones.flatMap((zone) => zone.nodes)

const columnOf = (beads: Bead[], id: string) => nodesOf(beads).find((node) => node.bead.id === id)?.column

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

describe('the layout of the bead graph', () => {
  it('shows each bead to the right of the beads that block it', () => {
    const beads = [
      { id: 't-3', title: 'Receipt mail', status: 'open', dependencies: [blocks('t-3', 't-2')] },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
      { id: 't-1', title: 'Cart total', status: 'open' },
    ] as Bead[]
    expect(['t-1', 't-2', 't-3'].map((id) => columnOf(beads, id))).toEqual([0, 1, 2])
  })

  it('shows the beads with no link apart from the graph', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
      { id: 't-4', title: 'Fix the logo', status: 'open' },
    ] as Bead[]
    const graph = layoutGraph(beads)
    expect(graph.zones.flatMap((zone) => zone.nodes).map((node) => node.bead.id)).toEqual(['t-1', 't-2'])
    expect(graph.loose.map((bead) => bead.id)).toEqual(['t-4'])
  })

  it('shows all the beads of a dependency cycle', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open', dependencies: [blocks('t-1', 't-2')] },
      { id: 't-2', title: 'Pay button', status: 'open', dependencies: [blocks('t-2', 't-1')] },
    ] as Bead[]
    expect(nodesOf(beads).map((node) => node.bead.id).sort()).toEqual(['t-1', 't-2'])
  })

  it('shows each epic at the middle height of its children', () => {
    const beads = [
      { id: 'e-1', title: 'Search', status: 'open', issue_type: 'epic', priority: 0 },
      { id: 'e-2', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
      { id: 't-1', title: 'Search box', status: 'open', parent: 'e-1' },
      { id: 't-2', title: 'Cart total', status: 'open', parent: 'e-2' },
      { id: 't-3', title: 'Pay button', status: 'open', parent: 'e-2' },
      { id: 't-4', title: 'Receipt mail', status: 'open', parent: 'e-2' },
    ] as Bead[]
    const heights = new Map(nodesOf(beads).map((node) => [node.bead.id, node.y]))
    expect(heights.get('e-1')).toBe(heights.get('t-1'))
    expect(heights.get('e-2')).toBe(heights.get('t-3'))
  })

  it('puts no two beads at the same place', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
      { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1' },
      { id: 't-3', title: 'Receipt mail', status: 'open', parent: 'e-1', dependencies: [blocks('t-3', 't-2')] },
    ] as Bead[]
    const places = nodesOf(beads).map((node) => `${node.x},${node.y}`)
    expect(new Set(places).size).toBe(places.length)
  })

  it('shows each group of linked beads in its own zone', () => {
    const beads = [
      { id: 'e-1', title: 'Search', status: 'open', issue_type: 'epic', priority: 0 },
      { id: 't-1', title: 'Search box', status: 'open', parent: 'e-1' },
      { id: 't-2', title: 'Cart total', status: 'open', priority: 1 },
      { id: 't-3', title: 'Pay button', status: 'open', dependencies: [blocks('t-3', 't-2')] },
      { id: 't-4', title: 'Receipt mail', status: 'open', dependencies: [blocks('t-4', 't-3')] },
    ] as Bead[]
    const zones = layoutGraph(beads).zones
    expect(zones.map((zone) => zone.nodes.map((node) => node.bead.id).sort())).toEqual([
      ['e-1', 't-1'],
      ['t-2', 't-3', 't-4'],
    ])
    expect(zones.map((zone) => zone.nodes.find((node) => node.column === 0)?.bead.id)).toEqual(['e-1', 't-2'])
  })

  it('shows no parent link from the root bead of a zone, and keeps the deeper parent links', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 'e-1.1', title: 'Payment', status: 'open', issue_type: 'epic', parent: 'e-1' },
      { id: 't-1', title: 'Pay button', status: 'open', parent: 'e-1.1' },
      { id: 't-2', title: 'Cart total', status: 'open', parent: 'e-1' },
    ] as Bead[]
    const [zone] = layoutGraph(beads).zones
    expect(zone.edges).toEqual([{ from: 'e-1.1', to: 't-1', kind: 'parent' }])
    expect(zone.nodes.find((node) => node.bead.id === 'e-1')?.column).toBe(0)
    expect(zone.nodes.find((node) => node.bead.id === 't-2')?.column).toBe(1)
  })

  it('leaves no empty band at the top of a zone', () => {
    const beads = [
      { id: 't-1', title: 'Cart total', status: 'open', priority: 0 },
      { id: 't-2', title: 'Tax rules', status: 'open', priority: 1 },
      { id: 't-3', title: 'Pay button', status: 'open', dependencies: [blocks('t-3', 't-1'), blocks('t-3', 't-2')] },
      { id: 't-4', title: 'Receipt mail', status: 'open', dependencies: [blocks('t-4', 't-2')] },
    ] as Bead[]
    for (const zone of layoutGraph(beads).zones) {
      expect(Math.min(...zone.nodes.map((node) => node.y))).toBe(0)
      expect(Math.max(...zone.nodes.map((node) => node.y + NODE_HEIGHT))).toBe(zone.height)
    }
  })
})

describe('the beads that the graph shows', () => {
  it('shows the beads that pass the filters and their epics', () => {
    const beads = [
      { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
      { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1' },
      { id: 't-2', title: 'Pay button', status: 'closed', parent: 'e-1' },
    ]
    const lanes = [
      { epic: { id: 'e-1', title: 'Checkout', status: 'open', counts: {}, labels: [] }, beads: [beads[1]] },
    ] as Lane[]
    expect(graphBeadsOf(lanes, beads).map((bead) => bead.id)).toEqual(['e-1', 't-1'])
  })
})
