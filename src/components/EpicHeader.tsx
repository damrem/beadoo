import { BeadId } from '@/components/BeadId'
import { Button } from '@/components/ui/button'
import { NO_EPIC } from '@/lib/filters'
import type { EpicEntry } from '@/lib/filters'

export function OpenEpicButton({ epic, onOpen }: { epic: EpicEntry; onOpen: (id: string) => void }) {
  if (epic.id === NO_EPIC) return null
  return (
    <Button size="xs" variant="outline" aria-label={`Open the epic ${epic.title}`} onClick={() => onOpen(epic.id)}>
      Open the epic
    </Button>
  )
}

export function EpicHeader({ epic, onOpen }: { epic: EpicEntry; onOpen: (id: string) => void }) {
  if (epic.id === NO_EPIC) return null
  return (
    <div className="flex items-center gap-2">
      <BeadId id={epic.id} className="font-mono text-xs text-muted-foreground" />
      <h2 className="text-sm font-semibold">{epic.title}</h2>
      <OpenEpicButton epic={epic} onOpen={onOpen} />
    </div>
  )
}
