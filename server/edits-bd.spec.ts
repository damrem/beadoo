import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realRun, realRunAsync, runChecked } from '../../../lib/process.ts'
import type { RunAsync, RunOptions } from '../../../lib/process.ts'
import { INVALID, STALE } from '../shared/contract.ts'
import type { Bead } from '../shared/contract.ts'
import { blockersOf, versionOf } from '../shared/edit.ts'
import type { EditRequest } from '../shared/edit.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('BEADS_')))
const options = (extra: RunOptions = {}): RunOptions => ({ timeoutMs: 30_000, ...extra, env })
const run: RunAsync = (command, args, extra) => realRunAsync(command, args, options(extra))
const sh = (command: string, args: string[], cwd?: string) => runChecked(realRun, command, args, options({ cwd }))

const hasBd = realRun('bd', ['version'], options()).status === 0 && realRun('git', ['version'], options()).status === 0

describe.skipIf(!hasBd)('an edit from the page in a real bd database', () => {
  let db: { name: string; path: string }
  let id: string
  let epic: string
  let other: string
  const store = () => createStore(run, { env: { BEADS_ACTOR: 'Ann' }, now: () => new Date(2026, 9, 15, 12, 30) })

  const shown = (beadId: string): Bead =>
    (JSON.parse(sh('bd', ['-C', db.path, '--readonly', 'show', beadId, '--json'])) as Bead[])[0]!

  const create = (title: string, ...flags: string[]) =>
    (JSON.parse(sh('bd', ['-C', db.path, 'create', title, ...flags, '--json'])) as Bead).id

  const editNow = (request: Omit<EditRequest, 'version'>) =>
    store().editBead(db, id, { version: versionOf(shown(id)), ...request })

  beforeAll(() => {
    const path = mkdtempSync(join(tmpdir(), 'beads-edit-real-'))
    db = { name: 'scratch', path }
    sh('git', ['init', '-q'], path)
    sh('bd', ['init', '--prefix', 't', '--quiet', '--skip-agents', '--skip-hooks', '--non-interactive'], path)
    epic = create('Checkout', '-t', 'epic')
    id = create('Cart total', '-l', 'front,complexity:2', '--notes', '2026-10-14 10:00 started')
    other = create('Pay button')
    sh('bd', ['-C', path, 'export', '-o', join(path, EXPORT_FILE)])
    sh('git', ['-C', path, 'add', '--', EXPORT_FILE])
  }, 120_000)

  afterAll(() => {
    if (db) rmSync(db.path, { recursive: true, force: true })
  })

  it('changes the title, the priority, the type and the description, and bd show gives them', { timeout: 60_000 }, async () => {
    await editNow({ changes: { title: 'Basket total', priority: 1, issue_type: 'bug', description: 'Line one\nLine two' } })
    expect(shown(id)).toMatchObject({ title: 'Basket total', priority: 1, issue_type: 'bug', description: 'Line one\nLine two' })
  })

  it('changes the labels and keeps one complexity label, and bd show gives them', { timeout: 60_000 }, async () => {
    await editNow({ changes: { labels: ['back', 'complexity:3'] } })
    expect([...(shown(id).labels ?? [])].sort()).toEqual(['back', 'complexity:3'])
  })

  it('adds a note entry with a date stamp, then replaces the notes, and bd show gives them', { timeout: 60_000 }, async () => {
    await editNow({ changes: {}, noteEntry: 'paused' })
    expect(shown(id).notes).toBe('2026-10-14 10:00 started\n2026-10-15 12:30 paused')
    await editNow({ changes: { notes: 'free text' } })
    expect(shown(id).notes).toBe('free text')
  })

  it('sets the parent and a dependency, then removes them, and bd show gives them', { timeout: 60_000 }, async () => {
    await editNow({ changes: { parent: epic, dependencies: [other] } })
    expect(shown(id).parent).toBe(epic)
    expect(blockersOf(shown(id))).toEqual([other])
    await editNow({ changes: { parent: '', dependencies: [] } })
    expect(shown(id).parent ?? '').toBe('')
    expect(blockersOf(shown(id))).toEqual([])
  })

  it('changes the status, closes the bead with a reason and opens it again', { timeout: 60_000 }, async () => {
    await editNow({ changes: { status: 'blocked' } })
    expect(shown(id).status).toBe('blocked')
    await editNow({ changes: { status: 'closed' }, closeReason: 'Shipped' })
    expect(shown(id)).toMatchObject({ status: 'closed', close_reason: 'Shipped' })
    await editNow({ changes: { status: 'open' } })
    expect(shown(id).status).toBe('open')
  })

  it('exports the beads after the edit', { timeout: 60_000 }, async () => {
    await editNow({ changes: { title: 'Cart total' } })
    const lines = readFileSync(join(db.path, EXPORT_FILE), 'utf8').split('\n').filter((line) => line.trim() !== '')
    expect(lines).toHaveLength(3)
    expect(lines.some((line) => line.includes('"title":"Cart total"'))).toBe(true)
  })

  it('refuses the edit and gives the new bead when bd in a terminal changed it after the page read it', { timeout: 60_000 }, async () => {
    const read = versionOf(shown(id))
    sh('bd', ['-C', db.path, 'update', id, '--title', 'Changed in a terminal', '--json'])
    const error = await store()
      .editBead(db, id, { version: read, changes: { title: 'Mine' } })
      .catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: STALE, bead: { id, title: 'Changed in a terminal' } })
    expect(shown(id).title).toBe('Changed in a terminal')
  })

  it('tells the user when a dependency names a bead that the database does not have', { timeout: 60_000 }, async () => {
    await expect(editNow({ changes: { dependencies: ['t-zzz'] } })).rejects.toThrow(expect.objectContaining({ code: INVALID }))
  })
})
