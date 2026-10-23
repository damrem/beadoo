import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { BeadId } from '@/components/BeadId'
import { Tag } from '@/components/BeadCard'
import { Emoji } from '@/components/Emoji'
import { NoMatch } from '@/components/NoMatch'
import type { BoardBead } from '@/lib/blockers'
import { statusEmoji } from '@/lib/emojis'
import { statusTitle } from '@/lib/filters'
import type { Lane } from '@/lib/filters'
import { edgePath, FRAME_HEADER, FRAME_PADDING, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from '@/lib/graph'
import type { Box, Frame, GraphEdge } from '@/lib/graph'
import { NEUTRAL, priorityTone, toneStyle, typeStyle } from '@/lib/tones'
import { cn } from '@/lib/utils'

const OPEN_MARKER = 'graph-arrow-open'

const DONE_MARKER = 'graph-arrow-done'

type IsOpen = (edge: GraphEdge) => boolean

function StatusAndId({ bead }: { bead: BoardBead }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-mono text-xs">
      <span title={statusTitle(bead.status)}>
        <Emoji emoji={statusEmoji(bead.status)} />
      </span>
      <BeadId id={bead.id} />
      {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
    </span>
  )
}

function GraphNode({ bead, onOpen, style }: { bead: BoardBead; onOpen: (id: string) => void; style?: CSSProperties }) {
  return (
    <button
      type="button"
      aria-label={`${bead.id} ${bead.title}`}
      onClick={() => onOpen(bead.id)}
      className={cn(
        'flex flex-col gap-1 overflow-hidden rounded-lg border bg-card px-2 py-1.5 text-left ring-2 ring-(color:--tone)/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        bead.status === 'closed' && 'opacity-60',
      )}
      style={{ ...toneStyle(typeStyle(bead.issue_type).tone), width: NODE_WIDTH, height: NODE_HEIGHT, ...style }}
    >
      <StatusAndId bead={bead} />
      <span className="line-clamp-2 text-xs leading-snug">{bead.title}</span>
    </button>
  )
}

function Arrow({ edge, from, to, open }: { edge: GraphEdge; from: Box; to: Box; open: boolean }) {
  return (
    <path
      data-from={edge.from}
      data-to={edge.to}
      data-kind={edge.kind}
      d={edgePath(from, to)}
      strokeWidth={1.5}
      strokeDasharray={edge.kind === 'parent' ? '4 4' : undefined}
      markerEnd={`url(#${open ? OPEN_MARKER : DONE_MARKER})`}
      className={cn('fill-none', open ? 'stroke-destructive' : 'stroke-muted-foreground/60')}
    />
  )
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="24" height="6" className="stroke-destructive">
          <line x1="0" y1="3" x2="24" y2="3" strokeWidth={1.5} />
        </svg>
        blocks, still open
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="24" height="6" className="stroke-muted-foreground/60">
          <line x1="0" y1="3" x2="24" y2="3" strokeWidth={1.5} />
        </svg>
        blocks, blocker closed
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden="true" width="24" height="6" className="stroke-muted-foreground/60">
          <line x1="0" y1="3" x2="24" y2="3" strokeWidth={1.5} strokeDasharray="4 4" />
        </svg>
        parent of
      </span>
    </p>
  )
}

function Markers() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <defs>
        <marker id={OPEN_MARKER} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" className="fill-destructive" />
        </marker>
        <marker id={DONE_MARKER} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
        </marker>
      </defs>
    </svg>
  )
}

function FrameHeader({ frame, onOpen }: { frame: Frame<BoardBead>; onOpen: (id: string) => void }) {
  const { epic } = frame
  if (!epic) {
    return (
      <div className="flex items-center text-sm font-semibold text-muted-foreground" style={{ height: FRAME_HEADER }}>
        {frame.title}
      </div>
    )
  }
  return (
    <button
      type="button"
      aria-label={`${epic.id} ${epic.title}`}
      onClick={() => onOpen(epic.id)}
      className="flex w-full min-w-0 items-center gap-2 rounded-md text-left hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      style={{ height: FRAME_HEADER }}
    >
      <StatusAndId bead={epic} />
      <span className="truncate text-sm font-semibold">{epic.title}</span>
    </button>
  )
}

function GraphFrame({
  frame,
  isOpen,
  onOpen,
  style,
}: {
  frame: Frame<BoardBead>
  isOpen: IsOpen
  onOpen: (id: string) => void
  style?: CSSProperties
}) {
  const { zone } = frame
  const placed = new Map(zone.nodes.map((node) => [node.bead.id, node]))
  return (
    <div
      role="group"
      aria-label={frame.title}
      className="shrink-0 rounded-xl bg-muted/40 ring-2 ring-(color:--tone)/50"
      style={{
        ...toneStyle(frame.epic ? typeStyle(frame.epic.issue_type).tone : NEUTRAL),
        width: frame.width,
        height: frame.height,
        padding: FRAME_PADDING,
        ...style,
      }}
    >
      <FrameHeader frame={frame} onOpen={onOpen} />
      <div className="relative" style={{ width: zone.width, height: zone.height }}>
        <svg aria-hidden="true" width={zone.width} height={zone.height} className="absolute inset-0 overflow-visible">
          {zone.edges.map((edge) => {
            const from = placed.get(edge.from)
            const to = placed.get(edge.to)
            if (!from || !to) return null
            return <Arrow key={`${edge.from} ${edge.to}`} from={from} to={to} edge={edge} open={isOpen(edge)} />
          })}
        </svg>
        {zone.nodes.map((node) => (
          <GraphNode
            key={node.bead.id}
            bead={node.bead}
            onOpen={onOpen}
            style={{ position: 'absolute', left: node.x, top: node.y }}
          />
        ))}
      </div>
    </div>
  )
}

export function BeadGraph({ lanes, beads, onOpen }: { lanes: Lane[]; beads: BoardBead[]; onOpen: (id: string) => void }) {
  const graph = useMemo(() => layoutGraph(lanes, beads), [lanes, beads])
  if (lanes.length === 0) return <NoMatch />
  const byId = new Map(beads.map((bead) => [bead.id, bead]))
  const isOpen: IsOpen = (edge) => edge.kind === 'blocks' && (byId.get(edge.to)?.blockers ?? []).includes(edge.from)
  const placed = new Map(graph.frames.map((frame) => [frame.id, frame]))
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto rounded-xl border bg-card p-4">
      <section aria-label="Bead graph" className="flex flex-col gap-4">
        <Legend />
        <Markers />
        {graph.frames.length > 0 && (
          <div className="relative shrink-0" style={{ width: graph.width, height: graph.height }}>
            <svg aria-hidden="true" width={graph.width} height={graph.height} className="absolute inset-0 overflow-visible">
              {graph.edges.map((edge) => {
                const from = placed.get(edge.from)
                const to = placed.get(edge.to)
                if (!from || !to) return null
                return (
                  <Arrow key={`${edge.from} ${edge.to}`} edge={edge} from={from} to={to} open={edge.links.some(isOpen)} />
                )
              })}
            </svg>
            {graph.frames.map((frame) => (
              <GraphFrame
                key={frame.id}
                frame={frame}
                isOpen={isOpen}
                onOpen={onOpen}
                style={{ position: 'absolute', left: frame.x, top: frame.y }}
              />
            ))}
          </div>
        )}
        {graph.apart.length > 0 && (
          <div className="flex flex-wrap items-start gap-4">
            {graph.apart.map((frame) => (
              <GraphFrame key={frame.id} frame={frame} isOpen={isOpen} onOpen={onOpen} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
