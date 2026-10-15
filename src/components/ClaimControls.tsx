import { Button } from '@/components/ui/button'
import type { Bead, ClaimAction } from '../../shared/contract'

const LABELS: Record<ClaimAction, string> = { claim: 'Claim', unclaim: 'Unclaim', renew: 'Renew' }

export function claimActions(bead: Bead, actor: string | null): ClaimAction[] {
  if (bead.status === 'closed') return []
  if (bead.status !== 'in_progress') return ['claim']
  return actor && bead.assignee === actor ? ['renew', 'unclaim'] : []
}

export function ClaimControls({
  bead,
  actor,
  writing,
  onAction,
}: {
  bead: Bead
  actor: string | null
  writing: ClaimAction | 'spawn' | null
  onAction: (action: ClaimAction) => void
}) {
  const actions = claimActions(bead, actor)
  if (actions.length === 0) return null
  return (
    <div className="flex gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          size="sm"
          variant={action === 'unclaim' ? 'outline' : 'default'}
          disabled={writing !== null}
          onClick={() => onAction(action)}
        >
          {writing === action ? `${LABELS[action]}…` : LABELS[action]}
        </Button>
      ))}
    </div>
  )
}
