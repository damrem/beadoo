import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { STATUS_FILTERS } from '@/lib/filters'
import type { StatusFilter } from '@/lib/filters'

const FILTER_TITLES: Record<StatusFilter, string> = {
  ready: 'Ready',
  all: 'All',
  open: 'Open',
  in_progress: 'In progress',
  closed: 'Closed',
}

export function FilterBar({
  status,
  text,
  onStatus,
  onText,
}: {
  status: StatusFilter
  text: string
  onStatus: (status: StatusFilter) => void
  onText: (text: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        aria-label="Status filter"
        variant="outline"
        size="sm"
        spacing={0}
        value={[status]}
        onValueChange={(values: unknown[]) => {
          const next = values[0]
          if (STATUS_FILTERS.includes(next as StatusFilter)) onStatus(next as StatusFilter)
        }}
      >
        {STATUS_FILTERS.map((filter) => (
          <ToggleGroupItem key={filter} value={filter}>
            {FILTER_TITLES[filter]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Input
        aria-label="Find in the titles"
        placeholder="Find in the titles"
        className="h-7 w-40"
        value={text}
        onChange={(event) => onText(event.target.value)}
      />
    </div>
  )
}
