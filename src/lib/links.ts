import type { Bead } from '../../shared/contract'

export type LinkedBead = { id: string; title?: string; status?: string; type?: string }

const byPriorityThenId = (a: Bead, b: Bead): number => (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id)

export const childBeadsOf = (beads: Bead[], id: string): LinkedBead[] =>
  beads
    .filter((bead) => bead.parent === id)
    .sort(byPriorityThenId)
    .map(({ id: child, title, status }) => ({ id: child, title, status }))
