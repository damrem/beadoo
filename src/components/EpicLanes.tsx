import { BeadCard } from '@/components/BeadCard'
import { columnsOf, NO_EPIC, statusesOf, statusTitle } from '@/lib/filters'
import type { Lane } from '@/lib/filters'

export function NoMatch() {
  return <p className="p-4 text-sm text-muted-foreground">No bead matches the filters.</p>
}

export function EpicLanes({ lanes, onOpen }: { lanes: Lane[]; onOpen: (id: string) => void }) {
  if (lanes.length === 0) return <NoMatch />
  const statuses = statusesOf(lanes.flatMap((lane) => lane.beads))
  const template = { gridTemplateColumns: `14rem repeat(${statuses.length}, minmax(14rem, 1fr))` }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid w-max min-w-full">
        <div
          className="sticky top-0 z-10 grid border-b bg-background text-xs font-medium tracking-wide text-muted-foreground uppercase"
          style={template}
        >
          <div className="px-2 py-2">Epic</div>
          {statuses.map((status) => (
            <div key={status} className="px-2 py-2">
              {statusTitle(status)}
            </div>
          ))}
        </div>
        {lanes.map((lane) => (
          <section key={lane.epic.id} aria-label={lane.epic.title} className="grid border-b" style={template}>
            <div className="flex flex-col gap-1 px-2 py-3">
              {lane.epic.id !== NO_EPIC && (
                <span className="font-mono text-xs text-muted-foreground">{lane.epic.id}</span>
              )}
              <span className="text-sm font-medium">{lane.epic.title}</span>
              <span className="text-xs text-muted-foreground">
                {lane.beads.length === 1 ? '1 bead' : `${lane.beads.length} beads`}
              </span>
            </div>
            {columnsOf(lane.beads, statuses).map((cell) => (
              <div
                key={cell.status}
                role="group"
                aria-label={`${lane.epic.title}: ${statusTitle(cell.status)}`}
                className="flex min-h-16 flex-col gap-2 p-2"
              >
                {cell.beads.map((bead) => (
                  <BeadCard key={bead.id} bead={bead} onOpen={onOpen} />
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  )
}
