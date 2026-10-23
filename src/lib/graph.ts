import type { Bead } from '../../shared/contract'
import { BLOCKS, targetOf, typeOfLink } from '@/lib/blockers'
import type { Link } from '@/lib/blockers'
import { byPriorityThenId } from '@/lib/filters'
import type { Lane } from '@/lib/filters'

export const NODE_WIDTH = 240

export const NODE_HEIGHT = 70

const COLUMN_GAP = 88

const ROW_GAP = 16

export type EdgeKind = 'blocks' | 'parent'

export type GraphEdge = { from: string; to: string; kind: EdgeKind }

export type PlacedNode<T extends Bead = Bead> = { bead: T; x: number; y: number; column: number }

export type Zone<T extends Bead = Bead> = {
  nodes: PlacedNode<T>[]
  edges: GraphEdge[]
  width: number
  height: number
}

export type Graph<T extends Bead = Bead> = { zones: Zone<T>[]; loose: T[] }

export function graphBeadsOf<T extends Bead>(lanes: Lane[], beads: T[]): T[] {
  const byId = new Map(beads.map((bead) => [bead.id, bead]))
  const shown = new Map<string, T>()
  for (const lane of lanes) {
    const epic = byId.get(lane.epic.id)
    if (epic) shown.set(epic.id, epic)
    for (const bead of lane.beads) {
      const known = byId.get(bead.id)
      if (known) shown.set(known.id, known)
    }
  }
  return [...shown.values()]
}

export function edgesOf(beads: Bead[]): GraphEdge[] {
  const ids = new Set(beads.map((bead) => bead.id))
  const edges = new Map<string, GraphEdge>()
  const add = (edge: GraphEdge) => {
    if (edge.from !== edge.to && ids.has(edge.from) && ids.has(edge.to)) edges.set(`${edge.from} ${edge.to}`, edge)
  }
  for (const bead of beads) {
    if (bead.parent) add({ from: bead.parent, to: bead.id, kind: 'parent' })
    for (const link of (bead.dependencies ?? []) as Link[]) {
      const target = targetOf(link)
      if (target && typeOfLink(link) === BLOCKS) add({ from: target, to: bead.id, kind: 'blocks' })
    }
  }
  return [...edges.values()]
}

function columnIndexes(ids: string[], incoming: Map<string, string[]>): Map<string, number> {
  const columns = new Map<string, number>()
  const visiting = new Set<string>()
  const visit = (id: string): number => {
    const known = columns.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return -1
    visiting.add(id)
    const column = Math.max(0, ...(incoming.get(id) ?? []).map((from) => visit(from) + 1))
    visiting.delete(id)
    columns.set(id, column)
    return column
  }
  ids.forEach(visit)
  return columns
}

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length

type Neighbours = Map<string, string[]>

function settle<T extends Bead>(column: T[], neighbours: Neighbours, slots: Map<string, number>): T[] {
  const targets = new Map(
    column.map((bead) => {
      const placed = (neighbours.get(bead.id) ?? []).flatMap((id) => (slots.has(id) ? [slots.get(id)!] : []))
      return [bead.id, mean(placed) ?? slots.get(bead.id)!]
    }),
  )
  const ordered = [...column].sort((a, b) => targets.get(a.id)! - targets.get(b.id)!)
  let floor = Number.NEGATIVE_INFINITY
  for (const bead of ordered) {
    const slot = Math.max(targets.get(bead.id)!, floor)
    slots.set(bead.id, slot)
    floor = slot + 1
  }
  return ordered
}

function groupsOf<T extends Bead>(sorted: T[], edges: GraphEdge[]): T[][] {
  const roots = new Map(sorted.map((bead) => [bead.id, bead.id]))
  const rootOf = (id: string): string => {
    const parent = roots.get(id)!
    if (parent === id) return id
    const root = rootOf(parent)
    roots.set(id, root)
    return root
  }
  for (const edge of edges) roots.set(rootOf(edge.from), rootOf(edge.to))
  const groups = new Map<string, T[]>()
  for (const bead of sorted) {
    const root = rootOf(bead.id)
    groups.set(root, [...(groups.get(root) ?? []), bead])
  }
  return [...groups.values()]
}

export function layoutGraph<T extends Bead>(beads: T[]): Graph<T> {
  const edges = edgesOf(beads)
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
  const sorted = [...beads].sort(byPriorityThenId)
  const groups = groupsOf(sorted.filter((bead) => linked.has(bead.id)), edges)
  return {
    zones: groups.map((group) => {
      const ids = new Set(group.map((bead) => bead.id))
      return layoutZone(group, edges.filter((edge) => ids.has(edge.from)))
    }),
    loose: sorted.filter((bead) => !linked.has(bead.id)),
  }
}

function layoutZone<T extends Bead>(sorted: T[], edges: GraphEdge[]): Zone<T> {
  const incoming: Neighbours = new Map()
  const outgoing: Neighbours = new Map()
  for (const edge of edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  const indexes = columnIndexes(sorted.map((bead) => bead.id), incoming)

  const columns: T[][] = []
  for (const bead of sorted) {
    const index = indexes.get(bead.id)
    if (index === undefined) continue
    columns[index] = [...(columns[index] ?? []), bead]
  }

  const slots = new Map<string, number>()
  columns.forEach((column) => column.forEach((bead, row) => slots.set(bead.id, row)))
  for (let index = 1; index < columns.length; index++) columns[index] = settle(columns[index], incoming, slots)
  for (let index = columns.length - 2; index >= 0; index--) columns[index] = settle(columns[index], outgoing, slots)

  const top = Math.min(...slots.values())
  const bottom = Math.max(...slots.values())
  const step = NODE_HEIGHT + ROW_GAP
  const nodes = columns.flatMap((column, index) =>
    column.map((bead) => ({
      bead,
      column: index,
      x: index * (NODE_WIDTH + COLUMN_GAP),
      y: (slots.get(bead.id)! - top) * step,
    })),
  )
  return {
    nodes,
    edges,
    width: Math.max(0, columns.length * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP),
    height: columns.length === 0 ? 0 : (bottom - top) * step + NODE_HEIGHT,
  }
}

export function edgePath(from: PlacedNode, to: PlacedNode): string {
  const startX = from.x + NODE_WIDTH
  const startY = from.y + NODE_HEIGHT / 2
  const endX = to.x
  const endY = to.y + NODE_HEIGHT / 2
  const bend = Math.max(COLUMN_GAP / 2, Math.abs(endX - startX) / 2)
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
}
