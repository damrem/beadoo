import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realRun, realRunAsync, runChecked } from '../../../lib/process.ts'
import type { RunAsync, RunOptions } from '../../../lib/process.ts'
import { CONFLICT, NOT_FOUND } from '../shared/contract.ts'
import type { Bead } from '../shared/contract.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('BEADS_')))
const options = (extra: RunOptions = {}): RunOptions => ({ timeoutMs: 30_000, ...extra, env })
const run: RunAsync = (command, args, extra) => realRunAsync(command, args, options(extra))
const sh = (command: string, args: string[], cwd?: string) => runChecked(realRun, command, args, options({ cwd }))

const hasBd = realRun('bd', ['version'], options()).status === 0 && realRun('git', ['version'], options()).status === 0

describe.skipIf(!hasBd)('a claim from the page in a real bd database', () => {
  let db: { name: string; path: string }
  let id: string

  const shown = (beadId: string): Bead =>
    (JSON.parse(sh('bd', ['-C', db.path, '--readonly', 'show', beadId, '--json'])) as Bead[])[0]!

  beforeAll(() => {
    const path = mkdtempSync(join(tmpdir(), 'beads-real-'))
    db = { name: 'scratch', path }
    sh('git', ['init', '-q'], path)
    sh('bd', ['init', '--prefix', 't', '--quiet', '--skip-agents', '--skip-hooks', '--non-interactive'], path)
    id = (JSON.parse(sh('bd', ['-C', path, 'create', 'Cart total', '--json'])) as Bead).id
    sh('bd', ['-C', path, 'create', 'Pay button', '--json'])
    sh('bd', ['-C', path, 'export', '-o', join(path, EXPORT_FILE)])
    sh('git', ['-C', path, 'add', '--', EXPORT_FILE])
  }, 120_000)

  afterAll(() => {
    if (db) rmSync(db.path, { recursive: true, force: true })
  })

  it('claims the bead, and bd show gives the claim of the page user', { timeout: 60_000 }, async () => {
    const bead = await createStore(run, { env: { BEADS_ACTOR: 'Ann' } }).writeClaim(db, id, 'claim')
    expect(bead).toMatchObject({ id, status: 'in_progress', assignee: 'Ann' })
    expect(shown(id)).toMatchObject({ status: 'in_progress', assignee: 'Ann' })
    const lines = readFileSync(join(db.path, EXPORT_FILE), 'utf8').split('\n').filter((line) => line.trim() !== '')
    expect(lines).toHaveLength(2)
  })

  it('reports a bead that another actor holds as a conflict', { timeout: 60_000 }, async () => {
    await expect(createStore(run, { env: { BEADS_ACTOR: 'Bob' } }).writeClaim(db, id, 'claim')).rejects.toThrow(
      expect.objectContaining({ code: CONFLICT, message: expect.stringContaining('claimed by Ann') }),
    )
  })

  it('renews the lease and then releases the claim', { timeout: 60_000 }, async () => {
    const store = createStore(run, { env: { BEADS_ACTOR: 'Ann' } })
    await expect(store.writeClaim(db, id, 'renew')).resolves.toMatchObject({ id, assignee: 'Ann' })
    await expect(store.writeClaim(db, id, 'unclaim')).resolves.toMatchObject({ id, status: 'open' })
    expect(shown(id).assignee).toBeUndefined()
  })

  it('adds a line to the notes of the bead and keeps the notes that it had', { timeout: 60_000 }, async () => {
    const store = createStore(run, { env: { BEADS_ACTOR: 'Ann' } })
    await store.appendNote(db, id, 'first line')
    const bead = await store.appendNote(db, id, 'started 2026-10-16 09:05 in /home/me/wt')
    expect(bead.notes).toContain('first line')
    expect(bead.notes).toContain('started 2026-10-16 09:05 in /home/me/wt')
    expect(shown(id).notes).toContain('started 2026-10-16 09:05 in /home/me/wt')
  })

  it('claims an epic that has an open child, and bd show gives the claim of the page user', { timeout: 60_000 }, async () => {
    const epic = (JSON.parse(sh('bd', ['-C', db.path, 'create', 'Checkout', '--type', 'epic', '--json'])) as Bead).id
    sh('bd', ['-C', db.path, 'create', 'Card form', '--parent', epic, '--json'])
    const bead = await createStore(run, { env: { BEADS_ACTOR: 'Ann' } }).writeClaim(db, epic, 'claim')
    expect(bead).toMatchObject({ id: epic, issue_type: 'epic', status: 'in_progress', assignee: 'Ann' })
    expect(shown(epic)).toMatchObject({ status: 'in_progress', assignee: 'Ann' })
  })

  it.each(['claim', 'unclaim', 'renew'] as const)(
    'reports a bead that the database does not have as not found when the user asks to %s it',
    { timeout: 60_000 },
    async (action) => {
      await expect(createStore(run, { env: { BEADS_ACTOR: 'Ann' } }).writeClaim(db, 't-zzz', action)).rejects.toThrow(
        expect.objectContaining({ code: NOT_FOUND }),
      )
    },
  )
})
