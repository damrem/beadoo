import { BeadCard } from '@/components/BeadCard'
import { Emoji } from '@/components/Emoji'
import { ToneDot } from '@/components/ToneDot'
import { statusEmoji } from '@/lib/emojis'
import { columnsOf, statusesOf, statusTitle } from '@/lib/filters'
import { blockedFirst, statusTone, toneStyle } from '@/lib/tones'
import type { Bead } from '../../shared/contract'

export function Board({ beads, onOpen }: { beads: Bead[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid min-h-0 flex-1 auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {columnsOf(beads, blockedFirst(statusesOf(beads))).map((column) => (
        <section
          key={column.status}
          aria-label={statusTitle(column.status)}
          className="flex min-h-0 flex-col gap-2 rounded-xl border-t-4 bg-muted/60 p-2 tone-edge"
          style={toneStyle(statusTone(column.status))}
        >
          <h2 className="flex items-center justify-between px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <span className="flex items-center gap-1.5">
              <ToneDot tone={statusTone(column.status)} />
              <Emoji emoji={statusEmoji(column.status)} />
              {statusTitle(column.status)}
            </span>
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
