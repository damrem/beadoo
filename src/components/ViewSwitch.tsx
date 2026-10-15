import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { VIEW_MODES } from '@/lib/filters'
import type { ViewMode } from '@/lib/filters'

const VIEW_TITLES: Record<ViewMode, string> = {
  lanes: 'Lanes',
  table: 'Table',
  epic: 'Epic board',
}

export function ViewSwitch({ mode, onMode }: { mode: ViewMode; onMode: (mode: ViewMode) => void }) {
  return (
    <ToggleGroup
      aria-label="View"
      variant="outline"
      size="sm"
      spacing={0}
      value={[mode]}
      onValueChange={(values: unknown[]) => {
        const next = values[0]
        if (VIEW_MODES.includes(next as ViewMode)) onMode(next as ViewMode)
      }}
    >
      {VIEW_MODES.map((entry) => (
        <ToggleGroupItem key={entry} value={entry}>
          {VIEW_TITLES[entry]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
