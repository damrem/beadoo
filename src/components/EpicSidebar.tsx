import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { BeadId } from '@/components/BeadId'
import { countByStatus, countLabel, NO_EPIC } from '@/lib/filters'
import type { Lane } from '@/lib/filters'

export function EpicSidebar({
  lanes,
  selected,
  onSelect,
  filters,
}: {
  lanes: Lane[]
  selected: string | null
  onSelect: (id: string) => void
  filters?: ReactNode
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-2 border-r bg-sidebar p-2">
      <h2 className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Epics</h2>
      {filters}
      <nav aria-label="Epics" className="flex min-h-0 flex-col gap-1 overflow-y-auto">
        {lanes.map(({ epic, beads }) => (
          <button
            key={epic.id}
            type="button"
            aria-current={epic.id === selected ? 'true' : undefined}
            onClick={() => onSelect(epic.id)}
            className={cn(
              'flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
              epic.id === selected && 'bg-card font-medium ring-2 ring-primary ring-inset hover:bg-card',
              epic.status === 'closed' && 'opacity-60',
            )}
          >
            <span className="line-clamp-2">{epic.title}</span>
            <span className="font-mono text-[0.7rem] text-muted-foreground">
              {epic.id !== NO_EPIC && (
                <>
                  <BeadId id={epic.id} /> ·{' '}
                </>
              )}
              {countLabel(countByStatus(beads))}
            </span>
          </button>
        ))}
      </nav>
    </aside>
  )
}
