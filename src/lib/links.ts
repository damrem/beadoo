import type { Bead } from '../../shared/contract'

export type LinkedBead = { id: string; title?: string; status?: string; type?: string }

const byPriorityThenId = (a: Bead, b: Bead): number => (a.priority ?? 9) - (b.priority ?? 9) || a.id.localeCompare(b.id)

type Dependency = {
  id?: string
  depends_on_id?: string
  dependency_type?: string
  type?: string
  title?: string
  status?: string
}

const PARENT_CHILD = 'parent-child'

const OUTGOING: Record<string, string> = { blocks: 'blocked by', 'discovered-from': 'discovered from' }

const INCOMING: Record<string, string> = { blocks: 'blocks', 'discovered-from': 'led to' }

const words = (type: string) => type.replaceAll('-', ' ')

const dependenciesIn = (bead: Bead): Dependency[] => bead.dependencies ?? []

const targetOf = (dep: Dependency): string | undefined => dep.depends_on_id ?? dep.id

const kindOf = (dep: Dependency): string => dep.type ?? dep.dependency_type ?? 'blocks'

export function dependenciesOf(bead: Bead, beads: Bead[]): LinkedBead[] {
  const known = new Map(beads.map((entry) => [entry.id, entry]))
  return dependenciesIn(bead).flatMap((dep) => {
    const id = targetOf(dep)
    const kind = kindOf(dep)
    if (!id || kind === PARENT_CHILD) return []
    const target = known.get(id)
    return [{ id, title: target?.title ?? dep.title, status: target?.status ?? dep.status, type: OUTGOING[kind] ?? words(kind) }]
  })
}

export const dependentsOf = (beads: Bead[], id: string): LinkedBead[] =>
  beads.flatMap((bead) =>
    dependenciesIn(bead)
      .filter((dep) => targetOf(dep) === id && kindOf(dep) !== PARENT_CHILD)
      .map((dep) => ({ id: bead.id, title: bead.title, status: bead.status, type: INCOMING[kindOf(dep)] ?? words(kindOf(dep)) })),
  )

export const childBeadsOf = (beads: Bead[], id: string): LinkedBead[] =>
  beads
    .filter((bead) => bead.parent === id)
    .sort(byPriorityThenId)
    .map(({ id: child, title, status }) => ({ id: child, title, status }))
