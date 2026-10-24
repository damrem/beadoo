import { AttributeFilters } from '@/components/AttributeFilters'
import { FilterBar, TitleSearch } from '@/components/FilterBar'
import { cn } from '@/lib/utils'
import { labelsOf, prioritiesOf, statusOptionsOf, typesOf } from '@/lib/filters'
import type { BeadFilter } from '@/lib/filters'
import type { Bead } from '../../shared/contract'

export function BeadFilters({
  label,
  filter,
  beads,
  onChange,
  disabled = false,
  search = true,
  className,
}: {
  label: string
  filter: BeadFilter
  beads: Bead[]
  onChange: (change: Partial<BeadFilter>) => void
  disabled?: boolean
  search?: boolean
  className?: string
}) {
  return (
    <div role="search" aria-label={label} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {search && <TitleSearch text={filter.text} disabled={disabled} onText={(text) => onChange({ text })} />}
      <FilterBar status={filter.status} disabled={disabled} onStatus={(status) => onChange({ status })} />
      <AttributeFilters
        statuses={filter.status.statuses}
        labels={filter.labels}
        types={filter.types}
        priorities={filter.priorities}
        statusOptions={statusOptionsOf(beads)}
        labelOptions={labelsOf(beads)}
        typeOptions={typesOf(beads)}
        priorityOptions={prioritiesOf(beads)}
        disabled={disabled}
        onStatuses={(statuses) => onChange({ status: { ...filter.status, statuses } })}
        onLabels={(labels) => onChange({ labels })}
        onTypes={(types) => onChange({ types })}
        onPriorities={(priorities) => onChange({ priorities })}
      />
    </div>
  )
}
