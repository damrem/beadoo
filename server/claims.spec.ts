import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunAsync, RunResult } from '../../../lib/process.ts'
import { CONFLICT, EXPORT_MISMATCH, NOT_FOUND, REFUSED, STORE_NOT_OPEN } from '../shared/contract.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'

const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const text = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' })
const failed = (stderr: string): RunResult => ({ status: 1, stdout: '', stderr })

const SUBCOMMANDS = ['update', 'unclaim', 'heartbeat', 'export', 'list', 'show', 'ready', 'config', 'ls-files']

type Fake = {
  tracked: boolean
  gitUser: string
  exportLines: number
  listed: number
  answers: Partial<Record<string, RunResult | (() => Promise<RunResult>)>>
}

function fakeTools(overrides: Partial<Fake> = {}) {
  const fake: Fake = { tracked: true, gitUser: 'Ann', exportLines: 2, listed: 2, answers: {}, ...overrides }
  const calls: string[][] = []
  const run: RunAsync = async (command, args) => {
    calls.push([command, ...args])
    const sub = args.find((arg) => SUBCOMMANDS.includes(arg)) ?? ''
    const answer = fake.answers[sub]
    if (answer) return typeof answer === 'function' ? answer() : answer
    if (sub === 'config') return fake.gitUser ? text(`${fake.gitUser}\n`) : failed('')
    if (sub === 'ls-files') return text(fake.tracked ? `${EXPORT_FILE}\n` : '')
    if (sub === 'export') {
      writeFileSync(args[args.indexOf('-o') + 1]!, '{"id":"x"}\n'.repeat(fake.exportLines))
      return text('Exported')
    }
    if (sub === 'list') return ok(Array.from({ length: fake.listed }, (_, index) => ({ id: `s-${index}` })))
    if (sub === 'show') return ok([{ id: args[args.indexOf('show') + 1], title: 'Cart', status: 'in_progress', assignee: 'Ann' }])
    if (sub === 'update' || sub === 'unclaim' || sub === 'heartbeat') return ok([])
    return failed(`unexpected ${command} ${args.join(' ')}`)
  }
  return { run, calls, fake }
}

let db: { name: string; path: string }

beforeEach(() => {
  const path = mkdtempSync(join(tmpdir(), 'beads-claims-'))
  mkdirSync(join(path, '.beads'))
  db = { name: 'shop', path }
})

const bdCalls = (calls: string[][]) => calls.filter((call) => call[0] === 'bd').map((call) => call.slice(1))
const subOf = (call: string[]) => call.find((arg) => SUBCOMMANDS.includes(arg))

describe('a claim from the page', () => {
  it('claims the bead in the name of the git user of the database and gives the claimed bead', async () => {
    const { run, calls } = fakeTools()
    const bead = await createStore(run, { env: {} }).writeClaim(db, 's-1', 'claim')
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, '--actor', 'Ann', 'update', 's-1', '--claim', '--json'])
    expect(bead).toMatchObject({ id: 's-1', status: 'in_progress', assignee: 'Ann' })
  })

  it('claims in the name that BEADS_ACTOR gives, before the git user', async () => {
    const { run, calls } = fakeTools()
    await createStore(run, { env: { BEADS_ACTOR: 'agent-7' } }).writeClaim(db, 's-1', 'claim')
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, '--actor', 'agent-7', 'update', 's-1', '--claim', '--json'])
  })

  it('claims in the name of the system user when the database has no git user', async () => {
    const { run, calls } = fakeTools({ gitUser: '' })
    await createStore(run, { env: { USER: 'damien' } }).writeClaim(db, 's-1', 'claim')
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, '--actor', 'damien', 'update', 's-1', '--claim', '--json'])
  })

  it('gives the name in which the page claims a bead', async () => {
    const { run } = fakeTools()
    expect(await createStore(run, { env: {} }).actor(db)).toBe('Ann')
  })

  it('releases the claim of the bead', async () => {
    const { run, calls } = fakeTools()
    await createStore(run, { env: {} }).writeClaim(db, 's-1', 'unclaim')
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, '--actor', 'Ann', 'unclaim', 's-1', '--json'])
  })

  it('renews the lease of the claim and does not export, because a heartbeat changes no tracked data', async () => {
    const { run, calls } = fakeTools()
    await createStore(run, { env: {} }).writeClaim(db, 's-1', 'renew')
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, '--actor', 'Ann', 'heartbeat', 's-1', '--json'])
    expect(bdCalls(calls).some((call) => subOf(call) === 'export')).toBe(false)
  })

  it('exports the beads to the tracked file after a claim and compares the count to the database', async () => {
    const { run, calls } = fakeTools()
    await createStore(run, { env: {} }).writeClaim(db, 's-1', 'claim')
    const subs = bdCalls(calls).map(subOf)
    expect(subs.slice(0, 3)).toEqual(['update', 'export', 'list'])
    expect(bdCalls(calls)).toContainEqual(['-C', db.path, 'export', '-o', join(db.path, EXPORT_FILE)])
  })

  it('does not export when the repo of the database does not track the export file', async () => {
    const { run, calls } = fakeTools({ tracked: false })
    await createStore(run, { env: {} }).writeClaim(db, 's-1', 'claim')
    expect(bdCalls(calls).some((call) => subOf(call) === 'export')).toBe(false)
  })

  it('reports an error when the export file and the database do not hold the same count of beads', async () => {
    const { run } = fakeTools({ exportLines: 2, listed: 3 })
    await expect(createStore(run, { env: {} }).writeClaim(db, 's-1', 'claim')).rejects.toThrow(
      expect.objectContaining({ code: EXPORT_MISMATCH, message: expect.stringContaining('holds 2 lines and bd list gives 3 beads') }),
    )
  })

  it('reports a store that did not open when the database gives no bead after the export', async () => {
    const { run } = fakeTools({ listed: 0 })
    await expect(createStore(run, { env: {} }).writeClaim(db, 's-1', 'unclaim')).rejects.toThrow(
      expect.objectContaining({ code: STORE_NOT_OPEN }),
    )
  })

  it('reports a bead that another actor holds as a conflict', async () => {
    const { run } = fakeTools({
      answers: { update: failed('Error updating s-1: issue already claimed by Bob') },
    })
    await expect(createStore(run, { env: {} }).writeClaim(db, 's-1', 'claim')).rejects.toThrow(
      expect.objectContaining({ code: CONFLICT, message: expect.stringContaining('already claimed by Bob') }),
    )
  })

  it('reports a bead that the database does not have as not found', async () => {
    const { run } = fakeTools({ answers: { unclaim: failed('Error: issue s-9 not found') } })
    await expect(createStore(run, { env: {} }).writeClaim(db, 's-9', 'unclaim')).rejects.toThrow(
      expect.objectContaining({ code: NOT_FOUND }),
    )
  })

  it('starts the next write only when the export of the previous write is done', async () => {
    let endFirst = () => {}
    let updates = 0
    const { run, calls } = fakeTools({
      answers: {
        update: () => {
          updates += 1
          if (updates > 1) return Promise.resolve(ok([]))
          return new Promise((resolve) => {
            endFirst = () => resolve(ok([]))
          })
        },
      },
    })
    const store = createStore(run, { env: {} })
    const first = store.writeClaim(db, 's-1', 'claim')
    const second = store.writeClaim(db, 's-2', 'claim')
    await vi.waitFor(() => expect(updates).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(updates).toBe(1)
    endFirst()
    await Promise.all([first, second])
    const order = bdCalls(calls)
      .map(subOf)
      .filter((sub) => sub === 'update' || sub === 'export')
    expect(order).toEqual(['update', 'export', 'update', 'export'])
  })

  it('does the next write when the previous write fails', async () => {
    let updates = 0
    const { run } = fakeTools({
      answers: {
        update: async () => {
          updates += 1
          return updates === 1 ? failed('Error: database is locked') : ok([])
        },
      },
    })
    const store = createStore(run, { env: {} })
    const first = store.writeClaim(db, 's-1', 'claim')
    const second = store.writeClaim(db, 's-2', 'claim')
    await expect(first).rejects.toThrow('database is locked')
    await expect(second).resolves.toMatchObject({ id: 's-2' })
  })

  it('does not write to a database on the Windows mount', async () => {
    const { run, calls } = fakeTools()
    await expect(
      createStore(run, { env: {} }).writeClaim({ ...db, refused: 'Use a WSL path' }, 's-1', 'claim'),
    ).rejects.toThrow(expect.objectContaining({ code: REFUSED }))
    expect(calls).toEqual([])
  })

  it('does not pass an id that looks like an option to bd', async () => {
    const { run, calls } = fakeTools()
    await expect(createStore(run, { env: {} }).writeClaim(db, '--force', 'unclaim')).rejects.toThrow(
      expect.objectContaining({ code: NOT_FOUND }),
    )
    expect(calls).toEqual([])
  })
})
