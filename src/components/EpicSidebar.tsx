import { cn } from '@/lib/utils'
import { countLabel, NO_EPIC } from '@/lib/filters'
import type { EpicEntry } from '@/lib/filters'

export function EpicSidebar({
  epics,
  selected,
  onSelect,
}: {
  epics: EpicEntry[]
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <nav aria-label="Epics" className="flex w-72 shrink-0 flex-col gap-1 overflow-y-auto border-r bg-sidebar p-2">
      <h2 className="px-2 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Epics</h2>
      {epics.map((epic) => (
        <button
          key={epic.id}
          type="button"
          aria-current={epic.id === selected ? 'true' : undefined}
          onClick={() => onSelect(epic.id)}
          className={cn(
            'flex flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sidebar-accent',
            epic.id === selected && 'bg-sidebar-accent font-medium',
            epic.status === 'closed' && 'opacity-60',
          )}
        >
          <span className="line-clamp-2">{epic.title}</span>
          <span className="font-mono text-[0.7rem] text-muted-foreground">
            {epic.id === NO_EPIC ? '' : `${epic.id} · `}
            {countLabel(epic.counts)}
          </span>
        </button>
      ))}
    </nav>
  )
}
