import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunAsync, RunResult } from '../../../lib/process.ts'
import { BEADS_DELETED, INVALID, NOT_FOUND, REFUSED, STALE } from '../shared/contract.ts'
import type { Bead } from '../shared/contract.ts'
import { versionOf } from '../shared/edit.ts'
import type { EditRequest } from '../shared/edit.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'

const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })
const text = (stdout: string): RunResult => ({ status: 0, stdout, stderr: '' })
const failed = (stderr: string): RunResult => ({ status: 1, stdout: '', stderr })

const WRITES = ['update', 'dep', 'close']

const stored: Bead = {
  id: 's-1',
  title: 'Cart',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['front', 'complexity:2'],
  parent: 's-0',
  description: 'Show the cart.',
  notes: '2026-10-14 10:00 started',
  dependencies: [
    { id: 's-0', dependency_type: 'parent-child' },
    { id: 's-5', dependency_type: 'blocks' },
  ],
  updated_at: '2026-10-15T10:00:00Z',
  revision: '41',
}

const version = versionOf(stored)

type Answer = RunResult | ((args: readonly string[]) => Promise<RunResult>)

function fakeTools(answers: Partial<Record<string, Answer>> = {}, bead: Bead = stored) {
  const calls: string[][] = []
  const run: RunAsync = async (command, args) => {
    calls.push([command, ...args])
    if (command === 'git' && args.includes('config')) return text('Ann\n')
    if (command === 'git') return text(`${EXPORT_FILE}\n`)
    const sub = args.find((arg) => [...WRITES, 'export', 'list', 'show'].includes(arg)) ?? ''
    const answer = answers[sub]
    if (answer) return typeof answer === 'function' ? answer(args) : answer
    if (sub === 'export') {
      writeFileSync(args[args.indexOf('-o') + 1]!, '{"id":"x"}\n'.repeat(2))
      return text('Exported')
    }
    if (sub === 'list') return ok([{ id: 's-0' }, { id: 's-1' }])
    if (sub === 'show') return ok([bead])
    if (WRITES.includes(sub)) return ok({})
    return failed(`unexpected ${command} ${args.join(' ')}`)
  }
  return { run, calls }
}

let db: { name: string; path: string }

beforeEach(() => {
  const path = mkdtempSync(join(tmpdir(), 'beads-edits-'))
  mkdirSync(join(path, '.beads'))
  db = { name: 'shop', path }
})

const now = () => new Date(2026, 9, 15, 12, 30)

const writes = (calls: string[][]) =>
  calls
    .filter((call) => call[0] === 'bd' && WRITES.includes(call[5] ?? ''))
    .map((call) => call.slice(5, -1))

const edit = async (request: Partial<EditRequest>, answers = {}, bead = stored) => {
  const { run, calls } = fakeTools(answers, bead)
  const result = await createStore(run, { env: {}, now }).editBead(db, 's-1', { version, changes: {}, ...request })
  return { result, calls }
}

describe('an edit from the page', () => {
  it('changes the title, the priority and the type in one bd update, in the name of the page user', async () => {
    const { calls } = await edit({ changes: { title: 'Basket', priority: 1, issue_type: 'bug' } })
    expect(calls.filter((call) => call[0] === 'bd' && call.includes('update'))).toEqual([
      ['bd', '-C', db.path, '--actor', 'Ann', 'update', 's-1', '--title=Basket', '--priority=1', '--type=bug', '--json'],
    ])
  })

  it('keeps a text that starts with a dash as the value of its field', async () => {
    const { calls } = await edit({ changes: { description: '--force is not a flag here' } })
    expect(writes(calls)).toEqual([['update', 's-1', '--description=--force is not a flag here']])
  })

  it('writes only the fields that differ from the database', async () => {
    const { calls } = await edit({ changes: { title: 'Cart', labels: ['complexity:2', 'front'] } })
    expect(writes(calls)).toEqual([])
    expect(calls.some((call) => call.includes('export'))).toBe(false)
  })

  it('adds and removes the labels that the user changed', async () => {
    const { calls } = await edit({ changes: { labels: ['back', 'complexity:3'] } })
    expect(writes(calls)).toEqual([
      ['update', 's-1', '--add-label=back', '--add-label=complexity:3', '--remove-label=complexity:2', '--remove-label=front'],
    ])
  })

  it('refuses two complexity labels and writes nothing', async () => {
    const { run, calls } = fakeTools()
    await expect(
      createStore(run, { env: {}, now }).editBead(db, 's-1', { version, changes: { labels: ['complexity:1', 'complexity:2'] } }),
    ).rejects.toThrow(expect.objectContaining({ code: INVALID, message: expect.stringContaining('one complexity label only') }))
    expect(writes(calls)).toEqual([])
  })

  it('replaces the notes with the text of a free edit', async () => {
    const { calls } = await edit({ changes: { notes: 'new text' } })
    expect(writes(calls)).toEqual([['update', 's-1', '--notes=new text']])
  })

  it('adds a note entry with the date and the time of the server under the old notes', async () => {
    const { calls } = await edit({ noteEntry: 'paused for the review' })
    expect(writes(calls)).toEqual([['update', 's-1', '--notes=2026-10-14 10:00 started\n2026-10-15 12:30 paused for the review']])
  })

  it('moves the bead to another parent, or removes its parent', async () => {
    expect(writes((await edit({ changes: { parent: 's-9' } })).calls)).toEqual([['update', 's-1', '--parent=s-9']])
    expect(writes((await edit({ changes: { parent: '' } })).calls)).toEqual([['update', 's-1', '--parent=']])
  })

  it('adds and removes the dependencies that the user changed', async () => {
    const { calls } = await edit({ changes: { dependencies: ['s-6'] } })
    expect(writes(calls)).toEqual([
      ['dep', 'add', 's-1', 's-6'],
      ['dep', 'remove', 's-1', 's-5'],
    ])
  })

  it('keeps the old dependency and changes nothing when the new dependency names a bead that the database does not have', async () => {
    const { run, calls } = fakeTools({
      show: async (args) => (args.includes('s-99') ? failed('Error: no issue found matching "s-99"') : ok([stored])),
    })
    await expect(
      createStore(run, { env: {}, now }).editBead(db, 's-1', { version, changes: { title: 'Basket', dependencies: ['s-99'] } }),
    ).rejects.toThrow(expect.objectContaining({ code: INVALID, message: expect.stringContaining('s-99') }))
    expect(writes(calls)).toEqual([])
  })

  it('changes nothing when the new parent names a bead that the database does not have', async () => {
    const { run, calls } = fakeTools({
      show: async (args) => (args.includes('s-98') ? failed('Error: no issue found matching "s-98"') : ok([stored])),
    })
    await expect(
      createStore(run, { env: {}, now }).editBead(db, 's-1', { version, changes: { parent: 's-98', title: 'Basket' } }),
    ).rejects.toThrow(expect.objectContaining({ code: INVALID, message: expect.stringContaining('s-98') }))
    expect(writes(calls)).toEqual([])
  })

  it('closes the bead with the reason of the user', async () => {
    const { calls } = await edit({ changes: { status: 'closed' }, closeReason: 'Shipped in 1.2' })
    expect(writes(calls)).toEqual([['close', 's-1', '--reason=Shipped in 1.2']])
  })

  it('refuses to close a bead with no reason', async () => {
    await expect(edit({ changes: { status: 'closed' } })).rejects.toThrow(expect.objectContaining({ code: INVALID }))
  })

  it('reopens a closed bead with a status change', async () => {
    const { calls } = await edit({ changes: { status: 'open' } }, {}, { ...stored, status: 'closed' })
    expect(writes(calls)).toEqual([['update', 's-1', '--status=open']])
  })

  it('exports the beads once after all the changes of the edit', async () => {
    const { calls } = await edit({ changes: { title: 'Basket', dependencies: [] } })
    const order = calls.filter((call) => call[0] === 'bd').map((call) => call.find((arg) => [...WRITES, 'export'].includes(arg)))
    expect(order.filter(Boolean)).toEqual(['dep', 'update', 'export'])
  })

  it('refuses the edit and gives the bead of the database when somebody changed it after the page read it', async () => {
    const changed = { ...stored, title: 'Basket', revision: '42' }
    const { run, calls } = fakeTools({}, changed)
    const error = await createStore(run, { env: {}, now })
      .editBead(db, 's-1', { version, changes: { priority: 0 } })
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: STALE, bead: { title: 'Basket' } })
    expect(writes(calls)).toEqual([])
  })

  it('tells the user the cause when a dependency names a bead that the database does not have', async () => {
    await expect(
      edit({ changes: { dependencies: ['s-5', 's-99'] } }, { dep: failed('Error: no issue found matching "s-99"') }),
    ).rejects.toThrow(expect.objectContaining({ code: INVALID, message: expect.stringContaining('s-99') }))
  })

  it('keeps the title, the priority and the notes as they were when bd refuses to close the bead', async () => {
    const { run, calls } = fakeTools({ close: failed('cannot close s-1: 1 open child issue(s); close children first') })
    const error = await createStore(run, { env: {}, now })
      .editBead(db, 's-1', {
        version,
        changes: { title: 'Basket', priority: 0, status: 'closed' },
        closeReason: 'Done',
        noteEntry: 'shipped',
      })
      .catch((caught: Error) => caught)
    expect((error as Error).message).toMatch(/^bd close failed.*1 open child/)
    expect(writes(calls)).toEqual([['close', 's-1', '--reason=Done']])
    expect(calls.some((call) => call.includes('export'))).toBe(false)
  })

  it('says how much of the edit is done, and exports, when a later change fails', async () => {
    const { run, calls } = fakeTools({ close: failed('cannot close blocked issue: s-1 is blocked by [s-6]') })
    const error = await createStore(run, { env: {}, now })
      .editBead(db, 's-1', { version, changes: { dependencies: ['s-5', 's-6'], status: 'closed' }, closeReason: 'Done' })
      .catch((caught: Error) => caught)
    expect((error as Error).message).toMatch(/^The page wrote 1 of 2 changes of the edit, then bd close failed.*blocked by \[s-6\]/)
    expect(calls.some((call) => call.includes('export'))).toBe(true)
  })

  it('reports the beads that bd deleted during the edit, and does not export the smaller database', async () => {
    const { run, calls } = fakeTools({
      update: { status: 0, stdout: '{}', stderr: 'auto-export: reconciled 1 deleted issue(s) (deleted from store: s-4)\n' },
    })
    await expect(
      createStore(run, { env: {}, now }).editBead(db, 's-1', { version, changes: { title: 'Basket' } }),
    ).rejects.toThrow(expect.objectContaining({ code: BEADS_DELETED }))
    expect(calls.some((call) => call.includes('export'))).toBe(false)
  })

  it('does not start an edit before the claim before it is exported', async () => {
    let endClaim = () => {}
    const { run, calls } = fakeTools({
      update: () =>
        calls.filter((call) => call.includes('update')).length > 1
          ? Promise.resolve(ok({}))
          : new Promise((resolve) => {
              endClaim = () => resolve(ok({}))
            }),
    })
    const store = createStore(run, { env: {}, now })
    const claim = store.writeClaim(db, 's-1', 'claim')
    const change = store.editBead(db, 's-1', { version, changes: { title: 'Basket' } })
    await vi.waitFor(() => expect(calls.some((call) => call.includes('update'))).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls.some((call) => call.includes('show'))).toBe(false)
    endClaim()
    await Promise.all([claim, change])
    const order = calls.filter((call) => call[0] === 'bd').map((call) => call.find((arg) => ['update', 'export', 'show'].includes(arg)))
    expect(order.filter((sub) => sub !== 'show' && sub !== undefined)).toEqual(['update', 'export', 'update', 'export'])
    expect(order.indexOf('show')).toBeGreaterThan(order.indexOf('export'))
  })

  it('does not write to a database on the Windows mount', async () => {
    const { run, calls } = fakeTools()
    await expect(
      createStore(run, { env: {} }).editBead({ ...db, refused: 'Use a WSL path' }, 's-1', { version, changes: { title: 'x' } }),
    ).rejects.toThrow(expect.objectContaining({ code: REFUSED }))
    expect(calls).toEqual([])
  })

  it('refuses a bead id that starts with a dash as not found, and changes nothing', async () => {
    const { run, calls } = fakeTools()
    await expect(
      createStore(run, { env: {} }).editBead(db, '--all', { version, changes: { title: 'x' } }),
    ).rejects.toThrow(expect.objectContaining({ code: NOT_FOUND }))
    expect(calls).toEqual([])
  })
})
