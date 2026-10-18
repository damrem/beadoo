import type { Bead } from '../../shared/contract'
import { branchFor, isRisky, locationsFor, needsBranch, needsTarget, PERMISSION_MODES, SESSION_LOCATIONS, WORKTREE_KINDS } from '../../shared/spawn'
import type { SpawnChoices, SpawnRequest, SpawnWorktree } from '../../shared/spawn'

export type SpawnChoice = Pick<SpawnRequest, 'kind' | 'location' | 'mode'>

export const spawnChoiceKey = (db: string): string => `beadoo:spawn:${db}`

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

export function safeChoice(value: unknown): SpawnChoice | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Record<string, unknown>
  if (!oneOf(WORKTREE_KINDS, stored.kind) || stored.kind === 'none') return null
  if (!oneOf(PERMISSION_MODES, stored.mode)) return null
  const location = oneOf(SESSION_LOCATIONS, stored.location) && locationsFor(stored.kind).includes(stored.location) ? stored.location : 'worktree'
  return { kind: stored.kind, location, mode: stored.mode === 'bypassPermissions' ? 'plan' : stored.mode }
}

export function readSpawnChoice(db: string): SpawnChoice | null {
  try {
    return safeChoice(JSON.parse(window.localStorage.getItem(spawnChoiceKey(db)) ?? 'null'))
  } catch {
    return null
  }
}

export function writeSpawnChoice(db: string, request: SpawnRequest) {
  try {
    const choice = safeChoice(request)
    if (choice) window.localStorage.setItem(spawnChoiceKey(db), JSON.stringify(choice))
    else window.localStorage.removeItem(spawnChoiceKey(db))
  } catch {
    return
  }
}

const listed = (choices: SpawnChoices, path: string | undefined): SpawnWorktree | undefined =>
  path === undefined ? undefined : choices.worktrees.find((worktree) => worktree.path === path)

const epicWorktree = (choices: SpawnChoices): SpawnWorktree | undefined => listed(choices, choices.epic?.path)

export const defaultTarget = (choices: SpawnChoices): string | undefined =>
  (epicWorktree(choices) ?? choices.worktrees.find((worktree) => !worktree.main) ?? choices.worktrees[0])?.path

export const usableLocations = (request: Pick<SpawnRequest, 'kind' | 'target'>, choices: SpawnChoices): SpawnRequest['location'][] =>
  locationsFor(request.kind).filter((location) => {
    if (location === 'epic') return choices.epic !== undefined
    if (location === 'parent' && request.kind === 'existing') return listed(choices, request.target)?.parent !== undefined
    return true
  })

export function proposedRequest(bead: Pick<Bead, 'id' | 'title' | 'issue_type'>, choices: SpawnChoices, remembered: SpawnChoice | null): SpawnRequest {
  const branch = branchFor(bead)
  const epic = epicWorktree(choices)
  const first: SpawnRequest = epic
    ? { kind: 'child', target: epic.path, location: 'worktree', mode: 'plan', branch }
    : { kind: 'new', location: 'worktree', mode: 'plan', branch }
  if (!remembered) return first
  const target = needsTarget(remembered.kind) ? defaultTarget(choices) : undefined
  if (needsTarget(remembered.kind) && target === undefined) return first
  const request: SpawnRequest = { kind: remembered.kind, location: remembered.location, mode: remembered.mode, branch }
  if (target !== undefined) request.target = target
  if (!usableLocations(request, choices).includes(request.location)) request.location = 'worktree'
  return request
}

export function sessionPlace(request: SpawnRequest, choices: SpawnChoices): string | undefined {
  const target = listed(choices, request.target)
  if (request.location === 'epic') return choices.epic?.path
  if (request.kind === 'none') return choices.worktrees.find((worktree) => worktree.main)?.path ?? choices.repo
  if (request.kind === 'existing') return request.location === 'parent' ? target?.parent : target?.path
  if (request.kind === 'child' && request.location === 'parent') return target?.path
  return undefined
}

export const busyPlace = (request: SpawnRequest, choices: SpawnChoices): string | undefined => {
  const place = sessionPlace(request, choices)
  return listed(choices, place)?.busy ? place : undefined
}

export function sentRequest(request: SpawnRequest): SpawnRequest {
  const sent: SpawnRequest = { kind: request.kind, location: request.location, mode: request.mode }
  if (needsBranch(request.kind) && request.branch !== undefined) sent.branch = request.branch
  if (needsTarget(request.kind) && request.target !== undefined) sent.target = request.target
  if (isRisky(request) && request.confirmed) sent.confirmed = true
  return sent
}
