import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunAsync, RunResult } from './process.ts'
import { CONFLICT, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED } from '../shared/contract.ts'
import type { SpawnRequest } from '../shared/spawn.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'
import { FAKE_EPIC_WORKTREE as EPIC, FAKE_WORKTREE as WORKTREE, FAKE_WORKTREE_ID as WORKTREE_ID, fakeOrca, orcaFailure } from './fake-orca.ts'
import type { OrcaOverrides } from './fake-orca.ts'
import { createSpawner } from './spawner.ts'

const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const text = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' })

const NEW: SpawnRequest = { kind: 'new', location: 'worktree', mode: 'plan', branch: 'feat/s-1-cart' }

type Bd = { status: string; assignee?: string; notes: string; parent?: string }

type BdOverrides = {
  claim?: RunResult
  unclaim?: RunResult
  note?: RunResult
  exportAfter?: string
  bead?: Partial<Bd>
  showAfterNote?: RunResult
  others?: Record<string, Record<string, unknown>>
  list?: Record<string, unknown>[]
}

function fakeBd(path: string, overrides: BdOverrides = {}, events: string[] = []) {
  const bead: Bd = { status: 'open', notes: '', ...overrides.bead }
  const writes: string[][] = []
  let lastWrite = ''
  const run: RunAsync = async (command, args) => {
    if (command === 'git' && args.includes('config')) return text('Ann\n')
    if (command === 'git') return text(`${EXPORT_FILE}\n`)
    const sub = args.find((arg) => ['update', 'unclaim', 'export', 'list', 'show', 'context'].includes(arg))
    if (sub === 'context') return ok({ dolt_mode: 'embedded' })
    if (sub === 'export') {
      if (overrides.exportAfter === lastWrite) return { status: 1, stdout: '', stderr: 'Error: disk full' }
      writeFileSync(args[args.indexOf('-o') + 1]!, '{"id":"s-1"}\n')
      return text('Exported')
    }
    if (args.includes('ready')) return ok([])
    if (sub === 'list') return ok(overrides.list ?? [{ id: 's-1' }])
    const other = sub === 'show' ? overrides.others?.[args[args.indexOf('show') + 1]!] : undefined
    if (other) return ok([other])
    if (sub === 'show') return (lastWrite === 'update' && overrides.showAfterNote) || ok([{ id: 's-1', title: 'Cart', ...bead }])
    writes.push(args.slice(args.indexOf(sub!)))
    events.push(`bd ${args.slice(args.indexOf(sub!)).join(' ')}`)
    lastWrite = sub === 'update' && args.includes('--claim') ? 'claim' : sub!
    if (sub === 'update' && args.includes('--claim')) {
      if (overrides.claim) return overrides.claim
      Object.assign(bead, { status: 'in_progress', assignee: 'Ann' })
      return ok([])
    }
    if (sub === 'unclaim') {
      if (overrides.unclaim) return overrides.unclaim
      Object.assign(bead, { status: 'open', assignee: undefined })
      return ok([])
    }
    if (sub === 'update') {
      if (overrides.note) return overrides.note
      const note = args.find((arg) => arg.startsWith('--append-notes='))!.slice('--append-notes='.length)
      bead.notes = bead.notes ? `${bead.notes}\n${note}` : note
      return ok([])
    }
    return { status: 1, stdout: '', stderr: `unexpected bd ${args.join(' ')} in ${path}` }
  }
  return { run, bead, writes }
}

let shopPath: string
let db: { name: string; path: string }

beforeEach(() => {
  shopPath = mkdtempSync(join(tmpdir(), 'beads-spawn-'))
  mkdirSync(join(shopPath, '.beads'))
  db = { name: 'shop', path: shopPath }
})

const now = () => new Date(2026, 9, 16, 9, 5)

const setUp = (bdOverrides: BdOverrides = {}, orcaOverrides: OrcaOverrides = {}, sessionCommand?: () => string) => {
  const events: string[] = []
  const bd = fakeBd(shopPath, bdOverrides, events)
  const orca = fakeOrca(shopPath, orcaOverrides, events)
  const store = createStore(bd.run, { env: {}, now })
  return { ...bd, ...orca, events, spawner: createSpawner(store, orca.io, { now, ...(sessionCommand ? { sessionCommand } : {}) }) }
}

describe('a session that the page starts on a bead', () => {
  it('claims the bead before it creates the worktree, then starts Claude in a new terminal of the worktree', async () => {
    const { spawner, events, calls } = setUp()
    const session = await spawner.spawn(db, 's-1', NEW)
    const claim = events.indexOf('bd update s-1 --claim --json')
    expect(claim).toBeGreaterThan(-1)
    expect(events.findIndex((event) => event.startsWith('orca worktree create'))).toBeGreaterThan(claim)
    const send = calls.find((call) => call.startsWith('orca terminal send'))
    expect(send).toContain(`bd -C ${shopPath} show s-1`)
    expect(send).toContain('claude --permission-mode plan')
    expect(session).toMatchObject({ worktree: WORKTREE_ID, path: WORKTREE, branch: 'feat/s-1-cart', terminal: 'term_new' })
  })

  it('creates the worktree from the repo of the database, on the branch of the user, with no parent worktree', async () => {
    const { spawner, calls } = setUp()
    await spawner.spawn(db, 's-1', NEW)
    const create = calls.find((call) => call.startsWith('orca worktree create'))!
    expect(create).toContain('--repo id:repo-1')
    expect(create).toContain('--no-parent')
    expect(calls).toContain(`git -C ${WORKTREE} branch -m feat-s-1-cart feat/s-1-cart`)
  })

  it('writes the start and the worktree path in the notes of the bead, and gives the claimed bead', async () => {
    const { spawner } = setUp()
    const session = await spawner.spawn(db, 's-1', NEW)
    expect(session.bead).toMatchObject({
      status: 'in_progress',
      assignee: 'Ann',
      notes: `started 2026-10-16 09:05 kind=new worktree=${WORKTREE} branch=feat/s-1-cart location=worktree mode=plan`,
    })
    expect(session.warning).toBeUndefined()
  })

  it('refuses a bead that the user already holds, and keeps the claim of the first session', async () => {
    const { spawner, writes, calls, bead } = setUp({ bead: { status: 'in_progress', assignee: 'Ann' } }, { create: orcaFailure('Timed out') })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ code: CONFLICT, message: expect.stringMatching(/s-1 is in_progress[\s\S]*Ann holds it/) }),
    )
    expect(writes).toEqual([])
    expect(calls).toEqual([])
    expect(bead).toMatchObject({ status: 'in_progress', assignee: 'Ann' })
  })

  it('refuses a closed bead, and writes nothing', async () => {
    const { spawner, writes, calls } = setUp({ bead: { status: 'closed' } })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(expect.objectContaining({ code: CONFLICT }))
    expect(writes).toEqual([])
    expect(calls).toEqual([])
  })

  it('creates no worktree when another actor holds the bead', async () => {
    const { spawner, calls } = setUp({ claim: { status: 1, stdout: '', stderr: 'Error: issue already claimed by Bob' } })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(expect.objectContaining({ code: CONFLICT }))
    expect(calls.filter((call) => call.startsWith('orca'))).toEqual([])
  })

  it('gives the bead back as open, and starts no session, when the export fails after the claim', async () => {
    const { spawner, writes, calls, bead } = setUp({ exportAfter: 'claim' })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/bd export failed[\s\S]*s-1 is open again/) }),
    )
    expect(writes.map((write) => write[0])).toEqual(['update', 'unclaim'])
    expect(calls.filter((call) => call.startsWith('orca'))).toEqual([])
    expect(bead).toMatchObject({ status: 'open', notes: '' })
  })

  it('gives the bead back as open, and keeps no note, when Orca does not know the repo of the database', async () => {
    const { spawner, writes, bead } = setUp({}, { repos: [{ id: 'other', path: '/home/me/other' }] })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/orca repo add --path '[^']*beads-spawn-[^']*'[\s\S]*s-1 is open again/) }),
    )
    expect(writes.map((write) => write[0])).toEqual(['update', 'unclaim'])
    expect(bead).toMatchObject({ status: 'open', notes: '' })
  })

  it('gives the bead back as open and names the worktree that stays when Orca cannot start the terminal', async () => {
    const { spawner, bead } = setUp({}, { create: orcaFailure('Timed out waiting for terminal handle') })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(new RegExp(`Timed out[\\s\\S]*open again\\. The worktree ${WORKTREE} stays`)) }),
    )
    expect(bead.status).toBe('open')
    expect(bead.notes).toMatch(/^released 2026-10-16 09:05: no session started in [\s\S]*Timed out/)
  })

  it('gives the bead back and names the worktree that stays when git cannot rename the branch of the new worktree', async () => {
    const { spawner, bead } = setUp({}, { rename: { status: 128, stdout: '', stderr: "fatal: a branch named 'feat/s-1-cart' already exists" } })
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(new RegExp(`already exists[\\s\\S]*open again\\. The worktree ${WORKTREE} stays`)) }),
    )
    expect(bead.status).toBe('open')
    expect(bead.notes).toContain(`released 2026-10-16 09:05: no session started in ${WORKTREE}. Cause: git -C failed (exit 128): fatal: a branch named`)
  })

  it('tells the user that the bead is open again, and keeps the released note, when the export fails after the release', async () => {
    const { spawner, bead } = setUp({ exportAfter: 'unclaim' }, { send: orcaFailure('terminal is gone') })
    const failure = spawner.spawn(db, 's-1', NEW)
    await expect(failure).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/terminal is gone\nThe bead s-1 is open again[\s\S]*bd export failed/) }),
    )
    await expect(failure).rejects.toThrow(expect.objectContaining({ message: expect.not.stringMatching(/could not give the bead/) }))
    expect(bead.status).toBe('open')
    expect(bead.notes).toMatch(/^released 2026-10-16 09:05: no session started in [\s\S]*terminal is gone/)
  })

  it('tells the user to release the claim when the page cannot give the bead back', async () => {
    const { spawner } = setUp(
      { unclaim: { status: 1, stdout: '', stderr: 'Error: database is locked' } },
      { send: orcaFailure('terminal is gone') },
    )
    await expect(spawner.spawn(db, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/could not give the bead s-1 back[\s\S]*Release the claim/) }),
    )
  })

  it('gives the session and a warning when the session runs but the note of the start fails', async () => {
    const { spawner } = setUp({ note: { status: 1, stdout: '', stderr: 'Error: database is locked' } })
    const session = await spawner.spawn(db, 's-1', NEW)
    expect(session).toMatchObject({ terminal: 'term_new', bead: { status: 'in_progress' } })
    expect(session.warning).toMatch(/The session runs, but the page could not write the note/)
  })

  it('gives the session and the claimed bead when bd stops to answer after the start', async () => {
    const down: RunResult = { status: 1, stdout: '', stderr: 'Error: database is locked' }
    const { spawner } = setUp({ note: down, showAfterNote: down })
    const session = await spawner.spawn(db, 's-1', NEW)
    expect(session).toMatchObject({ path: WORKTREE, terminal: 'term_new', bead: { id: 's-1', status: 'in_progress', assignee: 'Ann' } })
    expect(session.warning).toMatch(/The session runs, but the page could not write the note/)
  })

  it('refuses a branch that is not a type and a slug, and writes nothing', async () => {
    const { spawner, writes, calls } = setUp()
    await expect(spawner.spawn(db, 's-1', { ...NEW, branch: '--force' })).rejects.toThrow(expect.objectContaining({ code: INVALID }))
    expect(writes).toEqual([])
    expect(calls).toEqual([])
  })

  it('refuses a bead id that bd cannot have, and writes nothing', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn(db, '-s 1', NEW)).rejects.toThrow(expect.objectContaining({ code: NOT_FOUND }))
    expect(writes).toEqual([])
  })

  it('refuses to start a session from a database on the Windows mount', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn({ ...db, refused: 'Use a WSL path' }, 's-1', NEW)).rejects.toThrow(
      expect.objectContaining({ code: REFUSED }),
    )
    expect(writes).toEqual([])
  })

  it('starts one session only when the user asks twice for the same bead', async () => {
    const { spawner, calls } = setUp()
    const results = await Promise.allSettled([spawner.spawn(db, 's-1', NEW), spawner.spawn(db, 's-1', NEW)])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: CONFLICT })
    expect(calls.filter((call) => call.startsWith('orca worktree create'))).toHaveLength(1)
  })
})

describe('the worktree kind, the session location and the permission mode of a new session', () => {
  const CHILD: SpawnRequest = { kind: 'child', location: 'worktree', mode: 'plan', branch: 'feat/s-1-cart', target: EPIC }
  const EXISTING: SpawnRequest = { kind: 'existing', location: 'worktree', mode: 'plan', target: EPIC }
  const NONE: SpawnRequest = { kind: 'none', location: 'worktree', mode: 'plan', confirmed: true }
  const epicStarted = { e: { id: 'e-1', title: 'Checkout', status: 'in_progress', notes: `started 2026-10-15 08:00 kind=new worktree=${EPIC}` } }
  const terminalIn = (calls: string[]) => calls.find((call) => call.startsWith('orca terminal create'))
  const send = (calls: string[]) => calls.find((call) => call.startsWith('orca terminal send'))

  it('creates a child of the worktree that the user chose, and starts the session in the child', async () => {
    const { spawner, calls, bead } = setUp()
    const session = await spawner.spawn(db, 's-1', CHILD)
    const create = calls.find((call) => call.startsWith('orca worktree create'))!
    expect(create).toContain(`--parent-worktree path:${EPIC}`)
    expect(create).not.toContain('--no-parent')
    expect(terminalIn(calls)).toContain(`--worktree id:${WORKTREE_ID}`)
    expect(session).toMatchObject({ path: WORKTREE, session: WORKTREE, kind: 'child', location: 'worktree', mode: 'plan' })
    expect(bead.notes).toBe(
      `started 2026-10-16 09:05 kind=child worktree=${WORKTREE} branch=feat/s-1-cart parent=${EPIC} location=worktree mode=plan`,
    )
  })

  it('starts the session in the parent of the new child worktree, and keeps the other terminals of the parent', async () => {
    const { spawner, calls, bead } = setUp()
    const session = await spawner.spawn(db, 's-1', { ...CHILD, location: 'parent' })
    expect(terminalIn(calls)).toContain(`--worktree id:repo-1::${EPIC}`)
    expect(calls.some((call) => call.startsWith('orca terminal close'))).toBe(false)
    expect(send(calls)).toContain(`You run in ${EPIC}, and its dedicated worktree is ${WORKTREE}`)
    expect(session).toMatchObject({ path: WORKTREE, session: EPIC })
    expect(bead.notes).toContain('location=parent')
  })

  it('starts the session in an existing worktree, and creates no worktree', async () => {
    const { spawner, calls, bead } = setUp()
    const session = await spawner.spawn(db, 's-1', EXISTING)
    expect(calls.some((call) => call.startsWith('orca worktree create'))).toBe(false)
    expect(calls.some((call) => call.startsWith('orca terminal close'))).toBe(false)
    expect(terminalIn(calls)).toContain(`--worktree id:repo-1::${EPIC}`)
    expect(session).toMatchObject({ path: EPIC, branch: 'feat/e-1-checkout', session: EPIC })
    expect(bead.notes).toBe(
      `started 2026-10-16 09:05 kind=existing worktree=${EPIC} branch=feat/e-1-checkout parent=${shopPath} location=worktree mode=plan`,
    )
  })

  it('starts the session in the parent of an existing worktree', async () => {
    const { spawner, calls } = setUp()
    const session = await spawner.spawn(db, 's-1', { ...EXISTING, location: 'parent' })
    expect(terminalIn(calls)).toContain(`--worktree id:repo-1::${shopPath}`)
    expect(session.session).toBe(shopPath)
  })

  it('refuses the parent location for a worktree with no parent, and claims nothing', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn(db, 's-1', { ...EXISTING, target: shopPath, location: 'parent' })).rejects.toThrow(
      expect.objectContaining({ code: INVALID, message: expect.stringMatching(/has no parent worktree/) }),
    )
    expect(writes).toEqual([])
  })

  it('refuses a worktree that Orca does not know, and claims nothing', async () => {
    const { spawner, writes, calls } = setUp()
    await expect(spawner.spawn(db, 's-1', { ...EXISTING, target: '/home/me/elsewhere' })).rejects.toThrow(
      expect.objectContaining({ code: INVALID, message: expect.stringMatching(/Orca knows no worktree \/home\/me\/elsewhere/) }),
    )
    expect(writes).toEqual([])
    expect(calls.some((call) => call.startsWith('orca terminal'))).toBe(false)
  })

  it('claims nothing when Orca cannot list the worktrees of the repo', async () => {
    const { spawner, writes } = setUp({}, { worktreeList: orcaFailure('Orca is not running') })
    await expect(spawner.spawn(db, 's-1', EXISTING)).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/could not read the worktrees[\s\S]*Orca is not running/) }),
    )
    expect(writes).toEqual([])
  })

  it('starts the session in the main checkout with no worktree when the user confirms it', async () => {
    const { spawner, calls, bead } = setUp()
    const session = await spawner.spawn(db, 's-1', NONE)
    expect(calls.some((call) => call.startsWith('orca worktree create'))).toBe(false)
    expect(terminalIn(calls)).toContain(`--worktree id:repo-1::${shopPath}`)
    expect(send(calls)).toContain(`You run in ${shopPath}, with no dedicated worktree`)
    expect(session).toMatchObject({ path: shopPath, session: shopPath, kind: 'none' })
    expect(bead.notes).toBe(`started 2026-10-16 09:05 kind=none worktree=${shopPath} branch=main location=worktree mode=plan`)
  })

  it('refuses a session with no worktree that the user did not confirm, and writes nothing', async () => {
    const { spawner, writes, calls } = setUp()
    await expect(spawner.spawn(db, 's-1', { ...NONE, confirmed: false })).rejects.toThrow(
      expect.objectContaining({ code: INVALID, message: expect.stringMatching(/Confirm the risky choice/) }),
    )
    expect(writes).toEqual([])
    expect(calls).toEqual([])
  })

  it('starts the session in the epic worktree that the start note of the epic names', async () => {
    const { spawner, calls, bead } = setUp({ bead: { parent: 'e-1' }, others: { 'e-1': epicStarted.e } })
    const session = await spawner.spawn(db, 's-1', { ...NONE, location: 'epic' })
    expect(terminalIn(calls)).toContain(`--worktree id:repo-1::${EPIC}`)
    expect(session).toMatchObject({ path: EPIC, session: EPIC, location: 'epic' })
    expect(bead.notes).toContain(`kind=none worktree=${EPIC}`)
  })

  it('refuses the epic location when the epic of the bead has no started worktree', async () => {
    const { spawner, writes } = setUp({ bead: { parent: 'e-1' }, others: { 'e-1': { id: 'e-1', title: 'Checkout', status: 'open', notes: '' } } })
    await expect(spawner.spawn(db, 's-1', { ...NONE, location: 'epic' })).rejects.toThrow(
      expect.objectContaining({ code: INVALID, message: expect.stringMatching(/has no started worktree/) }),
    )
    expect(writes).toEqual([])
  })

  it('starts Claude in the permission mode that the user chose', async () => {
    const { spawner, calls, bead } = setUp()
    await spawner.spawn(db, 's-1', { ...NEW, mode: 'acceptEdits' })
    expect(send(calls)).toContain('claude --permission-mode acceptEdits')
    expect(send(calls)).not.toContain('Produce a plan only')
    expect(bead.notes).toContain('mode=acceptEdits')
  })

  it('starts the session command of the config, with the mode and the prompt in their places', async () => {
    const { spawner, calls } = setUp({}, {}, () => 'opencode --mode {mode} --prompt {prompt}')
    await spawner.spawn(db, 's-1', { ...NEW, mode: 'acceptEdits' })
    expect(send(calls)).toContain("opencode --mode acceptEdits --prompt 'Work on the bead s-1 ")
    expect(send(calls)).not.toContain('claude --permission-mode')
  })

  it('refuses to bypass the permissions with no confirmation, and writes nothing', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn(db, 's-1', { ...NEW, mode: 'bypassPermissions' })).rejects.toThrow(expect.objectContaining({ code: INVALID }))
    expect(writes).toEqual([])
  })

  it('starts Claude with no permission checks when the user confirms it', async () => {
    const { spawner, calls } = setUp()
    await spawner.spawn(db, 's-1', { ...NEW, mode: 'bypassPermissions', confirmed: true })
    expect(send(calls)).toContain('claude --permission-mode bypassPermissions')
  })

  it('gives the bead back and names the new child worktree that stays when Orca cannot start the terminal', async () => {
    const { spawner, bead } = setUp({}, { send: orcaFailure('terminal is gone') })
    await expect(spawner.spawn(db, 's-1', CHILD)).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(new RegExp(`terminal is gone[\\s\\S]*open again\\. The worktree ${WORKTREE} stays`)) }),
    )
    expect(bead.status).toBe('open')
  })

  it('gives the bead back and names no worktree when the terminal fails in an existing worktree', async () => {
    const { spawner, bead } = setUp({}, { send: orcaFailure('terminal is gone') })
    const failure = spawner.spawn(db, 's-1', EXISTING)
    await expect(failure).rejects.toThrow(expect.objectContaining({ message: expect.stringMatching(/terminal is gone\nThe bead s-1 is open again\.$/) }))
    expect(bead).toMatchObject({ status: 'open', notes: '' })
  })
})

describe('the choices that the page offers for a new session', () => {
  it('lists the worktrees of the repo with their branch and their parent', async () => {
    const { spawner } = setUp()
    expect(await spawner.choices(db, 's-1')).toEqual({
      repo: shopPath,
      worktrees: [
        { path: shopPath, branch: 'main', main: true },
        { path: EPIC, branch: 'feat/e-1-checkout', parent: shopPath },
      ],
    })
  })

  it('names the bead in progress that holds a worktree', async () => {
    const { spawner } = setUp({
      list: [
        { id: 's-2', status: 'in_progress', notes: `started 2026-10-15 08:00 in ${EPIC}` },
        { id: 's-3', status: 'closed', notes: `started 2026-10-14 08:00 in ${shopPath}` },
      ],
    })
    const { worktrees } = await spawner.choices(db, 's-1')
    expect(worktrees.find((worktree) => worktree.path === EPIC)?.heldBy).toBe('s-2')
    expect(worktrees.find((worktree) => worktree.path === shopPath)?.heldBy).toBeUndefined()
  })

  it('marks a worktree where a Claude session runs', async () => {
    const { spawner } = setUp({}, { terminals: [{ worktreePath: EPIC, agentIdentity: 'claude', connected: true }, { worktreePath: shopPath }] })
    const { worktrees } = await spawner.choices(db, 's-1')
    expect(worktrees.find((worktree) => worktree.path === EPIC)?.busy).toBe(true)
    expect(worktrees.find((worktree) => worktree.path === shopPath)?.busy).toBeUndefined()
  })

  it('gives the epic worktree when the start note of the epic names a path that still exists', async () => {
    const { spawner, io } = setUp({ bead: { parent: 'e-1' }, others: { 'e-1': { id: 'e-1', title: 'Checkout', status: 'in_progress', notes: `started 2026-10-15 08:00 in ${EPIC}` } } })
    expect((await spawner.choices(db, 's-1')).epic).toEqual({ id: 'e-1', path: EPIC })
    io.exists = (path) => path !== EPIC
    expect((await spawner.choices(db, 's-1')).epic).toBeUndefined()
  })

  it('tells the user when Orca cannot list the worktrees', async () => {
    const { spawner } = setUp({}, { worktreeList: orcaFailure('Orca is not running') })
    expect(await spawner.choices(db, 's-1')).toMatchObject({ worktrees: [], problem: expect.stringMatching(/Orca is not running/) })
  })
})
