import { resolve } from 'node:path'
import { createdWorktree, branchSlug, findRepo, orcaResult, otherTerminalHandles, terminalHandle, unknownRepoMessage, worktreeCreateArgs } from './orca-rules.ts'
import type { OrcaRepo, OrcaTerminal, WorktreeOptions } from './orca-rules.ts'
import { checked } from './process.ts'
import type { RunOptions, RunResult } from './process.ts'

export type SessionIo = {
  cwd: string
  exists: (path: string) => boolean
  log: (line: string) => void
  run: (command: string, args: readonly string[], options?: RunOptions) => RunResult | Promise<RunResult>
}

export type SessionWorktree = { id: string; path: string; branch: string }

export class WorktreeStepError extends Error {
  readonly worktree: SessionWorktree
  constructor(message: string, worktree: SessionWorktree) {
    super(message)
    this.worktree = worktree
  }
}

export async function orca<T>(io: SessionIo, args: readonly string[]): Promise<T> {
  const result = await io.run('orca', [...args, '--json'])
  if (result.status === null) throw new Error(`orca ${args.join(' ')} did not start: ${result.stderr.trim()}`)
  return orcaResult<T>(result.stdout || result.stderr, args)
}

async function git(io: SessionIo, cwd: string, args: readonly string[]): Promise<string> {
  const full = ['-C', cwd, ...args]
  return checked(await io.run('git', full), 'git', full).trim()
}

async function callerTree(io: SessionIo): Promise<string | undefined> {
  const result = await io.run('git', ['-C', io.cwd, 'rev-parse', '--show-toplevel'])
  return result.status === 0 && result.stdout.trim() ? result.stdout.trim() : undefined
}

async function startTerminal(io: SessionIo, worktreeId: string, title: string, command: string): Promise<string> {
  const handle = terminalHandle(await orca(io, ['terminal', 'create', '--worktree', `id:${worktreeId}`, '--title', title]))
  await orca(io, ['terminal', 'send', '--terminal', handle, '--text', command, '--enter'])
  return handle
}

async function closeOtherTerminals(io: SessionIo, worktreeId: string, keep: string): Promise<void> {
  try {
    const listed = await orca<{ terminals?: OrcaTerminal[] }>(io, ['terminal', 'list', '--worktree', `id:${worktreeId}`])
    for (const handle of otherTerminalHandles(listed?.terminals, keep)) {
      await orca(io, ['terminal', 'close', '--terminal', handle, '--tab'])
    }
  } catch (error) {
    io.log(`The other terminal tab stays open: ${(error as Error).message}`)
  }
}

export async function createSessionWorktree(
  io: SessionIo,
  repoPath: string,
  options: WorktreeOptions & { parent?: string },
): Promise<SessionWorktree> {
  if (!io.exists(repoPath)) throw new Error(`The repo path does not exist: ${repoPath}`)
  const mainCheckout = resolve(repoPath)

  const repos = (await orca<{ repos?: OrcaRepo[] }>(io, ['repo', 'list']))?.repos ?? []
  const repo = findRepo(repos, mainCheckout)
  if (!repo) throw new Error(unknownRepoMessage(mainCheckout))

  const parent = options.parent ?? (await callerTree(io))
  const worktree = createdWorktree(await orca(io, worktreeCreateArgs(repo.id, options, parent)))
  try {
    const orcaBranch = await git(io, worktree.path, ['branch', '--show-current'])
    if (orcaBranch !== options.branch) await git(io, worktree.path, ['branch', '-m', orcaBranch, options.branch])
    return { id: worktree.id, path: worktree.path, branch: await git(io, worktree.path, ['branch', '--show-current']) }
  } catch (error) {
    throw new WorktreeStepError((error as Error).message, { id: worktree.id, path: worktree.path, branch: options.branch })
  }
}

export async function startSessionTerminal(
  io: SessionIo,
  worktree: SessionWorktree,
  command: string,
  closeOthers = true,
): Promise<string> {
  const handle = await startTerminal(io, worktree.id, branchSlug(worktree.branch), command)
  if (closeOthers) await closeOtherTerminals(io, worktree.id, handle)
  return handle
}
