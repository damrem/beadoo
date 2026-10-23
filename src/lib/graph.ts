import type { Bead } from '../../shared/contract'
import { BLOCKS, targetOf, typeOfLink } from '@/lib/blockers'
import type { Link } from '@/lib/blockers'
import { byPriorityThenId } from '@/lib/filters'
import type { Lane } from '@/lib/filters'

export const NODE_WIDTH = 240

export const NODE_HEIGHT = 70

export const FRAME_PADDING = 12

export const FRAME_HEADER = 44

const COLUMN_GAP = 88

const ROW_GAP = 16

const FRAME_COLUMN_GAP = 96

const FRAME_ROW_GAP = 24

export type EdgeKind = 'blocks' | 'parent'

export type GraphEdge = { from: string; to: string; kind: EdgeKind }

export type Box = { x: number; y: number; width: number; height: number }

export type PlacedNode<T extends Bead = Bead> = Box & { bead: T; column: number }

export type Zone<T extends Bead = Bead> = {
  nodes: PlacedNode<T>[]
  edges: GraphEdge[]
  width: number
  height: number
}

export type FrameEdge = GraphEdge & { links: GraphEdge[] }

export type Frame<T extends Bead = Bead> = Box & { id: string; title: string; epic?: T; zone: Zone<T> }

export type Graph<T extends Bead = Bead> = {
  frames: Frame<T>[]
  edges: FrameEdge[]
  apart: Frame<T>[]
  width: number
  height: number
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

type Neighbours = Map<string, string[]>

function neighboursOf(edges: GraphEdge[]): { incoming: Neighbours; outgoing: Neighbours } {
  const incoming: Neighbours = new Map()
  const outgoing: Neighbours = new Map()
  for (const edge of edges) {
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from])
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
  }
  return { incoming, outgoing }
}

function columnIndexes(ids: string[], incoming: Neighbours): Map<string, number> {
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

function columnsOf<T extends { id: string }>(items: T[], incoming: Neighbours): T[][] {
  const indexes = columnIndexes(items.map((item) => item.id), incoming)
  const columns: T[][] = []
  for (const item of items) {
    const index = indexes.get(item.id)!
    columns[index] = [...(columns[index] ?? []), item]
  }
  return columns
}

const mean = (values: number[]): number | undefined =>
  values.length === 0 ? undefined : values.reduce((sum, value) => sum + value, 0) / values.length

function settle<T extends { id: string }>(column: T[], neighbours: Neighbours, slots: Map<string, number>, spread: boolean): T[] {
  const targets = new Map(
    column.map((item) => {
      const placed = (neighbours.get(item.id) ?? []).flatMap((id) => (slots.has(id) ? [slots.get(id)!] : []))
      return [item.id, mean(placed) ?? slots.get(item.id)!]
    }),
  )
  const ordered = [...column].sort((a, b) => targets.get(a.id)! - targets.get(b.id)!)
  let floor = Number.NEGATIVE_INFINITY
  ordered.forEach((item, row) => {
    const slot = spread ? Math.max(targets.get(item.id)!, floor) : row
    slots.set(item.id, slot)
    floor = slot + 1
  })
  return ordered
}

function sweep<T extends { id: string }>(columns: T[][], edges: GraphEdge[], spread: boolean): Map<string, number> {
  const { incoming, outgoing } = neighboursOf(edges)
  const slots = new Map<string, number>()
  columns.forEach((column) => column.forEach((item, row) => slots.set(item.id, row)))
  for (let index = 1; index < columns.length; index++) columns[index] = settle(columns[index], incoming, slots, spread)
  for (let index = columns.length - 2; index >= 0; index--) columns[index] = settle(columns[index], outgoing, slots, spread)
  return slots
}

function layoutZone<T extends Bead>(sorted: T[], edges: GraphEdge[]): Zone<T> {
  const columns = columnsOf(sorted.map((bead) => ({ id: bead.id, bead })), neighboursOf(edges).incoming)
  const slots = sweep(columns, edges, true)
  const top = Math.min(...slots.values())
  const bottom = Math.max(...slots.values())
  const step = NODE_HEIGHT + ROW_GAP
  const nodes = columns.flatMap((column, index) =>
    column.map(({ id, bead }) => ({
      bead,
      column: index,
      x: index * (NODE_WIDTH + COLUMN_GAP),
      y: (slots.get(id)! - top) * step,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
  )
  return {
    nodes,
    edges,
    width: Math.max(0, columns.length * (NODE_WIDTH + COLUMN_GAP) - COLUMN_GAP),
    height: columns.length === 0 ? 0 : (bottom - top) * step + NODE_HEIGHT,
  }
}

function placeFrames<T extends Bead>(frames: Frame<T>[], edges: FrameEdge[]): Pick<Graph<T>, 'frames' | 'width' | 'height'> {
  const columns = columnsOf(frames, neighboursOf(edges).incoming)
  sweep(columns, edges, false)
  let x = 0
  const placed = columns.flatMap((column) => {
    let y = 0
    const frames = column.map((frame) => {
      const moved = { ...frame, x, y }
      y += frame.height + FRAME_ROW_GAP
      return moved
    })
    x += Math.max(...column.map((frame) => frame.width)) + FRAME_COLUMN_GAP
    return frames
  })
  return {
    frames: placed,
    width: Math.max(0, x - FRAME_COLUMN_GAP),
    height: Math.max(0, ...placed.map((frame) => frame.y + frame.height)),
  }
}

export function layoutGraph<T extends Bead>(lanes: Lane[], beads: T[]): Graph<T> {
  const byId = new Map(beads.map((bead) => [bead.id, bead]))
  const frameIds = new Set(lanes.map((lane) => lane.epic.id))
  const frameOf = new Map(lanes.map((lane) => [lane.epic.id, lane.epic.id]))
  const members = lanes.map((lane) => {
    const children = lane.beads
      .flatMap((bead) => (byId.has(bead.id) && !frameIds.has(bead.id) ? [byId.get(bead.id)!] : []))
      .sort(byPriorityThenId)
    for (const child of children) frameOf.set(child.id, lane.epic.id)
    return { lane, epic: byId.get(lane.epic.id), children }
  })

  const shown = members.flatMap(({ epic, children }) => (epic ? [epic, ...children] : children))
  const inner: GraphEdge[] = []
  const between = new Map<string, FrameEdge>()
  for (const edge of edgesOf(shown)) {
    const from = frameOf.get(edge.from)!
    const to = frameOf.get(edge.to)!
    if (from === to) {
      if (!frameIds.has(edge.from) && !frameIds.has(edge.to)) inner.push(edge)
      continue
    }
    const known = between.get(`${from} ${to}`)
    between.set(`${from} ${to}`, {
      from,
      to,
      kind: known?.kind === BLOCKS || edge.kind === BLOCKS ? 'blocks' : 'parent',
      links: [...(known?.links ?? []), edge],
    })
  }

  const frames = members.map(({ lane, epic, children }) => {
    const ids = new Set(children.map((child) => child.id))
    const zone = layoutZone(children, inner.filter((edge) => ids.has(edge.from)))
    return {
      id: lane.epic.id,
      title: lane.epic.title,
      epic,
      zone,
      x: 0,
      y: 0,
      width: Math.max(zone.width, NODE_WIDTH) + 2 * FRAME_PADDING,
      height: FRAME_HEADER + zone.height + 2 * FRAME_PADDING,
    }
  })

  const edges = [...between.values()]
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
  return {
    ...placeFrames(frames.filter((frame) => linked.has(frame.id)), edges),
    edges,
    apart: frames.filter((frame) => !linked.has(frame.id)),
  }
}

export function edgePath(from: Box, to: Box): string {
  const startX = from.x + from.width
  const startY = from.y + from.height / 2
  const endX = to.x
  const endY = to.y + to.height / 2
  const bend = Math.max(COLUMN_GAP / 2, Math.abs(endX - startX) / 2)
  return `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`
}
