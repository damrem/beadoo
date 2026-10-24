import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { BLOCKER, READY } from '@/lib/filters'
import type { StatusFilter } from '@/lib/filters'
import { cn } from '@/lib/utils'

const TOGGLE_TITLES: Record<string, string> = {
  [READY]: 'Ready',
  [BLOCKER]: 'Blockers',
}

export function TitleSearch({
  text,
  onText,
  disabled = false,
  className,
}: {
  text: string
  onText: (text: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Input
      aria-label="Search"
      placeholder="Title, id, description, notes…"
      className={cn('h-7 w-32', className)}
      value={text}
      disabled={disabled}
      onChange={(event) => onText(event.target.value)}
    />
  )
}

export function FilterBar({
  status,
  onStatus,
  disabled = false,
}: {
  status: StatusFilter
  onStatus: (status: StatusFilter) => void
  disabled?: boolean
}) {
  const pressed = [...(status.ready ? [READY] : []), ...(status.blocker ? [BLOCKER] : [])]
  return (
    <ToggleGroup
      aria-label="Ready and blockers filter"
      variant="outline"
      size="sm"
      spacing={0}
      multiple
      disabled={disabled}
      value={pressed}
      onValueChange={(values: unknown[]) =>
        onStatus({ ...status, ready: values.includes(READY), blocker: values.includes(BLOCKER) })
      }
    >
      {[READY, BLOCKER].map((value) => (
        <ToggleGroupItem key={value} value={value}>
          {TOGGLE_TITLES[value]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
