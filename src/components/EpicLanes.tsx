import { BeadCard, LabelTags } from '@/components/BeadCard'
import { BeadId } from '@/components/BeadId'
import { NoMatch } from '@/components/NoMatch'
import { Emoji } from '@/components/Emoji'
import { OpenEpicButton } from '@/components/EpicHeader'
import { EpicProgress, EpicWarning } from '@/components/EpicProgress'
import { statusEmoji } from '@/lib/emojis'
import { columnsOf, columnStatusesOf, NO_EPIC, statusTitle } from '@/lib/filters'
import type { Lane, StatusFilter } from '@/lib/filters'
import { blockedFirst, statusTone, toneStyle } from '@/lib/tones'

const COLUMN_REM = 14

export function EpicLanes({
  lanes,
  status = 'all',
  onOpen,
}: {
  lanes: Lane[]
  status?: StatusFilter
  onOpen: (id: string) => void
}) {
  if (lanes.length === 0) return <NoMatch />
  const statuses = blockedFirst(columnStatusesOf(lanes.flatMap((lane) => lane.beads), status))
  const template = {
    gridTemplateColumns: `${COLUMN_REM}rem repeat(${statuses.length}, minmax(${COLUMN_REM}rem, 1fr))`,
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="grid" style={{ minWidth: `${COLUMN_REM * (statuses.length + 1)}rem` }}>
        <div
          className="sticky top-0 z-10 grid border-b bg-background text-xs font-medium tracking-wide text-muted-foreground uppercase"
          style={template}
        >
          <div className="px-2 py-2">Epic</div>
          {statuses.map((status) => (
            <div
              key={status}
              className="flex items-center gap-1.5 border-b-2 px-2 py-2 tone-edge"
              style={toneStyle(statusTone(status))}
            >
              <Emoji emoji={statusEmoji(status)} />
              {statusTitle(status)}
            </div>
          ))}
        </div>
        {lanes.map((lane) => (
          <section key={lane.epic.id} aria-label={lane.epic.title} className="grid border-b" style={template}>
            <div className="flex flex-col gap-1 px-2 py-3">
              {lane.epic.id !== NO_EPIC && (
                <BeadId id={lane.epic.id} className="font-mono text-xs text-muted-foreground" />
              )}
              <span className="text-sm font-medium">{lane.epic.title}</span>
              <span className="text-xs text-muted-foreground">
                {lane.beads.length === 1 ? '1 bead' : `${lane.beads.length} beads`}
              </span>
              {lane.epic.id !== NO_EPIC && (
                <>
                  <EpicProgress title={lane.epic.title} counts={lane.epic.counts} />
                  <EpicWarning status={lane.epic.status} counts={lane.epic.counts} />
                  <OpenEpicButton epic={lane.epic} onOpen={onOpen} />
                </>
              )}
              <LabelTags labels={lane.epic.labels} />
            </div>
            {columnsOf(lane.beads, statuses).map((cell) => (
              <div
                key={cell.status}
                role="group"
                aria-label={`${lane.epic.title}: ${statusTitle(cell.status)}`}
                className="flex min-h-16 min-w-0 flex-col gap-2 p-2"
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
