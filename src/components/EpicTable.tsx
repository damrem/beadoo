import type { ReactNode } from 'react'
import { BlockerCount, Blocks, LabelTags, Tag, WaitsOn } from '@/components/BeadCard'
import { BeadId } from '@/components/BeadId'
import { OpenEpicButton } from '@/components/EpicHeader'
import { NoMatch } from '@/components/NoMatch'
import { StatusBar } from '@/components/StatusBar'
import { Emoji } from '@/components/Emoji'
import { statusEmoji } from '@/lib/emojis'
import { countLabel, NO_EPIC, statusTitle } from '@/lib/filters'
import type { Lane } from '@/lib/filters'
import { priorityTone } from '@/lib/tones'
import type { Bead } from '../../shared/contract'

const HEADINGS = ['Id', 'Title', 'Status', 'Priority', 'Assignee', 'Labels']

export function EpicTable({
  lanes,
  onOpen,
  cardActions,
}: {
  lanes: Lane[]
  onOpen: (id: string) => void
  cardActions?: (bead: Bead) => ReactNode
}) {
  if (lanes.length === 0) return <NoMatch />
  const headings = cardActions ? [...HEADINGS, 'Actions'] : HEADINGS
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
      <table aria-label="Beads by epic" className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-card text-left text-xs text-muted-foreground">
          <tr>
            {headings.map((heading) => (
              <th key={heading} className="px-3 py-2 font-medium">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        {lanes.map((lane) => (
          <tbody key={lane.epic.id} aria-label={lane.epic.title}>
            <tr className="bg-muted">
              <th colSpan={headings.length}scope="rowgroup" className="px-3 py-2 text-left font-normal">
                <div className="flex flex-wrap items-center gap-3">
                  {lane.epic.id !== NO_EPIC && (
                    <BeadId id={lane.epic.id} className="font-mono text-xs text-muted-foreground" />
                  )}
                  <span className="font-semibold">{lane.epic.title}</span>
                  <OpenEpicButton epic={lane.epic} onOpen={onOpen} />
                  <LabelTags labels={lane.epic.labels} />
                  <span className="ml-auto flex items-center gap-3">
                    <BlockerCount count={lane.epic.blockers} />
                    <StatusBar title={lane.epic.title} counts={lane.epic.counts} />
                    <span className="text-xs text-muted-foreground">{countLabel(lane.epic.counts)}</span>
                  </span>
                </div>
              </th>
            </tr>
            {lane.beads.map((bead) => (
              <tr key={bead.id} className="border-t hover:bg-accent">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                  <BeadId id={bead.id} />
                </td>
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
                    <Emoji emoji={statusEmoji(bead.status)} />
                    {statusTitle(bead.status)}
                  </span>
                  {bead.blockers?.length ? <WaitsOn blockers={bead.blockers} /> : null}
                  {bead.blocks?.length ? <Blocks beads={bead.blocks} /> : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {bead.priority !== undefined && <Tag tone={priorityTone(bead.priority)}>P{bead.priority}</Tag>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{bead.assignee ?? ''}</td>
                <td className="px-3 py-2 text-xs">
                  <LabelTags labels={bead.labels} />
                </td>
                {cardActions && <td className="px-3 py-2">{cardActions(bead)}</td>}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  )
}
