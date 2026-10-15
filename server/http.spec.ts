import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RunResult } from '../../../lib/process.ts'
import { createStore } from './beads-store.ts'
import { createHandler } from './http.ts'

const token = 'c'.repeat(64)
const ok = (value: unknown): RunResult => ({ status: 0, stdout: JSON.stringify(value), stderr: '' })

let server: Server
let base: string
let listAnswer: RunResult
let listGate: Promise<void>
let claimed: Set<string>
let writes: string[][]

beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'beads-root-'))
  writeFileSync(join(root, 'secret.txt'), 'secret')
  const distDir = join(root, 'dist')
  mkdirSync(distDir)
  mkdirSync(join(distDir, 'assets'))
  writeFileSync(join(distDir, 'index.html'), '<html><head><title>Beads</title></head><body></body></html>')
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log(1)')
  listAnswer = ok([{ id: 's-1', title: 'Cart', status: 'open' }])
  listGate = Promise.resolve()
  claimed = new Set()
  writes = []
  const store = createStore(
    async (command, args) => {
      if (command === 'git' && args.includes('config')) return { status: 0, stdout: 'Ann\n', stderr: '' }
      if (command === 'git') return { status: 0, stdout: '', stderr: '' }
      if (args[4] === 'update' || args[4] === 'unclaim' || args[4] === 'heartbeat') {
        writes.push(args.slice(2))
        if (args[5] === 's-7') return { status: 1, stdout: '', stderr: 'Error updating s-7: issue already claimed by Bob' }
        if (args[4] === 'update') claimed.add(args[5]!)
        if (args[4] === 'unclaim') claimed.delete(args[5]!)
        return ok([])
      }
      if (args[3] === 'list') return listGate.then(() => listAnswer)
      if (args[3] === 'ready') return ok([{ id: 's-1' }])
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
      ],
      store,
      distDir,
      origin: base,
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
    ])
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

  it('puts the page token in the page', async () => {
    const html = await (await fetch(`${base}/`)).text()
    expect(html).toContain(`<meta name="beads-token" content="${token}" />`)
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
})
