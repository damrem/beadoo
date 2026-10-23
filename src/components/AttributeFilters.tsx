import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

const withSelected = <T,>(values: T[], selected: T | null): T[] =>
  selected === null || values.includes(selected) ? values : [...values, selected]

export function AttributeFilters({
  labels,
  type,
  priority,
  labelOptions,
  typeOptions,
  priorityOptions,
  onLabels,
  onType,
  onPriority,
  disabled = false,
}: {
  labels: string[]
  type: string | null
  priority: number | null
  labelOptions: string[]
  typeOptions: string[]
  priorityOptions: number[]
  onLabels: (labels: string[]) => void
  onType: (type: string | null) => void
  onPriority: (priority: number | null) => void
  disabled?: boolean
}) {
  const freeLabels = labelOptions.filter((label) => !labels.includes(label))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <NativeSelect
        aria-label="Type filter"
        className="h-7 w-auto"
        disabled={disabled}
        value={type ?? ''}
        onChange={(event) => onType(event.target.value || null)}
      >
        <option value="">All types</option>
        {withSelected(typeOptions, type).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Priority filter"
        className="h-7 w-auto"
        disabled={disabled}
        value={priority ?? ''}
        onChange={(event) => onPriority(event.target.value === '' ? null : Number(event.target.value))}
      >
        <option value="">All priorities</option>
        {withSelected(priorityOptions, priority).map((option) => (
          <option key={option} value={option}>
            P{option}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Label filter"
        className="h-7 w-auto"
        value=""
        disabled={disabled || freeLabels.length === 0}
        onChange={(event) => event.target.value && onLabels([...labels, event.target.value])}
      >
        <option value="">Add a label</option>
        {freeLabels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </NativeSelect>
      {labels.map((label) => (
        <Button
          key={label}
          type="button"
          variant="secondary"
          size="xs"
          disabled={disabled}
          aria-label={`Remove the label filter ${label}`}
          onClick={() => onLabels(labels.filter((other) => other !== label))}
        >
          {label}
          <XIcon data-icon="inline-end" />
        </Button>
      ))}
    </div>
  )
}
