import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { BeadId } from '@/components/BeadId'
import { Tag } from '@/components/BeadCard'
import { Emoji } from '@/components/Emoji'
import { NoMatch } from '@/components/NoMatch'
import type { BoardBead } from '@/lib/blockers'
import { statusEmoji } from '@/lib/emojis'
import { statusTitle } from '@/lib/filters'
import { edgePath, layoutGraph, NODE_HEIGHT, NODE_WIDTH } from '@/lib/graph'
import type { GraphEdge, PlacedNode } from '@/lib/graph'
import { priorityTone, toneStyle, typeStyle } from '@/lib/tones'
import { cn } from '@/lib/utils'

const OPEN_MARKER = 'graph-arrow-open'

const DONE_MARKER = 'graph-arrow-done'

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
      <span className="flex items-center gap-1.5 font-mono text-xs">
        <span title={statusTitle(bead.status)}>
          <Emoji emoji={statusEmoji(bead.status)} />
        </span>
        <BeadId id={bead.id} />
        {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
      </span>
      <span className="line-clamp-2 text-xs leading-snug">{bead.title}</span>
    </button>
  )
}

const isOpenBlock = (edge: GraphEdge, target: BoardBead): boolean =>
  edge.kind === 'blocks' && (target.blockers ?? []).includes(edge.from)

function GraphEdgePath({ edge, from, to }: { edge: GraphEdge; from: PlacedNode<BoardBead>; to: PlacedNode<BoardBead> }) {
  const open = isOpenBlock(edge, to.bead)
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

export function BeadGraph({ beads, onOpen }: { beads: BoardBead[]; onOpen: (id: string) => void }) {
  const graph = useMemo(() => layoutGraph(beads), [beads])
  if (beads.length === 0) return <NoMatch />
  const placed = new Map(graph.nodes.map((node) => [node.bead.id, node]))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto rounded-xl border bg-card p-4">
      {graph.nodes.length > 0 && (
        <section aria-label="Bead graph" className="flex flex-col gap-3">
          <Legend />
          <div className="relative shrink-0" style={{ width: graph.width, height: graph.height }}>
            <svg aria-hidden="true" width={graph.width} height={graph.height} className="absolute inset-0 overflow-visible">
              <defs>
                <marker id={OPEN_MARKER} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-destructive" />
                </marker>
                <marker id={DONE_MARKER} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" className="fill-muted-foreground/60" />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const from = placed.get(edge.from)
                const to = placed.get(edge.to)
                return from && to ? <GraphEdgePath key={`${edge.from} ${edge.to}`} edge={edge} from={from} to={to} /> : null
              })}
            </svg>
            {graph.nodes.map((node) => (
              <GraphNode
                key={node.bead.id}
                bead={node.bead}
                onOpen={onOpen}
                style={{ position: 'absolute', left: node.x, top: node.y }}
              />
            ))}
          </div>
        </section>
      )}
      {graph.loose.length > 0 && (
        <section aria-label="Beads with no link" className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">No link</h2>
          <div className="flex flex-wrap gap-3 p-0.5">
            {graph.loose.map((bead) => (
              <GraphNode key={bead.id} bead={bead} onOpen={onOpen} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
