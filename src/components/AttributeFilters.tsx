import { ChevronDownIcon, XIcon } from 'lucide-react'
import { NativeSelect } from '@/components/ui/native-select'
import { priorityEmoji, propertyEmoji, statusEmoji, typeEmoji } from '@/lib/emojis'
import { statusTitle } from '@/lib/filters'
import { labelParts, labelText } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Choice = { value: string; text: string }

type Chip = { key: string; text: string; name: string; title?: string; onRemove: () => void }

const inOrderOf =
  <T,>(options: T[]) =>
  (values: T[]): T[] => {
    const rank = (value: T) => (options.includes(value) ? options.indexOf(value) : options.length)
    return [...values].sort((a, b) => rank(a) - rank(b))
  }

const withEmoji = (emoji: string | undefined, text: string): string => (emoji ? `${emoji} ${text}` : text)

const typeText = (type: string): string => withEmoji(typeEmoji(type), type)

const priorityText = (priority: number): string => withEmoji(priorityEmoji(priority), `P${priority}`)

const statusText = (status: string): string => withEmoji(statusEmoji(status), statusTitle(status))

const statusChipText = (status: string): string => statusEmoji(status) ?? statusTitle(status)

const PART =
  'inline-flex h-7 items-center border-l border-input bg-secondary px-2 text-xs outline-none hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset disabled:opacity-50'

function FilterChip({
  name,
  noun,
  all = false,
  choices,
  selected,
  chips,
  disabled,
  onAdd,
  onClear,
}: {
  name: string
  noun: string
  all?: boolean
  choices: Choice[]
  selected: string[]
  chips: Chip[]
  disabled: boolean
  onAdd: (value: string) => void
  onClear: () => void
}) {
  const free = choices.filter((choice) => !selected.includes(choice.value))
  return (
    <div
      role="group"
      aria-label={`The ${noun} filter`}
      className="inline-flex max-w-full flex-wrap items-center overflow-hidden rounded-md border border-input text-sm dark:bg-input/30"
    >
      {chips.length > 0 && (
        <button
          type="button"
          disabled={disabled}
          aria-label={`Remove the ${noun} filter`}
          className={cn(PART, 'border-r border-l-0 text-muted-foreground hover:text-secondary-foreground')}
          onClick={onClear}
        >
          <XIcon className="size-3.5 shrink-0" />
        </button>
      )}
      <span className="relative inline-flex h-7 items-center gap-1.5 pr-2 pl-2.5 has-[select:disabled]:opacity-50 has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-ring/50 has-[select:focus-visible]:ring-inset">
        <span aria-hidden>{withEmoji(propertyEmoji(noun), noun)}</span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <NativeSelect
          aria-label={name}
          className="absolute inset-0 h-full cursor-pointer appearance-none rounded-none border-0 opacity-0 disabled:cursor-default"
          value=""
          disabled={disabled || free.length === 0}
          onChange={(event) => event.target.value && onAdd(event.target.value)}
        >
          <option value="">{withEmoji(propertyEmoji(noun), noun)}</option>
          {free.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.text}
            </option>
          ))}
        </NativeSelect>
      </span>
      {chips.map((chip, index) => (
        <button
          key={chip.key}
          type="button"
          disabled={disabled}
          aria-label={chip.name}
          title={chip.title}
          className={cn(PART, 'relative gap-1 font-medium whitespace-nowrap text-secondary-foreground', all && index > 0 && 'pl-3')}
          onClick={chip.onRemove}
        >
          {all && index > 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-0 z-10 flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-input text-[9px] leading-none font-bold text-[color-mix(in_oklch,var(--secondary),black_60%)]"
            >
              &
            </span>
          )}
          {chip.text}
          <XIcon className="size-3 shrink-0" />
        </button>
      ))}
    </div>
  )
}

export function AttributeFilters({
  statuses,
  labels,
  types,
  priorities,
  statusOptions,
  labelOptions,
  typeOptions,
  priorityOptions,
  onStatuses,
  onLabels,
  onTypes,
  onPriorities,
  disabled = false,
}: {
  statuses: string[]
  labels: string[]
  types: string[]
  priorities: number[]
  statusOptions: string[]
  labelOptions: string[]
  typeOptions: string[]
  priorityOptions: number[]
  onStatuses: (statuses: string[]) => void
  onLabels: (labels: string[]) => void
  onTypes: (types: string[]) => void
  onPriorities: (priorities: number[]) => void
  disabled?: boolean
}) {
  const names = labelOptions.flatMap((label) => labelParts(label)?.name ?? [])
  const attributeNames = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))].sort((a, b) =>
    a.localeCompare(b),
  )
  const attributeOf = (label: string) => {
    const name = labelParts(label)?.name
    return name !== undefined && attributeNames.includes(name) ? name : undefined
  }
  const textOf = (name: string | undefined) => (label: string) =>
    name ? (labelParts(label)?.value ?? label) : labelText(label)
  const selectedOf = (name: string | undefined) => labels.filter((label) => attributeOf(label) === name)
  const labelFilter = (name: string | undefined) => (
    <FilterChip
      key={name ?? ''}
      name={name ? `${name} filter` : 'Label filter'}
      noun={name ?? 'label'}
      all={name === undefined}
      choices={labelOptions
        .filter((label) => attributeOf(label) === name)
        .map((label) => ({ value: label, text: textOf(name)(label) }))}
      selected={selectedOf(name)}
      chips={inOrderOf(labelOptions)(selectedOf(name)).map((label) => ({
        key: label,
        text: textOf(name)(label),
        name: `Remove the label filter ${label}`,
        onRemove: () => onLabels(labels.filter((other) => other !== label)),
      }))}
      disabled={disabled}
      onAdd={(label) => onLabels([...labels, label])}
      onClear={() => onLabels(labels.filter((label) => attributeOf(label) !== name))}
    />
  )
  return (
    <div className="contents">
      <FilterChip
        name="Status filter"
        noun="status"
        choices={statusOptions.map((status) => ({ value: status, text: statusText(status) }))}
        selected={statuses}
        chips={inOrderOf(statusOptions)(statuses).map((status) => ({
          key: status,
          text: statusChipText(status),
          name: `Remove the status filter ${statusTitle(status)}`,
          title: statusTitle(status),
          onRemove: () => onStatuses(statuses.filter((other) => other !== status)),
        }))}
        disabled={disabled}
        onAdd={(status) => onStatuses([...statuses, status])}
        onClear={() => onStatuses([])}
      />
      <FilterChip
        name="Type filter"
        noun="type"
        choices={typeOptions.map((type) => ({ value: type, text: typeText(type) }))}
        selected={types}
        chips={inOrderOf(typeOptions)(types).map((type) => ({
          key: type,
          text: typeText(type),
          name: `Remove the type filter ${type}`,
          onRemove: () => onTypes(types.filter((other) => other !== type)),
        }))}
        disabled={disabled}
        onAdd={(type) => onTypes([...types, type])}
        onClear={() => onTypes([])}
      />
      <FilterChip
        name="Priority filter"
        noun="priority"
        choices={priorityOptions.map((priority) => ({ value: String(priority), text: priorityText(priority) }))}
        selected={priorities.map(String)}
        chips={inOrderOf(priorityOptions)(priorities).map((priority) => ({
          key: String(priority),
          text: priorityText(priority),
          name: `Remove the priority filter P${priority}`,
          onRemove: () => onPriorities(priorities.filter((other) => other !== priority)),
        }))}
        disabled={disabled}
        onAdd={(priority) => onPriorities([...priorities, Number(priority)])}
        onClear={() => onPriorities([])}
      />
      {attributeNames.map(labelFilter)}
      {labelFilter(undefined)}
    </div>
  )
}
