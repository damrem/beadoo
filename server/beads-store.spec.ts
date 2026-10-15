import type { RunAsync, RunResult } from '../../../lib/process.ts'
import { NOT_FOUND, STORE_NOT_OPEN, UNREACHABLE } from '../shared/contract.ts'
import { createStore } from './beads-store.ts'

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
    expect(calls).toEqual(
      expect.arrayContaining([
        ['-C', '/home/me/shop', '--readonly', 'list', '--all', '-n', '0', '--json'],
        ['-C', '/home/me/shop', '--readonly', 'ready', '-n', '0', '--json'],
      ]),
    )
    expect(calls).toHaveLength(2)
  })

  it('shows the board after one wait for the database, and not after two waits in a row', async () => {
    let endList = () => {}
    const started: string[] = []
    const run: RunAsync = async (_command, args) => {
      started.push(args[3] ?? '')
      if (args[3] === 'list') {
        await new Promise<void>((resolve) => {
          endList = resolve
        })
      }
      return ok([{ id: 's-1', title: 'Cart', status: 'open' }])
    }
    const result = createStore(run).listBeads(db)
    await vi.waitFor(() => expect(started).toEqual(expect.arrayContaining(['list', 'ready'])))
    endList()
    expect((await result).readyIds).toEqual(['s-1'])
  })

  it('reports the error that bd prints when the beads are there but the read of the ready beads fails', async () => {
    const { run } = fakeBd({
      list: ok([{ id: 's-1', title: 'Cart', status: 'open' }]),
      ready: { status: 1, stdout: '', stderr: 'Error: ready query failed' },
    })
    await expect(createStore(run).listBeads(db)).rejects.toThrow('ready query failed')
  })

  it('reports a store that did not open, and not the ready error, when both reads fail', async () => {
    const { run } = fakeBd({ list: ok([]), ready: { status: 1, stdout: '', stderr: 'Error: no database' } })
    await expect(createStore(run).listBeads(db)).rejects.toThrow(expect.objectContaining({ code: STORE_NOT_OPEN }))
  })

  it('reports a store that did not open instead of an empty board', async () => {
    const { run } = fakeBd({ list: ok([]), ready: ok([]) })
    await expect(createStore(run).listBeads(db)).rejects.toThrow(expect.objectContaining({ code: STORE_NOT_OPEN }))
  })

  it('tells the user that the database on a Dolt server does not answer, and not that the store is empty', async () => {
    const down = {
      status: 1,
      stdout: '',
      stderr: 'Error: failed to open database: Dolt server unreachable at 127.0.0.1:3307: dial tcp 127.0.0.1:3307: connect: connection refused\n\nThe Dolt server may not be running. Try:\n  bd dolt start',
    }
    const { run } = fakeBd({ list: down, ready: down })
    await expect(createStore(run).listBeads(db)).rejects.toThrow(
      expect.objectContaining({
        code: UNREACHABLE,
        message: 'The database "shop" does not answer: Dolt server unreachable at 127.0.0.1:3307: dial tcp 127.0.0.1:3307: connect: connection refused. Start its tunnel or its Dolt server.',
      }),
    )
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
    await expect(createStore(run).showBead(db, 's-9')).rejects.toThrow(expect.objectContaining({ code: NOT_FOUND }))
  })

  it('does not pass an id that looks like an option to bd', async () => {
    const { run, calls } = fakeBd({})
    await expect(createStore(run).showBead(db, '--db=/other/path')).rejects.toThrow(
      expect.objectContaining({ code: NOT_FOUND }),
    )
    expect(calls).toEqual([])
  })
})
