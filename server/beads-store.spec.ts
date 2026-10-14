import type { RunAsync, RunResult } from '../../../lib/process.ts'
import { createStore, STORE_NOT_OPEN } from './beads-store.ts'

const db = { name: 'shop', path: '/home/me/shop' }
const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })

function fakeBd(answers: Record<string, RunResult>) {
  const calls: string[][] = []
  const run: RunAsync = async (_command, args) => {
    calls.push([...args])
    const sub = args[3] ?? ''
    return answers[sub] ?? { status: 1, stdout: '', stderr: `unexpected ${args.join(' ')}` }
  }
  return { run, calls }
}

describe('the beads that the page reads', () => {
  it('gives all the beads of the database and marks the ready ones', async () => {
    const { run } = fakeBd({
      list: ok([
        { id: 's-1', title: 'Cart', status: 'open' },
        { id: 's-2', title: 'Pay', status: 'open', parent: 's-1' },
      ]),
      ready: ok([{ id: 's-2', title: 'Pay', status: 'open' }]),
    })
    const result = await createStore(run).listBeads(db)
    expect(result.beads.map((bead) => bead.id)).toEqual(['s-1', 's-2'])
    expect(result.readyIds).toEqual(['s-2'])
  })

  it('reads the database in read-only mode and never writes to it', async () => {
    const { run, calls } = fakeBd({ list: ok([{ id: 's-1', title: 'Cart', status: 'open' }]), ready: ok([]) })
    await createStore(run).listBeads(db)
    expect(calls).toEqual([
      ['-C', '/home/me/shop', '--readonly', 'list', '--all', '-n', '0', '--json'],
      ['-C', '/home/me/shop', '--readonly', 'ready', '-n', '0', '--json'],
    ])
  })

  it('reports a store that did not open instead of an empty board', async () => {
    const { run } = fakeBd({ list: ok([]), ready: ok([]) })
    await expect(createStore(run).listBeads(db)).rejects.toThrow(expect.objectContaining({ code: STORE_NOT_OPEN }))
  })

  it('reports the error that bd prints when the database path is wrong', async () => {
    const { run } = fakeBd({ list: { status: 1, stdout: '', stderr: 'Error: cannot use -C directory' } })
    await expect(createStore(run).listBeads(db)).rejects.toThrow('cannot use -C directory')
  })

  it('does not read a database on the Windows mount', async () => {
    const { run, calls } = fakeBd({})
    const refused = { ...db, refused: 'Use a WSL path' }
    await expect(createStore(run).listBeads(refused)).rejects.toThrow('Use a WSL path')
    expect(calls).toEqual([])
  })

  it('gives one bead with its parent and its dependencies', async () => {
    const { run } = fakeBd({
      show: ok([{ id: 's-2', title: 'Pay', status: 'open', parent: 's-1', dependencies: [{ id: 's-1' }] }]),
    })
    expect(await createStore(run).showBead(db, 's-2')).toMatchObject({ parent: 's-1', dependencies: [{ id: 's-1' }] })
  })

  it('reports a bead that the database does not have as not found', async () => {
    const { run } = fakeBd({
      show: { status: 1, stdout: '', stderr: 'Issue s-9 not found\nHint: this ID may have never existed' },
    })
    await expect(createStore(run).showBead(db, 's-9')).rejects.toThrow(expect.objectContaining({ code: 'NOT_FOUND' }))
  })
})
