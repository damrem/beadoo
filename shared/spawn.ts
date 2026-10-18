import type { Bead } from './contract.ts'

export const WORKTREE_KINDS = ['new', 'child', 'existing', 'none'] as const

export type WorktreeKind = (typeof WORKTREE_KINDS)[number]

export const SESSION_LOCATIONS = ['worktree', 'parent', 'epic'] as const

export type SessionLocation = (typeof SESSION_LOCATIONS)[number]

export const PERMISSION_MODES = ['plan', 'default', 'acceptEdits', 'bypassPermissions'] as const

export type PermissionMode = (typeof PERMISSION_MODES)[number]

export type SpawnRequest = {
  kind: WorktreeKind
  location: SessionLocation
  mode: PermissionMode
  branch?: string
  target?: string
  confirmed?: boolean
}

export type SpawnWorktree = {
  path: string
  branch?: string
  parent?: string
  main?: boolean
  heldBy?: string
  busy?: boolean
}

export type SpawnChoices = {
  repo: string
  worktrees: SpawnWorktree[]
  epic?: { id: string; path: string }
  problem?: string
}

export type SpawnedSession = {
  bead: Bead
  worktree: string
  path: string
  branch: string
  terminal: string
  session?: string
  kind?: WorktreeKind
  location?: SessionLocation
  mode?: PermissionMode
  warning?: string
}

export const locationsFor = (kind: WorktreeKind): SessionLocation[] => {
  if (kind === 'new') return ['worktree']
  if (kind === 'none') return ['worktree', 'epic']
  return ['worktree', 'parent']
}

export const needsBranch = (kind: WorktreeKind): boolean => kind === 'new' || kind === 'child'

export const needsTarget = (kind: WorktreeKind): boolean => kind === 'child' || kind === 'existing'

export const isRisky = (request: Pick<SpawnRequest, 'kind' | 'mode'>): boolean =>
  request.kind === 'none' || request.mode === 'bypassPermissions'

export const MAX_BRANCH_LENGTH = 80

const BRANCH = /^[a-z]+\/[a-z0-9]+(-[a-z0-9]+)*$/

const MAX_SLUG_LENGTH = 50

const typeOf = (issueType: string | undefined): string => {
  if (issueType === 'bug') return 'fix'
  if (issueType === 'chore') return 'chore'
  return 'feat'
}

const MAX_TITLE_WORDS = 4

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'for', 'in', 'on', 'and', 'or', 'it', 'its', 'is', 'are', 'be',
  'after', 'before', 'with', 'from', 'by', 'at', 'as', 'that', 'this', 'into', 'when', 'so',
])

const wordsOf = (text: string): string[] =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

const shortId = (id: string): string => {
  const [base, ...children] = id.split('.')
  const local = base.slice(base.lastIndexOf('-') + 1) || base
  return wordsOf([local, ...children].join(' ')).join('-')
}

export function branchFor(bead: Pick<Bead, 'id' | 'title' | 'issue_type'>): string {
  const title = wordsOf(bead.title)
    .filter((word) => !FILLER_WORDS.has(word))
    .slice(0, MAX_TITLE_WORDS)
  const slug = [shortId(bead.id), ...title]
    .filter(Boolean)
    .join('-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '')
  return `${typeOf(bead.issue_type)}/${slug || 'bead'}`
}

export function branchProblem(branch: string): string | null {
  if (branch.length > MAX_BRANCH_LENGTH) return `The branch name is longer than ${MAX_BRANCH_LENGTH} characters.`
  if (!BRANCH.test(branch)) {
    return 'Give the branch as <type>/<slug>: lowercase letters, digits and single hyphens, as feat/cart-total.'
  }
  return null
}

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)

const optionalText = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string'

export function readSpawnRequest(value: unknown): SpawnRequest | string {
  if (typeof value !== 'object' || value === null) return 'The spawn request is not an object.'
  const body = value as Record<string, unknown>
  if (body.kind === undefined && typeof body.branch === 'string') {
    return { kind: 'new', location: 'worktree', mode: 'plan', branch: body.branch }
  }
  if (!oneOf(WORKTREE_KINDS, body.kind)) return `Give the worktree kind as one of: ${WORKTREE_KINDS.join(', ')}.`
  if (!oneOf(SESSION_LOCATIONS, body.location)) return `Give the session location as one of: ${SESSION_LOCATIONS.join(', ')}.`
  if (!oneOf(PERMISSION_MODES, body.mode)) return `Give the permission mode as one of: ${PERMISSION_MODES.join(', ')}.`
  if (!optionalText(body.branch) || !optionalText(body.target)) return 'Give the branch and the target worktree as text.'
  const request: SpawnRequest = { kind: body.kind, location: body.location, mode: body.mode }
  if (body.branch !== undefined) request.branch = body.branch
  if (body.target !== undefined) request.target = body.target
  if (body.confirmed === true) request.confirmed = true
  return request
}

export function spawnRequestProblem(request: SpawnRequest): string | null {
  if (!locationsFor(request.kind).includes(request.location)) {
    return `A session of the worktree kind ${request.kind} cannot run in the ${request.location} location.`
  }
  if (needsBranch(request.kind)) {
    const problem = branchProblem(request.branch ?? '')
    if (problem) return problem
  }
  if (needsTarget(request.kind) && !request.target?.startsWith('/')) return 'Choose the target worktree.'
  if (isRisky(request) && !request.confirmed) {
    return 'Confirm the risky choice: a session with no worktree, or a session that bypasses the permissions.'
  }
  return null
}

export const isSpawnRequest = (value: unknown): value is SpawnRequest => typeof readSpawnRequest(value) !== 'string'
