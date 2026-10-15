import { BeadCard } from '@/components/BeadCard'
import { columnsOf, statusTitle } from '@/lib/filters'
import type { Bead } from '../../shared/contract'

export function Board({ beads, onOpen }: { beads: Bead[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid min-h-0 flex-1 auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {columnsOf(beads).map((column) => (
        <section
          key={column.status}
          aria-label={statusTitle(column.status)}
          className="flex min-h-0 flex-col gap-2 rounded-xl bg-muted/60 p-2"
        >
          <h2 className="flex items-center justify-between px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {statusTitle(column.status)}
            <span className="tabular-nums">{column.beads.length}</span>
          </h2>
          <div className="flex flex-col gap-2 overflow-y-auto">
            {column.beads.map((bead) => (
              <BeadCard key={bead.id} bead={bead} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
