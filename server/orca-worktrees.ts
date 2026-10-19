import { basename, resolve } from 'node:path'
import { orca } from './orca.ts'
import type { SessionIo, SessionWorktree } from './orca.ts'
import { findRepo, pathKey, unknownRepoMessage } from './orca-rules.ts'
import type { OrcaRepo } from './orca-rules.ts'

export type RepoWorktree = SessionWorktree & { parentId?: string; main: boolean }

type ListedWorktree = {
  id?: string
  path?: string
  branch?: string
  parentWorktreeId?: string | null
  isMainWorktree?: boolean
}

type ListedTerminal = { worktreeId?: string; worktreePath?: string; agentIdentity?: string; connected?: boolean }

const shortBranch = (branch: string | undefined): string => (branch ?? '').replace(/^refs\/heads\//, '')

export async function repoWorktrees(io: SessionIo, repoPath: string): Promise<RepoWorktree[]> {
  const mainCheckout = resolve(repoPath)
  const repos = (await orca<{ repos?: OrcaRepo[] }>(io, ['repo', 'list']))?.repos ?? []
  const repo = findRepo(repos, mainCheckout)
  if (!repo) throw new Error(unknownRepoMessage(mainCheckout))
  const listed = (await orca<{ worktrees?: ListedWorktree[] }>(io, ['worktree', 'list', '--repo', `id:${repo.id}`]))?.worktrees ?? []
  return listed.flatMap((worktree) =>
    worktree.id && worktree.path
      ? [
          {
            id: worktree.id,
            path: worktree.path,
            branch: shortBranch(worktree.branch) || basename(worktree.path),
            main: worktree.isMainWorktree === true,
            ...(worktree.parentWorktreeId ? { parentId: worktree.parentWorktreeId } : {}),
          },
        ]
      : [],
  )
}

const MERGE_BASES = ['origin/HEAD', 'origin/main', 'origin/master']

export async function mergedBranches(io: SessionIo, repoPath: string): Promise<Set<string>> {
  for (const base of MERGE_BASES) {
    const result = await io.run('git', ['-C', repoPath, 'for-each-ref', '--merged', base, '--format=%(refname:short)', 'refs/heads'])
    if (result.status === 0) return new Set(result.stdout.split('\n').map((line) => line.trim()).filter(Boolean))
  }
  return new Set()
}

export async function claudeWorktreePaths(io: SessionIo): Promise<Set<string>> {
  const terminals = (await orca<{ terminals?: ListedTerminal[] }>(io, ['terminal', 'list']))?.terminals ?? []
  return new Set(
    terminals.flatMap((terminal) =>
      terminal.agentIdentity === 'claude' && terminal.connected !== false && terminal.worktreePath ? [pathKey(terminal.worktreePath)] : [],
    ),
  )
}

export const worktreeAt = (worktrees: readonly RepoWorktree[], path: string): RepoWorktree | undefined =>
  worktrees.find((worktree) => pathKey(worktree.path) === pathKey(path))

export const parentOf = (worktrees: readonly RepoWorktree[], worktree: RepoWorktree): RepoWorktree | undefined =>
  worktree.parentId ? worktrees.find((candidate) => candidate.id === worktree.parentId) : undefined
