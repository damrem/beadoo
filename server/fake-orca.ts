import type { RunResult } from '../../../lib/process.ts'
import type { SessionIo } from '../../../skills/handoffs/scripts/start-handoff-session.ts'

export const FAKE_WORKTREE = '/home/me/orca/workspaces/shop/feat-s-1-cart'

export const FAKE_WORKTREE_ID = `repo-1::${FAKE_WORKTREE}`

export const FAKE_EPIC_WORKTREE = '/home/me/orca/workspaces/shop/feat-e-1-checkout'

const text = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' })

export const orcaOk = (result: unknown): RunResult => text(JSON.stringify({ ok: true, result }))

export const orcaFailure = (message: string): RunResult => ({
  status: 1,
  stdout: JSON.stringify({ ok: false, error: { message } }),
  stderr: '',
})

export const listedWorktrees = (repoPath: string) => [
  { id: `repo-1::${repoPath}`, path: repoPath, branch: 'refs/heads/main', isMainWorktree: true, parentWorktreeId: null },
  {
    id: `repo-1::${FAKE_EPIC_WORKTREE}`,
    path: FAKE_EPIC_WORKTREE,
    branch: 'refs/heads/feat/e-1-checkout',
    isMainWorktree: false,
    parentWorktreeId: `repo-1::${repoPath}`,
  },
]

export type OrcaOverrides = {
  repos?: unknown[]
  worktrees?: unknown[]
  worktreeList?: RunResult
  terminals?: unknown[]
  worktreeGate?: Promise<void>
  create?: RunResult
  send?: RunResult
  rename?: RunResult
}

export function fakeOrca(repoPath: string, overrides: OrcaOverrides = {}, events: string[] = []) {
  const calls: string[] = []
  let branch = 'feat-s-1-cart'
  const answer = async (command: string, args: readonly string[]): Promise<RunResult> => {
    if (command === 'git' && args.includes('--show-toplevel')) return text('/home/me\n')
    if (command === 'git' && args.includes('-m')) {
      if (overrides.rename) return overrides.rename
      branch = args.at(-1)!
      return text('')
    }
    if (command === 'git') return text(`${branch}\n`)
    const sub = `${args[0]} ${args[1]}`
    if (sub === 'repo list') return orcaOk({ repos: overrides.repos ?? [{ id: 'repo-1', path: repoPath }] })
    if (sub === 'worktree list') return overrides.worktreeList ?? orcaOk({ worktrees: overrides.worktrees ?? listedWorktrees(repoPath) })
    if (sub === 'worktree create') {
      await overrides.worktreeGate
      return orcaOk({ worktree: { id: FAKE_WORKTREE_ID, path: FAKE_WORKTREE } })
    }
    if (sub === 'terminal create') return overrides.create ?? orcaOk({ terminal: { handle: 'term_new' } })
    if (sub === 'terminal send') return overrides.send ?? orcaOk({ accepted: true })
    if (sub === 'terminal list' && !args.includes('--worktree')) return orcaOk({ terminals: overrides.terminals ?? [] })
    if (sub === 'terminal list') return orcaOk({ terminals: [{ handle: 'term_setup' }, { handle: 'term_new' }] })
    if (sub === 'terminal close') return orcaOk({})
    return { status: 1, stdout: '', stderr: `unexpected ${command} ${args.join(' ')}` }
  }
  const io: SessionIo = {
    cwd: '/home/me',
    exists: () => true,
    log: () => undefined,
    run: (command, args) => {
      calls.push(`${command} ${args.join(' ')}`)
      events.push(`${command} ${args.join(' ')}`)
      return answer(command, args)
    },
  }
  return { io, calls, overrides }
}
