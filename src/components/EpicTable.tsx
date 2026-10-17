import { LabelTags, Tag } from '@/components/BeadCard'
import { NoMatch } from '@/components/NoMatch'
import { StatusBar } from '@/components/StatusBar'
import { Emoji } from '@/components/Emoji'
import { ToneDot } from '@/components/ToneDot'
import { statusEmoji } from '@/lib/emojis'
import { countLabel, NO_EPIC, statusTitle } from '@/lib/filters'
import type { Lane } from '@/lib/filters'
import { priorityTone, statusTone } from '@/lib/tones'

const HEADINGS = ['Id', 'Title', 'Status', 'Priority', 'Assignee', 'Labels']

export function EpicTable({ lanes, onOpen }: { lanes: Lane[]; onOpen: (id: string) => void }) {
  if (lanes.length === 0) return <NoMatch />
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
      <table aria-label="Beads by epic" className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
          <tr>
            {HEADINGS.map((heading) => (
              <th key={heading} className="px-3 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        {lanes.map((lane) => (
          <tbody key={lane.epic.id} aria-label={lane.epic.title}>
            <tr className="bg-muted">
              <th colSpan={HEADINGS.length} scope="rowgroup" className="px-3 py-2 text-left font-normal">
                <div className="flex flex-wrap items-center gap-3">
                  {lane.epic.id !== NO_EPIC && (
                    <span className="font-mono text-xs text-muted-foreground">{lane.epic.id}</span>
                  )}
                  <span className="font-semibold">{lane.epic.title}</span>
                  <LabelTags labels={lane.epic.labels} />
                  <span className="ml-auto flex items-center gap-3">
                    <StatusBar title={lane.epic.title} counts={lane.epic.counts} />
                    <span className="text-xs text-muted-foreground">{countLabel(lane.epic.counts)}</span>
                  </span>
                </div>
              </th>
            </tr>
            {lane.beads.map((bead) => (
              <tr key={bead.id} className="border-t hover:bg-accent">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{bead.id}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={`${bead.id} ${bead.title}`}
                    onClick={() => onOpen(bead.id)}
                    className="text-left hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm"
                  >
                    {bead.title}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-1.5">
                    <ToneDot tone={statusTone(bead.status)} />
                    <Emoji emoji={statusEmoji(bead.status)} />
                    {statusTitle(bead.status)}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{bead.assignee ?? ''}</td>
                <td className="px-3 py-2 text-xs">
                  <LabelTags labels={bead.labels} />
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
