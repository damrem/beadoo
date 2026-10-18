import type { Bead } from './contract.ts'

export type SpawnRequest = { branch: string }

export type SpawnedSession = {
  bead: Bead
  worktree: string
  path: string
  branch: string
  terminal: string
  warning?: string
}

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

export const isSpawnRequest = (value: unknown): value is SpawnRequest =>
  typeof value === 'object' && value !== null && typeof (value as { branch?: unknown }).branch === 'string'
