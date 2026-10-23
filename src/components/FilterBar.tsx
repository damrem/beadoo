import { Emoji } from '@/components/Emoji'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { statusEmoji } from '@/lib/emojis'
import { STATUS_CHOICES, STATUS_TOGGLES, statusTitle, statusValues, toggleStatus } from '@/lib/filters'
import type { StatusFilter } from '@/lib/filters'

const CHOICE_TITLES: Record<string, string> = {
  ready: 'Ready',
  all: 'All',
}

export function FilterBar({
  status,
  statuses,
  text,
  onStatus,
  onText,
  disabled = false,
}: {
  status: StatusFilter
  statuses: string[]
  text: string
  onStatus: (status: StatusFilter) => void
  onText: (text: string) => void
  disabled?: boolean
}) {
  const pressed = statusValues(status)
  const toggles = STATUS_TOGGLES.filter((value) => statuses.includes(value) || pressed.includes(value))
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ToggleGroup
        aria-label="Status filter"
        variant="outline"
        size="sm"
        spacing={0}
        multiple
        disabled={disabled}
        value={pressed}
        onValueChange={(values: unknown[]) => {
          const clicked =
            values.find((value) => !pressed.includes(value as string)) ??
            pressed.find((value) => !values.includes(value))
          if (typeof clicked === 'string') onStatus(toggleStatus(status, clicked))
        }}
      >
        {STATUS_CHOICES.map((value) => (
          <ToggleGroupItem key={value} value={value}>
            {CHOICE_TITLES[value]}
          </ToggleGroupItem>
        ))}
        {toggles.map((value) =>
          statusEmoji(value) ? (
            <ToggleGroupItem key={value} value={value} aria-label={statusTitle(value)} title={statusTitle(value)}>
              <Emoji emoji={statusEmoji(value)} />
            </ToggleGroupItem>
          ) : (
            <ToggleGroupItem key={value} value={value}>
              {statusTitle(value)}
            </ToggleGroupItem>
          ),
        )}
      </ToggleGroup>
      <Input
        aria-label="Find in the titles"
        placeholder="Find in the titles"
        className="h-7 w-32"
        value={text}
        disabled={disabled}
        onChange={(event) => onText(event.target.value)}
      />
    </div>
  )
}
