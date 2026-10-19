import { execFileSync } from 'node:child_process'
import { FAKE_WORKTREE, FAKE_WORKTREE_ID, fakeOrca, orcaFailure } from './fake-orca.ts'
import { createSessionWorktree, startSessionTerminal } from './orca.ts'
import { beadSessionCommand, branchSlug, findRepo, onPath, orcaResult, otherTerminalHandles, quoteForSh, renderSessionCommand, terminalHandle, worktreeCreateArgs } from './orca-rules.ts'

const REPO = '/home/me/shop'
const options = { branch: 'feat/cart', lineage: 'child' as const }

describe('the Orca repo and worktree of a session', () => {
  it('finds the repo also when Orca writes its path with a final slash', () => {
    expect(findRepo([{ id: 'r', path: `${REPO}/` }], REPO)?.id).toBe('r')
  })

  it('does not find a repo whose path differs only in the letter case', () => {
    expect(findRepo([{ id: 'r', path: '/home/me/Shop' }], REPO)).toBeUndefined()
  })

  it('links a child worktree to the worktree of the caller', () => {
    expect(worktreeCreateArgs('r', options, '/home/me/work')).toEqual([
      'worktree', 'create', '--repo', 'id:r', '--name', 'feat/cart', '--setup', 'skip', '--parent-worktree', 'path:/home/me/work',
    ])
  })

  it('starts the worktree from the base branch that the user gives', () => {
    expect(worktreeCreateArgs('r', { ...options, base: 'feat/scan' }, undefined)).toEqual([
      'worktree', 'create', '--repo', 'id:r', '--name', 'feat/cart', '--setup', 'skip', '--base-branch', 'feat/scan',
    ])
  })

  it('gives no parent to an independent worktree', () => {
    expect(worktreeCreateArgs('r', { ...options, lineage: 'independent' }, '/home/me/work').slice(-1)).toEqual(['--no-parent'])
  })

  it('names the terminal tab after the last part of the branch', () => {
    expect(branchSlug('feat/cart-price')).toBe('cart-price')
  })
})

describe('the answers of Orca', () => {
  it('give the result when Orca reports a success', () => {
    expect(orcaResult('{"ok":true,"result":{"repos":[]}}', ['repo', 'list'])).toEqual({ repos: [] })
  })

  it('stop the session with the Orca message when Orca reports a failure', () => {
    expect(() => orcaResult('{"ok":false,"error":{"message":"Timed out"}}', ['terminal', 'create'])).toThrow(
      'orca terminal create failed: Timed out',
    )
  })

  it('give the terminal handle in the flat and in the nested form', () => {
    expect(terminalHandle({ handle: 'a' })).toBe('a')
    expect(terminalHandle({ terminal: { handle: 'b' } })).toBe('b')
    expect(() => terminalHandle({})).toThrow(/no terminal handle/)
  })

  it('name each terminal of the worktree except the new one as a terminal to close', () => {
    expect(otherTerminalHandles([{ handle: 'a' }, { handle: 'b' }, {}], 'b')).toEqual(['a'])
  })
})

describe('the command that the new terminal runs', () => {
  it('starts Claude in plan mode with the bead, its database and its worktree in the prompt', () => {
    const command = beadSessionCommand('shop-4', REPO, FAKE_WORKTREE)
    expect(command).toMatch(/^claude --permission-mode plan '/)
    expect(command).toMatch(/bd -C \/home\/me\/shop show shop-4/)
    expect(command).toContain(`worktree ${FAKE_WORKTREE}`)
  })

  it('starts Claude in the permission mode of the user, and asks for no plan outside plan mode', () => {
    const command = beadSessionCommand('shop-4', REPO, FAKE_WORKTREE, { mode: 'acceptEdits' })
    expect(command).toMatch(/^claude --permission-mode acceptEdits '/)
    expect(command).not.toMatch(/Produce a plan only/)
  })

  it('names the place of the session when it is not the worktree of the bead', () => {
    expect(beadSessionCommand('shop-4', REPO, FAKE_WORKTREE, { sessionPath: REPO })).toContain(
      `You run in ${REPO}, and its dedicated worktree is ${FAKE_WORKTREE}`,
    )
    expect(beadSessionCommand('shop-4', REPO, undefined, { sessionPath: REPO })).toContain(`You run in ${REPO}, with no dedicated worktree`)
  })

  it('starts the program of the session command that the user wrote', () => {
    expect(beadSessionCommand('shop-4', REPO, FAKE_WORKTREE, { mode: 'acceptEdits', template: 'opencode --mode {mode} --prompt {prompt}' })).toMatch(
      /^opencode --mode acceptEdits --prompt 'Work on the bead shop-4 /,
    )
  })

  it('puts the prompt in each {prompt} place, also when the prompt holds a dollar sign', () => {
    expect(renderSessionCommand('run {prompt} {prompt}', 'plan', 'pay $& now')).toBe("run 'pay $& now' 'pay $& now'")
  })

  it('gives bash the text unchanged, also with quotes, dollars and back quotes', () => {
    const text = `it's $HOME and \`date\` and "x" and \\n`
    expect(execFileSync('bash', ['-c', `printf %s ${quoteForSh(text)}`], { encoding: 'utf8' })).toBe(text)
  })
})

describe('the search for Orca', () => {
  it('finds Orca in a folder of the PATH', () => {
    expect(onPath('orca', '/usr/bin:/home/me/bin', (path) => path === '/home/me/bin/orca')).toBe(true)
  })

  it('does not find Orca when no folder of the PATH holds it', () => {
    expect(onPath('orca', '/usr/bin:/bin', () => false)).toBe(false)
    expect(onPath('orca', undefined, () => true)).toBe(false)
  })

  it('ignores an empty folder of the PATH', () => {
    expect(onPath('orca', ':', (path) => path === 'orca')).toBe(false)
  })
})

describe('a new worktree for a session', () => {
  it('creates a child worktree of the parent that the caller names', async () => {
    const { io, calls } = fakeOrca(REPO)
    await createSessionWorktree(io, REPO, { ...options, parent: '/home/me/epic' })
    expect(calls.some((call) => call.startsWith('orca worktree create') && call.includes('--parent-worktree path:/home/me/epic'))).toBe(true)
    expect(calls.some((call) => call.includes('--show-toplevel'))).toBe(false)
  })

  it('gives the worktree the branch that the user chose', async () => {
    const { io, calls } = fakeOrca(REPO)
    const worktree = await createSessionWorktree(io, REPO, { ...options, lineage: 'independent' })
    expect(worktree).toEqual({ id: FAKE_WORKTREE_ID, path: FAKE_WORKTREE, branch: 'feat/cart' })
    expect(calls.some((call) => call.startsWith('orca worktree create') && call.includes('--no-parent'))).toBe(true)
  })

  it('creates nothing and shows the add command when Orca does not know the repo', async () => {
    const { io, calls } = fakeOrca(REPO, { repos: [{ id: 'other', path: '/home/me/other' }] })
    await expect(createSessionWorktree(io, REPO, options)).rejects.toThrow(/orca repo add --path '\/home\/me\/shop'/)
    expect(calls.some((call) => call.startsWith('orca worktree create'))).toBe(false)
  })

  it('creates nothing when the repo path does not exist', async () => {
    const { io, calls } = fakeOrca(REPO)
    io.exists = () => false
    await expect(createSessionWorktree(io, REPO, options)).rejects.toThrow(/does not exist/)
    expect(calls).toEqual([])
  })
})

describe('the terminal of a session', () => {
  const worktree = { id: FAKE_WORKTREE_ID, path: FAKE_WORKTREE, branch: 'feat/cart' }

  it('starts the command in a new terminal of the worktree and closes the other tab', async () => {
    const { io, calls } = fakeOrca(REPO)
    expect(await startSessionTerminal(io, worktree, 'claude')).toBe('term_new')
    expect(calls.some((call) => call.startsWith(`orca terminal create --worktree id:${FAKE_WORKTREE_ID} --title cart`))).toBe(true)
    expect(calls.some((call) => call.startsWith('orca terminal close --terminal term_setup'))).toBe(true)
  })

  it('never asks Orca to start the terminal with a command, because Orca then times out', async () => {
    const { io, calls } = fakeOrca(REPO)
    await startSessionTerminal(io, worktree, 'claude')
    const create = calls.find((call) => call.startsWith('orca terminal create'))
    expect(create).not.toMatch(/--command|--shell/)
  })

  it('keeps the other terminals of a worktree when the caller asks for it', async () => {
    const { io, calls } = fakeOrca(REPO)
    await startSessionTerminal(io, worktree, 'claude', false)
    expect(calls.some((call) => call.startsWith('orca terminal list') || call.startsWith('orca terminal close'))).toBe(false)
  })

  it('stops with the Orca message when Orca does not accept the command', async () => {
    const { io } = fakeOrca(REPO, { send: orcaFailure('Terminal is gone') })
    await expect(startSessionTerminal(io, worktree, 'claude')).rejects.toThrow('orca terminal send')
  })
})
