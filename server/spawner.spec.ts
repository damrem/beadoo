import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunAsync, RunResult } from '../../../lib/process.ts'
import { CONFLICT, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED } from '../shared/contract.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'
import { FAKE_WORKTREE as WORKTREE, FAKE_WORKTREE_ID as WORKTREE_ID, fakeOrca, orcaFailure } from './fake-orca.ts'
import type { OrcaOverrides } from './fake-orca.ts'
import { createSpawner } from './spawner.ts'

const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const text = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' })

type Bd = { status: string; assignee?: string; notes: string }

type BdOverrides = { claim?: RunResult; unclaim?: RunResult; note?: RunResult; exportAfter?: string; bead?: Partial<Bd>; showAfterNote?: RunResult }

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
    if (sub === 'list') return ok([{ id: 's-1' }])
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

const setUp = (bdOverrides: BdOverrides = {}, orcaOverrides: OrcaOverrides = {}) => {
  const events: string[] = []
  const bd = fakeBd(shopPath, bdOverrides, events)
  const orca = fakeOrca(shopPath, orcaOverrides, events)
  const store = createStore(bd.run, { env: {}, now })
  return { ...bd, ...orca, events, spawner: createSpawner(store, orca.io, now) }
}

describe('a session that the page starts on a bead', () => {
  it('claims the bead before it creates the worktree, then starts Claude in a new terminal of the worktree', async () => {
    const { spawner, events, calls } = setUp()
    const session = await spawner.spawn(db, 's-1', 'feat/s-1-cart')
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
    await spawner.spawn(db, 's-1', 'feat/s-1-cart')
    const create = calls.find((call) => call.startsWith('orca worktree create'))!
    expect(create).toContain('--repo id:repo-1')
    expect(create).toContain('--no-parent')
    expect(calls).toContain(`git -C ${WORKTREE} branch -m feat-s-1-cart feat/s-1-cart`)
  })

  it('writes the start and the worktree path in the notes of the bead, and gives the claimed bead', async () => {
    const { spawner } = setUp()
    const session = await spawner.spawn(db, 's-1', 'feat/s-1-cart')
    expect(session.bead).toMatchObject({ status: 'in_progress', assignee: 'Ann', notes: `started 2026-10-16 09:05 in ${WORKTREE}` })
    expect(session.warning).toBeUndefined()
  })

  it('refuses a bead that the user already holds, and keeps the claim of the first session', async () => {
    const { spawner, writes, calls, bead } = setUp({ bead: { status: 'in_progress', assignee: 'Ann' } }, { create: orcaFailure('Timed out') })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ code: CONFLICT, message: expect.stringMatching(/s-1 is in_progress[\s\S]*Ann holds it/) }),
    )
    expect(writes).toEqual([])
    expect(calls).toEqual([])
    expect(bead).toMatchObject({ status: 'in_progress', assignee: 'Ann' })
  })

  it('refuses a closed bead, and writes nothing', async () => {
    const { spawner, writes, calls } = setUp({ bead: { status: 'closed' } })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(expect.objectContaining({ code: CONFLICT }))
    expect(writes).toEqual([])
    expect(calls).toEqual([])
  })

  it('creates no worktree when another actor holds the bead', async () => {
    const { spawner, calls } = setUp({ claim: { status: 1, stdout: '', stderr: 'Error: issue already claimed by Bob' } })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(expect.objectContaining({ code: CONFLICT }))
    expect(calls.filter((call) => call.startsWith('orca'))).toEqual([])
  })

  it('gives the bead back as open, and starts no session, when the export fails after the claim', async () => {
    const { spawner, writes, calls, bead } = setUp({ exportAfter: 'claim' })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/bd export failed[\s\S]*s-1 is open again/) }),
    )
    expect(writes.map((write) => write[0])).toEqual(['update', 'unclaim'])
    expect(calls.filter((call) => call.startsWith('orca'))).toEqual([])
    expect(bead).toMatchObject({ status: 'open', notes: '' })
  })

  it('gives the bead back as open, and keeps no note, when Orca does not know the repo of the database', async () => {
    const { spawner, writes, bead } = setUp({}, { repos: [{ id: 'other', path: '/home/me/other' }] })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/orca repo add --path '[^']*beads-spawn-[^']*'[\s\S]*s-1 is open again/) }),
    )
    expect(writes.map((write) => write[0])).toEqual(['update', 'unclaim'])
    expect(bead).toMatchObject({ status: 'open', notes: '' })
  })

  it('gives the bead back as open and names the worktree that stays when Orca cannot start the terminal', async () => {
    const { spawner, bead } = setUp({}, { create: orcaFailure('Timed out waiting for terminal handle') })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(new RegExp(`Timed out[\\s\\S]*open again\\. The worktree ${WORKTREE} stays`)) }),
    )
    expect(bead.status).toBe('open')
    expect(bead.notes).toMatch(/^released 2026-10-16 09:05: no session started in [\s\S]*Timed out/)
  })

  it('gives the bead back and names the worktree that stays when git cannot rename the branch of the new worktree', async () => {
    const { spawner, bead } = setUp({}, { rename: { status: 128, stdout: '', stderr: "fatal: a branch named 'feat/s-1-cart' already exists" } })
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(new RegExp(`already exists[\\s\\S]*open again\\. The worktree ${WORKTREE} stays`)) }),
    )
    expect(bead.status).toBe('open')
    expect(bead.notes).toContain(`released 2026-10-16 09:05: no session started in ${WORKTREE}. Cause: git -C failed (exit 128): fatal: a branch named`)
  })

  it('tells the user that the bead is open again, and keeps the released note, when the export fails after the release', async () => {
    const { spawner, bead } = setUp({ exportAfter: 'unclaim' }, { send: orcaFailure('terminal is gone') })
    const failure = spawner.spawn(db, 's-1', 'feat/s-1-cart')
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
    await expect(spawner.spawn(db, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ code: SPAWN_FAILED, message: expect.stringMatching(/could not give the bead s-1 back[\s\S]*Release the claim/) }),
    )
  })

  it('gives the session and a warning when the session runs but the note of the start fails', async () => {
    const { spawner } = setUp({ note: { status: 1, stdout: '', stderr: 'Error: database is locked' } })
    const session = await spawner.spawn(db, 's-1', 'feat/s-1-cart')
    expect(session).toMatchObject({ terminal: 'term_new', bead: { status: 'in_progress' } })
    expect(session.warning).toMatch(/The session runs, but the page could not write the note/)
  })

  it('gives the session and the claimed bead when bd stops to answer after the start', async () => {
    const down: RunResult = { status: 1, stdout: '', stderr: 'Error: database is locked' }
    const { spawner } = setUp({ note: down, showAfterNote: down })
    const session = await spawner.spawn(db, 's-1', 'feat/s-1-cart')
    expect(session).toMatchObject({ path: WORKTREE, terminal: 'term_new', bead: { id: 's-1', status: 'in_progress', assignee: 'Ann' } })
    expect(session.warning).toMatch(/The session runs, but the page could not write the note/)
  })

  it('refuses a branch that is not a type and a slug, and writes nothing', async () => {
    const { spawner, writes, calls } = setUp()
    await expect(spawner.spawn(db, 's-1', '--force')).rejects.toThrow(expect.objectContaining({ code: INVALID }))
    expect(writes).toEqual([])
    expect(calls).toEqual([])
  })

  it('refuses a bead id that bd cannot have, and writes nothing', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn(db, '-s 1', 'feat/s-1-cart')).rejects.toThrow(expect.objectContaining({ code: NOT_FOUND }))
    expect(writes).toEqual([])
  })

  it('refuses to start a session from a database on the Windows mount', async () => {
    const { spawner, writes } = setUp()
    await expect(spawner.spawn({ ...db, refused: 'Use a WSL path' }, 's-1', 'feat/s-1-cart')).rejects.toThrow(
      expect.objectContaining({ code: REFUSED }),
    )
    expect(writes).toEqual([])
  })

  it('starts one session only when the user asks twice for the same bead', async () => {
    const { spawner, calls } = setUp()
    const results = await Promise.allSettled([spawner.spawn(db, 's-1', 'feat/s-1-cart'), spawner.spawn(db, 's-1', 'feat/s-1-cart')])
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((results[1] as PromiseRejectedResult).reason).toMatchObject({ code: CONFLICT })
    expect(calls.filter((call) => call.startsWith('orca worktree create'))).toHaveLength(1)
  })
})
