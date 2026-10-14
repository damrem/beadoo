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
  const store = createStore(async (_command, args) => {
    if (args[3] === 'list') return listGate.then(() => listAnswer)
    if (args[3] === 'ready') return ok([{ id: 's-1' }])
    if (args[3] === 'show') return ok([{ id: args[4], title: 'Cart', status: 'open' }])
    return { status: 1, stdout: '', stderr: 'unexpected' }
  })
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

  it('refuses a write that comes without the page token', async () => {
    const response = await fetch(`${base}/api/x`, { method: 'POST', headers: { origin: base } })
    expect(response.status).toBe(403)
  })

  it('accepts the guard of a write from the page, but has no write route yet', async () => {
    const response = await fetch(`${base}/api/x`, {
      method: 'POST',
      headers: { origin: base, 'x-beads-token': token },
    })
    expect(response.status).toBe(404)
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
})
