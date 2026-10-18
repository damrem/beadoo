import { resolve } from 'node:path'
import type { PermissionMode } from '../shared/spawn.ts'
import { parseJson } from './process.ts'

export type Lineage = 'child' | 'independent'

export type WorktreeOptions = { branch: string; lineage: Lineage; base?: string }

export type OrcaRepo = { id: string; path: string }

export type OrcaWorktree = { id: string; path: string }

export type OrcaTerminal = { handle?: string }

type OrcaEnvelope = { ok?: boolean; result?: unknown; error?: { code?: string; message?: string } }

export function pathKey(path: string): string {
  const full = resolve(path)
  return full.length > 1 ? full.replace(/\/+$/, '') : full
}

export function findRepo(repos: readonly OrcaRepo[], mainCheckout: string): OrcaRepo | undefined {
  const key = pathKey(mainCheckout)
  return repos.find((repo) => pathKey(repo.path) === key)
}

export function unknownRepoMessage(mainCheckout: string): string {
  return `Orca does not know the repo ${mainCheckout}. Add it, then start the session again:\n  orca repo add --path ${quoteForSh(mainCheckout)}`
}

export function worktreeCreateArgs(repoId: string, options: WorktreeOptions, callerTree: string | undefined): string[] {
  const args = ['worktree', 'create', '--repo', `id:${repoId}`, '--name', options.branch, '--setup', 'skip']
  if (options.base) args.push('--base-branch', options.base)
  if (options.lineage === 'independent') args.push('--no-parent')
  else if (callerTree) args.push('--parent-worktree', `path:${callerTree}`)
  return args
}

export function orcaResult<T>(stdout: string, args: readonly string[]): T {
  const label = `orca ${args.join(' ')}`
  if (stdout.trim() === '') throw new Error(`${label} printed nothing.`)
  const envelope = parseJson<OrcaEnvelope>(stdout, label)
  if (envelope.ok !== true) {
    throw new Error(`${label} failed: ${envelope.error?.message ?? stdout.trim()}`)
  }
  return envelope.result as T
}

export function createdWorktree(result: { worktree?: Partial<OrcaWorktree> } | undefined): OrcaWorktree {
  const worktree = result?.worktree
  if (!worktree?.id || !worktree.path) throw new Error('orca worktree create returned no worktree id and path.')
  return { id: worktree.id, path: worktree.path }
}

export function terminalHandle(result: (OrcaTerminal & { terminal?: OrcaTerminal }) | undefined): string {
  const handle = result?.handle ?? result?.terminal?.handle
  if (!handle) throw new Error('orca terminal create returned no terminal handle.')
  return handle
}

export function otherTerminalHandles(terminals: readonly OrcaTerminal[] | undefined, keep: string): string[] {
  return (terminals ?? []).flatMap((terminal) => (terminal.handle && terminal.handle !== keep ? [terminal.handle] : []))
}

export function branchSlug(branch: string): string {
  return branch.split('/').at(-1) ?? branch
}

export function quoteForSh(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`
}

function sessionPlace(worktreePath: string | undefined, sessionPath: string | undefined): string {
  if (!worktreePath) return `You run in ${sessionPath}, with no dedicated worktree`
  if (!sessionPath || sessionPath === worktreePath) return `You are already in its dedicated worktree ${worktreePath}`
  return `You run in ${sessionPath}, and its dedicated worktree is ${worktreePath}`
}

export function beadSessionCommand(
  beadId: string,
  databasePath: string,
  worktreePath: string | undefined,
  options: { mode?: PermissionMode; sessionPath?: string } = {},
): string {
  const mode = options.mode ?? 'plan'
  const prompt = `Work on the bead ${beadId} of the beads database ${databasePath}: read it with bd -C ${databasePath} show ${beadId}. ${sessionPlace(worktreePath, options.sessionPath)}, and the bead is already claimed for you.${mode === 'plan' ? ' Produce a plan only.' : ''}`
  return `claude --permission-mode ${mode} ${quoteForSh(prompt)}`
}

export function worktreeStays(worktreePath: string | undefined): string {
  return worktreePath ? ` The worktree ${worktreePath} stays.` : ''
}

export function releasedMessage(reason: string, beadId: string, worktreePath: string | undefined): string {
  return `${reason}\nThe bead ${beadId} is open again.${worktreeStays(worktreePath)}`
}

export function releasedNote(stampText: string, worktreePath: string, reason: string): string {
  return `released ${stampText}: no session started in ${worktreePath}. Cause: ${reason}`
}
