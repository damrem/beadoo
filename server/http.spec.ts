import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunResult } from './process.ts'
import { createStore } from './beads-store.ts'
import { createHandler, MAX_BODY_BYTES } from './http.ts'
import { FAKE_EPIC_WORKTREE, FAKE_WORKTREE, FAKE_WORKTREE_ID, fakeOrca, orcaFailure } from './fake-orca.ts'
import { createCommits } from './commits.ts'
import { createSpawner } from './spawner.ts'
import { createTunnels } from './tunnels.ts'

const token = 'c'.repeat(64)
const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })

let server: Server
let base: string
let listAnswer: RunResult
let listGate: Promise<void>
let claimed: Set<string>
let writes: string[][]
let tunnelUp: boolean
let launches: string[][]
let tunnelAnswer: RunResult
let orca: ReturnType<typeof fakeOrca>
let orcaOnPath: boolean
let gitLog: RunResult
let added: { name: string; path: string }[]

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'beads-root-'))
  writeFileSync(join(root, 'secret.txt'), 'secret')
  const distDir = join(root, 'dist')
  mkdirSync(distDir)
  mkdirSync(join(distDir, 'assets'))
  writeFileSync(join(distDir, 'index.html'), '<html><head><title>beadoo</title></head><body></body></html>')
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log(1)')
  listAnswer = ok([{ id: 's-1', title: 'Cart', status: 'open' }])
  listGate = Promise.resolve()
  claimed = new Set()
  writes = []
  tunnelUp = false
  launches = []
  tunnelAnswer = { status: 0, stdout: '', stderr: '' }
  orca = fakeOrca('/home/me/shop')
  orcaOnPath = true
  gitLog = { status: 0, stdout: 'a1b2c3d4\tAdd the cart total\n', stderr: '' }
  added = []
  const store = createStore(
    async (command, args) => {
      if (command === 'git' && args.includes('config')) return { status: 0, stdout: 'Ann\n', stderr: '' }
      if (command === 'git') return { status: 0, stdout: '', stderr: '' }
      if (args[1] === '/home/me/remote' && !tunnelUp) {
        return {
          status: 1,
          stdout: '',
          stderr: 'Error: failed to open database: Dolt server unreachable at 127.0.0.1:3307: dial tcp 127.0.0.1:3307: connect: connection refused\n\nThe Dolt server may not be running.',
        }
      }
      if (args[4] === 'dep') {
        writes.push(args.slice(2))
        return ok({})
      }
      if (args[4] === 'update' || args[4] === 'unclaim' || args[4] === 'heartbeat') {
        writes.push(args.slice(2))
        if (args[5] === 's-7') return { status: 1, stdout: '', stderr: 'Error updating s-7: issue already claimed by Bob' }
        if (args[4] === 'update') claimed.add(args[5]!)
        if (args[4] === 'unclaim') claimed.delete(args[5]!)
        return ok([])
      }
      if (args[3] === 'list') return listGate.then(() => listAnswer)
      if (args[3] === 'ready') return ok([{ id: 's-1' }])
      if (args[3] === 'show' && args[4] === 's-3') {
        return ok([{ id: 's-3', title: 'Cart', status: 'open', metadata: { repoPath: '/home/me/shop', baselineSha: '465ab60' } }])
      }
      if (args[3] === 'show' && args[4] === 's-9') return { status: 1, stdout: '', stderr: 'Issue s-9 not found' }
      if (args[3] === 'show') {
        const status = claimed.has(args[4]!) ? 'in_progress' : 'open'
        return ok([{ id: args[4], title: 'Cart', status, ...(status === 'in_progress' ? { assignee: 'Ann' } : {}) }])
      }
      return { status: 1, stdout: '', stderr: 'unexpected' }
    },
    { env: {} },
  )
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  server.on(
    'request',
    createHandler({
      databases: () => [
        { name: 'shop', path: '/home/me/shop' },
        { name: 'win', path: '/mnt/c/x', refused: 'Use a WSL path' },
        { name: 'remote', path: '/home/me/remote', tunnel: { start: ['ssh', '-fN', 'db-host'], stop: ['pkill', 'ssh'] } },
      ],
      addDatabase: (entry) => {
        if (entry.path === '/home/me/empty') return 'The folder /home/me/empty holds no .beads folder'
        added.push(entry)
        return [{ name: 'shop', path: '/home/me/shop' }, entry]
      },
      store,
      spawner: createSpawner(store, orca.io),
      commits: createCommits(store, async (_command, args) => (args.includes('log') ? gitLog : { status: 0, stdout: '', stderr: '' })),
      get canSpawn() {
        return orcaOnPath
      },
      tunnels: createTunnels(
        async (command, args) => {
          launches.push([command, ...args])
          if (tunnelAnswer.status === 0) tunnelUp = true
          return tunnelAnswer
        },
        (command, args) => {
          launches.push([command, ...args])
          tunnelUp = false
          return { status: 0, stdout: '', stderr: '' }
        },
      ),
      distDir,
      origin: base,
      publicOrigin: 'https://feat-x.beadoo.localhost',
      token,
    }),
  )
})

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('the page server', () => {
  it('lists the databases of the config, with the refusal message', async () => {
    const body = await (await fetch(`${base}/api/databases`)).json()
    expect(body.databases).toEqual([
      { name: 'shop', path: '/home/me/shop' },
      { name: 'win', path: '/mnt/c/x', refused: 'Use a WSL path' },
      { name: 'remote', path: '/home/me/remote', hasTunnel: true },
    ])
  })

  it('tells the page whether Orca is on the PATH, so that the page can offer the spawn', async () => {
    expect((await (await fetch(`${base}/api/databases`)).json()).spawn).toBe(true)
    orcaOnPath = false
    expect((await (await fetch(`${base}/api/databases`)).json()).spawn).toBe(false)
  })

  describe('a repo that the user adds from the page', () => {
    const add = (body: unknown, headers: Record<string, string> = { origin: base, 'x-beads-token': token }) =>
      fetch(`${base}/api/databases`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) })

    it('adds the repo, and names it after its folder when the user gives no name', async () => {
      const response = await add({ path: '/home/me/cart/' })
      expect(response.status).toBe(200)
      expect((await response.json()).databases).toEqual([
        { name: 'shop', path: '/home/me/shop' },
        { name: 'cart', path: '/home/me/cart' },
      ])
      expect(added).toEqual([{ name: 'cart', path: '/home/me/cart' }])
    })

    it('keeps the name that the user gives', async () => {
      await add({ path: '/home/me/cart', name: ' Cart ' })
      expect(added).toEqual([{ name: 'Cart', path: '/home/me/cart' }])
    })

    it('tells the user why the config refuses the repo', async () => {
      const response = await add({ path: '/home/me/empty' })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'The folder /home/me/empty holds no .beads folder', code: 'INVALID' })
    })

    it('refuses a request with no folder', async () => {
      expect((await add({ name: 'cart' })).status).toBe(400)
      expect(added).toEqual([])
    })

    it('refuses a request without the page token', async () => {
      expect((await add({ path: '/home/me/cart' }, { origin: base })).status).toBe(403)
      expect(added).toEqual([])
    })
  })

  describe('a database on a Dolt server', () => {
    const start = (db: string, headers: Record<string, string> = { origin: base, 'x-beads-token': token }) =>
      fetch(`${base}/api/tunnel/start?db=${db}`, { method: 'POST', headers })

    it('tells the user that the database does not answer', async () => {
      const response = await fetch(`${base}/api/beads?db=remote`)
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({
        code: 'UNREACHABLE',
        error: expect.stringContaining('Dolt server unreachable at 127.0.0.1:3307'),
      })
    })

    it('opens the database after the user starts its tunnel', async () => {
      const response = await start('remote')
      expect(response.status).toBe(200)
      expect(launches).toEqual([['ssh', '-fN', 'db-host']])
      expect((await fetch(`${base}/api/beads?db=remote`)).status).toBe(200)
    })

    it('runs the start command of the config, and not a command from the request', async () => {
      const response = await fetch(`${base}/api/tunnel/start?db=remote&start=rm`, {
        method: 'POST',
        headers: { origin: base, 'x-beads-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ start: ['rm', '-rf', '/'] }),
      })
      expect(response.status).toBe(200)
      expect(launches).toEqual([['ssh', '-fN', 'db-host']])
    })

    it('refuses to start a tunnel without the page token', async () => {
      expect((await start('remote', { origin: base })).status).toBe(403)
      expect(launches).toEqual([])
    })

    it('tells the user that the config gives no tunnel for the database', async () => {
      const response = await start('shop')
      expect(response.status).toBe(400)
      expect((await response.json()).error).toContain('no tunnel for the database "shop"')
      expect(launches).toEqual([])
    })

    it('tells the user why the tunnel did not start', async () => {
      tunnelAnswer = { status: 255, stdout: '', stderr: 'ssh: Could not resolve hostname db-host' }
      const response = await start('remote')
      expect(response.status).toBe(500)
      expect((await response.json()).error).toContain('Could not resolve hostname db-host')
    })
  })

  it('gives the beads and the ready ids of the selected database', async () => {
    const body = await (await fetch(`${base}/api/beads?db=shop`)).json()
    expect(body).toEqual({ beads: [{ id: 's-1', title: 'Cart', status: 'open' }], readyIds: ['s-1'] })
  })

  it('reports a store that did not open as a service error, not as an empty board', async () => {
    listAnswer = ok([])
    const response = await fetch(`${base}/api/beads?db=shop`)
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('STORE_NOT_OPEN')
  })

  it('refuses to read a database on the Windows mount', async () => {
    const response = await fetch(`${base}/api/beads?db=win`)
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe('Use a WSL path')
  })

  it('tells the user when the database name is not in the config', async () => {
    expect((await fetch(`${base}/api/beads?db=nope`)).status).toBe(404)
  })

  it('gives the detail of one bead', async () => {
    const body = await (await fetch(`${base}/api/beads/s-1?db=shop`)).json()
    expect(body).toMatchObject({ id: 's-1', title: 'Cart' })
  })

  it('answers not found to the detail of a bead whose id has a broken escape', async () => {
    expect((await fetch(`${base}/api/beads/%E0?db=shop`)).status).toBe(404)
  })

  it('tells the user that the database has no bead with this id', async () => {
    const response = await fetch(`${base}/api/beads/s-9?db=shop`)
    expect(response.status).toBe(404)
    expect((await response.json()).code).toBe('NOT_FOUND')
  })

  it('refuses a write that comes without the page token', async () => {
    const response = await fetch(`${base}/api/x`, { method: 'POST', headers: { origin: base } })
    expect(response.status).toBe(403)
  })

  it('answers not found to a write that the page does not know', async () => {
    const response = await fetch(`${base}/api/beads/s-1/delete?db=shop`, {
      method: 'POST',
      headers: { origin: base, 'x-beads-token': token },
    })
    expect(response.status).toBe(404)
    expect(writes).toEqual([])
  })

  describe('the claim of a bead', () => {
    const post = (path: string, headers: Record<string, string> = { origin: base, 'x-beads-token': token }) =>
      fetch(`${base}${path}`, { method: 'POST', headers })

    it('claims the bead and answers with the claimed bead', async () => {
      const response = await post('/api/beads/s-1/claim?db=shop')
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ id: 's-1', status: 'in_progress', assignee: 'Ann' })
      expect(writes).toEqual([['--actor', 'Ann', 'update', 's-1', '--claim', '--json']])
    })

    it('releases the claim of the bead', async () => {
      await post('/api/beads/s-1/claim?db=shop')
      const response = await post('/api/beads/s-1/unclaim?db=shop')
      expect(await response.json()).toMatchObject({ id: 's-1', status: 'open' })
      expect(writes.at(-1)).toEqual(['--actor', 'Ann', 'unclaim', 's-1', '--json'])
    })

    it('renews the lease of the claim', async () => {
      const response = await post('/api/beads/s-1/renew?db=shop')
      expect(response.status).toBe(200)
      expect(writes).toEqual([['--actor', 'Ann', 'heartbeat', 's-1', '--json']])
    })

    const postAs = (name: string, path: string, origin: string) =>
      new Promise<number>((resolve, reject) => {
        const url = new URL(`${base}${path}`)
        request(
          url,
          { method: 'POST', headers: { host: `${name}:${url.port}`, origin, 'x-beads-token': token } },
          (response) => {
            response.resume()
            resolve(response.statusCode ?? 0)
          },
        )
          .on('error', reject)
          .end()
      })

    it('claims the bead from a page that the user opened on localhost', async () => {
      const port = new URL(base).port
      expect(await postAs('localhost', '/api/beads/s-1/claim?db=shop', `http://localhost:${port}`)).toBe(200)
      expect(writes).toEqual([['--actor', 'Ann', 'update', 's-1', '--claim', '--json']])
    })

    const postThrough = (host: string, path: string, origin: string) =>
      new Promise<number>((resolve, reject) => {
        request(`${base}${path}`, { method: 'POST', headers: { host, origin, 'x-beads-token': token } }, (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        })
          .on('error', reject)
          .end()
      })

    it('claims the bead from a page that the user opened on the portless URL of the worktree', async () => {
      expect(await postThrough('feat-x.beadoo.localhost', '/api/beads/s-1/claim?db=shop', 'https://feat-x.beadoo.localhost')).toBe(200)
      expect(writes).toEqual([['--actor', 'Ann', 'update', 's-1', '--claim', '--json']])
    })

    it('refuses a claim from the portless URL of another worktree, and writes nothing', async () => {
      expect(await postThrough('feat-y.beadoo.localhost', '/api/beads/s-1/claim?db=shop', 'https://feat-y.beadoo.localhost')).toBe(403)
      expect(writes).toEqual([])
    })

    it('refuses a claim whose origin is not the address of the request, and writes nothing', async () => {
      const port = new URL(base).port
      expect(await postAs('127.0.0.1', '/api/beads/s-1/claim?db=shop', `http://localhost:${port}`)).toBe(403)
      expect(writes).toEqual([])
    })

    it('refuses a claim that comes without the page token and writes nothing', async () => {
      const response = await post('/api/beads/s-1/claim?db=shop', { origin: base })
      expect(response.status).toBe(403)
      expect(writes).toEqual([])
    })

    it('tells the user that another actor holds the bead', async () => {
      const response = await post('/api/beads/s-7/claim?db=shop')
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'CONFLICT', error: expect.stringContaining('claimed by Bob') })
    })

    it('refuses to write to a database on the Windows mount', async () => {
      const response = await post('/api/beads/s-1/claim?db=win')
      expect(response.status).toBe(503)
      expect(writes).toEqual([])
    })

    it('answers not found to a claim of a bead whose id has a broken escape, and writes nothing', async () => {
      const response = await post('/api/beads/%E0/claim?db=shop')
      expect(response.status).toBe(404)
      expect(writes).toEqual([])
    })

    it('gives the name in which the page claims a bead', async () => {
      expect(await (await fetch(`${base}/api/actor?db=shop`)).json()).toEqual({ actor: 'Ann' })
    })
  })

  describe('the start of a session on a bead', () => {
    const spawn = (body: string, headers: Record<string, string> = { origin: base, 'x-beads-token': token }, db = 'shop') =>
      fetch(`${base}/api/beads/s-1/spawn?db=${db}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body })

    it('claims the bead, starts the session and answers with the worktree and the terminal', async () => {
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        bead: { id: 's-1', status: 'in_progress' },
        worktree: FAKE_WORKTREE_ID,
        path: FAKE_WORKTREE,
        branch: 'feat/s-1-cart',
        terminal: 'term_new',
      })
      expect(writes[0]).toEqual(['--actor', 'Ann', 'update', 's-1', '--claim', '--json'])
      expect(orca.calls.some((call) => call.startsWith('orca worktree create --repo id:repo-1 --name feat/s-1-cart'))).toBe(true)
    })

    it('refuses a start on a bead that is already in progress, and claims nothing', async () => {
      claimed.add('s-1')
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }))
      expect(response.status).toBe(409)
      expect((await response.json()).code).toBe('CONFLICT')
      expect(writes).toEqual([])
      expect(orca.calls).toEqual([])
    })

    it('refuses a start that comes without the page token, and claims nothing', async () => {
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }), { origin: base })
      expect(response.status).toBe(403)
      expect(writes).toEqual([])
      expect(orca.calls).toEqual([])
    })

    it('refuses a start with no branch, and claims nothing', async () => {
      const response = await spawn('{}')
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('INVALID')
      expect(writes).toEqual([])
    })

    it('refuses a branch that is not a type and a slug, and claims nothing', async () => {
      const response = await spawn(JSON.stringify({ branch: 'feat/$(rm -rf ~)' }))
      expect(response.status).toBe(400)
      expect(writes).toEqual([])
      expect(orca.calls).toEqual([])
    })

    it('refuses to start a session from a database on the Windows mount', async () => {
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }), undefined, 'win')
      expect(response.status).toBe(503)
      expect(writes).toEqual([])
    })

    it('answers the other requests of the page while Orca creates the worktree', async () => {
      let finish!: () => void
      orca.overrides.worktreeGate = new Promise((resolve) => {
        finish = resolve
      })
      const started = spawn(JSON.stringify({ branch: 'feat/s-1-cart' }))
      await vi.waitFor(() => expect(orca.calls.some((call) => call.startsWith('orca worktree create'))).toBe(true))
      const list = await fetch(`${base}/api/beads?db=shop`)
      expect(list.status).toBe(200)
      finish()
      expect((await started).status).toBe(200)
    })

    it('gives the worktrees that the user can choose for a new session', async () => {
      const response = await fetch(`${base}/api/beads/s-1/spawn-choices?db=shop`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        repo: '/home/me/shop',
        worktrees: [
          { path: '/home/me/shop', branch: 'main', main: true },
          { path: FAKE_EPIC_WORKTREE, branch: 'feat/e-1-checkout', parent: '/home/me/shop' },
        ],
      })
    })

    it('starts a session in the existing worktree that the user chose', async () => {
      const response = await spawn(JSON.stringify({ kind: 'existing', target: FAKE_EPIC_WORKTREE, location: 'worktree', mode: 'default' }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ path: FAKE_EPIC_WORKTREE, session: FAKE_EPIC_WORKTREE, kind: 'existing', mode: 'default' })
      expect(orca.calls.some((call) => call.startsWith('orca worktree create'))).toBe(false)
    })

    it('refuses a worktree kind that the page does not know, and claims nothing', async () => {
      const response = await spawn(JSON.stringify({ kind: 'remote', location: 'worktree', mode: 'plan' }))
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID', error: expect.stringMatching(/worktree kind/) })
      expect(writes).toEqual([])
    })

    it('tells the user why the session did not start, and that the bead is open again', async () => {
      orca.overrides.create = orcaFailure('Timed out')
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }))
      expect(response.status).toBe(502)
      expect(await response.json()).toMatchObject({ code: 'SPAWN_FAILED', error: expect.stringMatching(/Timed out[\s\S]*s-1 is open again/) })
      expect(writes.map((write) => write[2])).toContain('unclaim')
    })

    it('refuses to start a session when Orca is not on the PATH, and claims nothing', async () => {
      orcaOnPath = false
      const response = await spawn(JSON.stringify({ branch: 'feat/s-1-cart' }))
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ code: 'REFUSED', error: 'Orca is not on the PATH, so the page starts no session.' })
      expect(writes).toEqual([])
      expect(orca.calls).toEqual([])
    })

    it('gives no worktree choices when Orca is not on the PATH', async () => {
      orcaOnPath = false
      const response = await fetch(`${base}/api/beads/s-1/spawn-choices?db=shop`)
      expect(response.status).toBe(503)
      expect(orca.calls).toEqual([])
    })
  })

  describe('the edit of a bead', () => {
    const send = (body: string, headers: Record<string, string> = { origin: base, 'x-beads-token': token }) =>
      fetch(`${base}/api/beads/s-1/edit?db=shop`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body })

    it('writes the change of the user and answers with the bead', async () => {
      const response = await send(JSON.stringify({ version: '|', changes: { title: 'Basket' } }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ id: 's-1' })
      expect(writes).toEqual([['--actor', 'Ann', 'update', 's-1', '--title=Basket', '--json']])
    })

    it('refuses an edit that comes without the page token and writes nothing', async () => {
      const response = await send(JSON.stringify({ version: '|', changes: { title: 'Basket' } }), { origin: base })
      expect(response.status).toBe(403)
      expect(writes).toEqual([])
    })

    it('refuses an edit that is not valid JSON and writes nothing', async () => {
      const response = await send('{"version":')
      expect(response.status).toBe(400)
      expect((await response.json()).code).toBe('INVALID')
      expect(writes).toEqual([])
    })

    it('refuses an edit of a field that the page does not edit, and writes nothing', async () => {
      const response = await send(JSON.stringify({ version: '|', changes: { assignee: 'Bob' } }))
      expect(response.status).toBe(400)
      expect(writes).toEqual([])
    })

    it('refuses two complexity labels with the reason, and writes nothing', async () => {
      const response = await send(JSON.stringify({ version: '|', changes: { labels: ['complexity:1', 'complexity:2'] } }))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toMatch(/one complexity label only/)
      expect(writes).toEqual([])
    })

    it('refuses an edit that is too large, and writes nothing', async () => {
      const response = await send(JSON.stringify({ version: '|', changes: { notes: 'x'.repeat(MAX_BODY_BYTES) } }))
      expect(response.status).toBe(413)
      expect(writes).toEqual([])
    })

    it('answers with the bead of the database when the server wrote a part of the edit, then failed', async () => {
      const response = await fetch(`${base}/api/beads/s-7/edit?db=shop`, {
        method: 'POST',
        headers: { origin: base, 'x-beads-token': token, 'content-type': 'application/json' },
        body: JSON.stringify({ version: '|', changes: { title: 'Basket', dependencies: ['s-2'] } }),
      })
      expect(response.status).toBe(500)
      expect(await response.json()).toMatchObject({ code: 'PARTIAL_WRITE', bead: { id: 's-7' } })
      expect(writes.map((write) => write[2])).toEqual(['dep', 'update'])
    })

    it('answers a conflict with the bead of the database when somebody changed it after the page read it', async () => {
      const response = await send(JSON.stringify({ version: 'old|1', changes: { title: 'Basket' } }))
      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({ code: 'STALE', bead: { id: 's-1', title: 'Cart' } })
      expect(writes).toEqual([])
    })
  })

  it('puts the page token in the page', async () => {
    const html = await (await fetch(`${base}/`)).text()
    expect(html).toContain(`<meta name="beads-token" content="${token}" />`)
  })

  it('serves the page at the address of a bead, also when the bead id holds a dot', async () => {
    const response = await fetch(`${base}/bead?db=shop&id=s-1.2`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('<title>beadoo</title>')
  })

  it('serves the built files of the page', async () => {
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe('console.log(1)')
  })

  it('does not serve a file outside the built page', async () => {
    const response = await fetch(`${base}/assets/..%2F..%2Fsecret.txt`)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('secret')
  })

  it('refuses a request from a web site whose name points at this machine', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const url = new URL(`${base}/api/beads?db=shop`)
      request(url, { headers: { host: `evil.example:${url.port}` } }, (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      })
        .on('error', reject)
        .end()
    })
    expect(status).toBe(403)
  })

  it('answers another request while bd still reads a database', async () => {
    let open = () => {}
    listGate = new Promise<void>((resolve) => {
      open = resolve
    })
    const slow = fetch(`${base}/api/beads?db=shop`)
    const databases = await fetch(`${base}/api/databases`)
    expect(databases.status).toBe(200)
    open()
    expect((await slow).status).toBe(200)
  })

  it('answers not found to an address with a broken escape', async () => {
    const response = await fetch(`${base}/%E0%A4%A`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  describe('the commits since the baseline sha of a bead', () => {
    it('lists the sha and the subject of each commit since the baseline', async () => {
      const response = await fetch(`${base}/api/beads/s-3/commits?db=shop`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ commits: [{ sha: 'a1b2c3d4', subject: 'Add the cart total' }] })
    })

    it('tells the user that the bead names no repo path', async () => {
      const response = await fetch(`${base}/api/beads/s-1/commits?db=shop`)
      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ code: 'INVALID', error: 'The bead s-1 names no repo path.' })
    })

    it('tells the user why git could not list the commits', async () => {
      gitLog = { status: 128, stdout: '', stderr: 'fatal: bad revision' }
      const response = await fetch(`${base}/api/beads/s-3/commits?db=shop`)
      expect(response.status).toBe(500)
      expect((await response.json()).error).toContain('fatal: bad revision')
    })
  })
})
