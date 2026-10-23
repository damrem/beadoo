import { AttributeFilters } from '@/components/AttributeFilters'
import { FilterBar } from '@/components/FilterBar'
import { cn } from '@/lib/utils'
import { labelsOf, prioritiesOf, statusTogglesOf, typesOf } from '@/lib/filters'
import type { BeadFilter } from '@/lib/filters'
import type { Bead } from '../../shared/contract'

export function BeadFilters({
  label,
  filter,
  beads,
  onChange,
  disabled = false,
  className,
}: {
  label: string
  filter: BeadFilter
  beads: Bead[]
  onChange: (change: Partial<BeadFilter>) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div role="search" aria-label={label} className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <FilterBar
        status={filter.status}
        statuses={statusTogglesOf(beads)}
        text={filter.text}
        disabled={disabled}
        onStatus={(status) => onChange({ status })}
        onText={(text) => onChange({ text })}
      />
      <AttributeFilters
        labels={filter.labels}
        type={filter.type}
        priority={filter.priority}
        labelOptions={labelsOf(beads)}
        typeOptions={typesOf(beads)}
        priorityOptions={prioritiesOf(beads)}
        disabled={disabled}
        onLabels={(labels) => onChange({ labels })}
        onType={(type) => onChange({ type })}
        onPriority={(priority) => onChange({ priority })}
      />
    </div>
  )
}
