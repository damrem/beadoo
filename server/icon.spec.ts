import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from './beads-store.ts'
import { fakeOrca } from './fake-orca.ts'
import { createHandler } from './http.ts'
import { createSpawner } from './spawner.ts'
import { createTunnels } from './tunnels.ts'

const app = join(import.meta.dirname, '..')

let server: Server
let base: string

beforeEach(async () => {
  const distDir = join(mkdtempSync(join(tmpdir(), 'beadoo-icon-')), 'dist')
  mkdirSync(distDir)
  copyFileSync(join(app, 'index.html'), join(distDir, 'index.html'))
  copyFileSync(join(app, 'public', 'favicon.svg'), join(distDir, 'favicon.svg'))
  const store = createStore(async () => ({ status: 1, stdout: '', stderr: 'unexpected' }), { env: {} })
  server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  server.on(
    'request',
    createHandler({
      databases: () => [],
      store,
      spawner: createSpawner(store, fakeOrca('/home/me/shop').io),
      canSpawn: true,
      tunnels: createTunnels(
        async () => ({ status: 0, stdout: '', stderr: '' }),
        () => ({ status: 0, stdout: '', stderr: '' }),
      ),
      distDir,
      origin: base,
      token: 'c'.repeat(64),
    }),
  )
})

afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())))

const iconOf = async (page: string): Promise<Response> => {
  const html = await (await fetch(page)).text()
  const href = /<link rel="icon"[^>]*href="([^"]+)"/.exec(html)?.[1]
  expect(href).toBeDefined()
  return fetch(new URL(href!, page))
}

describe('the tab icon of the page', () => {
  it('shows the logo in the tab of the board', async () => {
    const response = await iconOf(`${base}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    expect(await response.text()).toContain('<svg')
  })

  it('shows the logo in the tab of a bead page', async () => {
    const response = await iconOf(`${base}/bead?db=shop&id=s-1.2`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('shows the logo in the tab of a page at a deeper address', async () => {
    const response = await iconOf(`${base}/a/b/bead?db=shop&id=s-1`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })
})
