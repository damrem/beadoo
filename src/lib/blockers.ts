import type { Bead } from '../../shared/contract'

export const BLOCKS = 'blocks'

export const BLOCKED = 'blocked'

const CLOSED = 'closed'

type Link = { id?: string; depends_on_id?: string; status?: string; type?: string; dependency_type?: string }

export type BoardBead = Bead & { blockers?: string[]; blocks?: string[]; ready?: boolean }

export type StatusOf = (id: string) => string | undefined

const targetOf = (link: Link): string | undefined => link.depends_on_id ?? link.id

const typeOfLink = (link: Link): string | undefined => link.type ?? link.dependency_type

export function openBlockers(bead: Bead, statusOf: StatusOf = () => undefined): string[] {
  if (bead.status === CLOSED) return []
  const links = (bead.dependencies ?? []) as Link[]
  const blockers = links.flatMap((link) => {
    const target = targetOf(link)
    if (typeOfLink(link) !== BLOCKS || !target || target === bead.id) return []
    const status = statusOf(target) ?? link.status
    return status !== undefined && status !== CLOSED ? [target] : []
  })
  return [...new Set(blockers)].sort()
}

export function withBlockers(beads: Bead[], readyIds: string[] = []): BoardBead[] {
  const statuses = new Map(beads.map((bead) => [bead.id, bead.status]))
  const ready = new Set(readyIds)
  const blockersOf = new Map(beads.map((bead) => [bead.id, openBlockers(bead, (id) => statuses.get(id))]))
  const heldBack = new Map<string, string[]>()
  for (const [id, blockers] of blockersOf) {
    for (const blocker of blockers) heldBack.set(blocker, [...(heldBack.get(blocker) ?? []), id])
  }
  return beads.map((bead) => {
    const blockers = blockersOf.get(bead.id) ?? []
    const blocks = bead.status === CLOSED ? [] : (heldBack.get(bead.id) ?? []).sort()
    return {
      ...bead,
      ...(blockers.length > 0 && { blockers }),
      ...(blocks.length > 0 && { blocks }),
      ...(ready.has(bead.id) && { ready: true }),
    }
  })
}

export const isBlocked = (bead: BoardBead): boolean => (bead.blockers?.length ?? 0) > 0

export const isBlocker = (bead: BoardBead): boolean => (bead.blocks?.length ?? 0) > 0

export const isReady = (bead: BoardBead): boolean => bead.ready === true

export const boardStatusOf = (bead: BoardBead): string => (isBlocked(bead) ? BLOCKED : bead.status)

export const waitsOnLabel = (count: number): string => `waits on ${count}`
