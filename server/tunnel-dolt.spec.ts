import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { Server } from 'node:http'
import { createServer as createTcpServer, connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { realRun, realRunAsync, runChecked } from './process.ts'
import type { RunAsync, RunOptions } from './process.ts'
import type { Bead } from '../shared/contract.ts'
import { createStore, EXPORT_FILE } from './beads-store.ts'
import { fakeOrca } from './fake-orca.ts'
import { createCommits } from './commits.ts'
import { createSpawner } from './spawner.ts'
import type { ConfiguredDatabase } from './config-rules.ts'
import { createHandler } from './http.ts'
import { createTunnels } from './tunnels.ts'
import type { Tunnels } from './tunnels.ts'

const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('BEADS_')))
const options = (extra: RunOptions = {}): RunOptions => ({ timeoutMs: 60_000, ...extra, env })
const run: RunAsync = (command, args, extra) => realRunAsync(command, args, options(extra))
const sh = (command: string, args: string[], cwd?: string) => runChecked(realRun, command, args, options({ cwd }))

const hasTools =
  realRun('bd', ['version'], options()).status === 0 &&
  realRun('git', ['version'], options()).status === 0 &&
  realRun('dolt', ['version'], options()).status === 0

const token = 'd'.repeat(64)

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const probe = createTcpServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

const answers = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

const START_SCRIPT = `
import { openSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
const [port, data, pidFile, log] = process.argv.slice(2)
const out = openSync(log, 'a')
const child = spawn('dolt', ['sql-server', '--host', '127.0.0.1', '--port', port, '--data-dir', data], { detached: true, stdio: ['ignore', out, out] })
writeFileSync(pidFile, String(child.pid))
child.unref()
const open = () => new Promise((resolve) => {
  const socket = connect(Number(port), '127.0.0.1')
  socket.once('connect', () => { socket.destroy(); resolve(true) })
  socket.once('error', () => resolve(false))
})
for (let i = 0; i < 300; i += 1) {
  if (await open()) process.exit(0)
  await new Promise((resolve) => setTimeout(resolve, 100))
}
process.exit(1)
`

describe.skipIf(!hasTools)('a database on a real Dolt server behind a tunnel', () => {
  let root: string
  let port: number
  let db: ConfiguredDatabase
  let tunnels: Tunnels
  let server: Server
  let base: string

  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`)
    return { status: response.status, body: (await response.json()) as Record<string, unknown> }
  }

  const post = (path: string): Promise<{ status: number; body: Record<string, unknown> }> =>
    new Promise((resolve, reject) => {
      const req = request(`${base}${path}`, { method: 'POST', headers: { origin: base, 'x-beads-token': token } }, (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => {
          text += chunk.toString('utf8')
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(text) as Record<string, unknown> }))
      })
      req.on('error', reject)
      req.end()
    })

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'beads-dolt-'))
    port = await freePort()
    const data = join(root, 'dolt-data')
    const path = join(root, 'repo')
    mkdirSync(data)
    mkdirSync(path)
    const script = join(root, 'start-dolt.mjs')
    const pidFile = join(root, 'dolt.pid')
    writeFileSync(script, START_SCRIPT)
    db = {
      name: 'remote',
      path,
      tunnel: {
        start: [process.execPath, script, String(port), data, pidFile, join(root, 'dolt.log')],
        stop: ['sh', '-c', 'kill "$(cat "$1")"', 'stop-dolt', pidFile],
      },
    }
    const [command, ...args] = db.tunnel!.start
    sh(command!, args)
    sh('git', ['init', '-q'], path)
    sh(
      'bd',
      ['init', '--prefix', 'r', '--server', '--external', '--server-port', String(port), '--quiet', '--skip-agents', '--skip-hooks', '--non-interactive'],
      path,
    )
    sh('bd', ['-C', path, 'create', 'Cart total', '--json'])
    sh('bd', ['-C', path, 'export', '-o', join(path, EXPORT_FILE)])
    sh('git', ['-C', path, 'add', '--', EXPORT_FILE])
    rmSync(join(path, EXPORT_FILE))
    const [stop, ...stopArgs] = db.tunnel!.stop
    sh(stop!, stopArgs)
    for (let i = 0; i < 100 && (await answers(port)); i += 1) await new Promise((resolve) => setTimeout(resolve, 100))

    tunnels = createTunnels()
    server = createServer()
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const distDir = join(root, 'dist')
    mkdirSync(distDir)
    const store = createStore(run, { env: { BEADS_ACTOR: 'Ann' } })
    server.on(
      'request',
      createHandler({
        databases: () => [db],
        store,
        tunnels,
        spawner: createSpawner(store, fakeOrca(root).io),
        commits: createCommits(store, async () => ({ status: 1, stdout: '', stderr: 'unexpected' })),
        canSpawn: true,
        distDir,
        origin: base,
        token,
      }),
    )
  }, 180_000)

  afterAll(async () => {
    tunnels?.stopAll()
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    if (root) rmSync(root, { recursive: true, force: true })
  })

  it(
    'shows the database as unreachable, opens it after a start from the page, and stops the tunnel with the server',
    { timeout: 180_000 },
    async () => {
      const before = await get('/api/beads?db=remote')
      expect(before.status).toBe(503)
      expect(before.body.code).toBe('UNREACHABLE')

      expect((await post('/api/tunnel/start?db=remote')).status).toBe(200)
      const opened = await get('/api/beads?db=remote')
      expect(opened.status).toBe(200)
      const [bead] = (opened.body.beads as Bead[]).filter((entry) => entry.title === 'Cart total')
      expect(bead).toBeDefined()

      const claim = await post(`/api/beads/${bead!.id}/claim?db=remote`)
      expect(claim.status).toBe(200)
      expect(claim.body).toMatchObject({ status: 'in_progress', assignee: 'Ann' })
      expect(existsSync(join(db.path, EXPORT_FILE))).toBe(false)

      expect(tunnels.stopAll()).toEqual([])
      let open = true
      for (let i = 0; i < 100 && open; i += 1) {
        open = await answers(port)
        if (open) await new Promise((resolve) => setTimeout(resolve, 100))
      }
      expect(open).toBe(false)
      expect((await get('/api/beads?db=remote')).body.code).toBe('UNREACHABLE')
    },
  )
})
