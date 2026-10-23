import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { CLAIM_ACTIONS, CONFLICT, DATABASES_ROUTE, INVALID, NOT_FOUND, REFUSED, SPAWN_FAILED, STALE, STORE_NOT_OPEN, TUNNEL_ROUTE, UNKNOWN_ERROR, UNREACHABLE } from '../shared/contract.ts'
import type { ClaimAction } from '../shared/contract.ts'
import { isEditRequest } from '../shared/edit.ts'
import { readSpawnRequest } from '../shared/spawn.ts'
import { StoreError } from './beads-store.ts'
import type { Store } from './beads-store.ts'
import { publicEntry, readDatabaseRequest } from './config-rules.ts'
import { ORCA_MISSING } from './orca-rules.ts'
import type { ConfiguredDatabase, NewDatabase } from './config-rules.ts'
import type { Commits } from './commits.ts'
import type { Spawner } from './spawner.ts'
import type { Tunnels } from './tunnels.ts'
import { allowsWrite } from './guard.ts'

export type AppDeps = {
  databases: () => ConfiguredDatabase[]
  addDatabase: (entry: NewDatabase) => ConfiguredDatabase[] | string
  store: Store
  tunnels: Tunnels
  spawner: Spawner
  commits: Commits
  canSpawn: boolean
  distDir: string
  origin: string
  token: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
}

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const statusOf = (error: unknown): number => {
  if (!(error instanceof StoreError)) return 500
  if (error.code === STORE_NOT_OPEN || error.code === REFUSED || error.code === UNREACHABLE) return 503
  if (error.code === NOT_FOUND) return 404
  if (error.code === CONFLICT || error.code === STALE) return 409
  if (error.code === INVALID) return 400
  if (error.code === SPAWN_FAILED) return 502
  return 500
}

export const withToken = (html: string, token: string): string =>
  html.replace('</head>', `  <meta name="beads-token" content="${token}" />\n  </head>`)

const WRITE_ROUTE = /^\/api\/beads\/([^/]+)\/([a-z]+)$/

export const MAX_BODY_BYTES = 1024 * 1024

type WriteAction = ClaimAction | 'edit' | 'spawn'

const isWriteAction = (value: string | undefined): value is WriteAction =>
  value === 'edit' || value === 'spawn' || (CLAIM_ACTIONS as readonly string[]).includes(value ?? '')

const readBody = (req: IncomingMessage): Promise<string | null> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= MAX_BODY_BYTES) chunks.push(chunk)
    })
    req.on('end', () => resolve(size > MAX_BODY_BYTES ? null : Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })

const parsedBody = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const decoded = (text: string): string | null => {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

const writeRoute = (pathname: string): { id: string; action: WriteAction } | null => {
  const match = WRITE_ROUTE.exec(pathname)
  const id = match?.[1] ? decoded(match[1]) : null
  const action = match?.[2]
  return id !== null && isWriteAction(action) ? { id, action } : null
}

async function serveFile(res: ServerResponse, deps: AppDeps, pathname: string) {
  const path = decoded(pathname)
  if (path === null) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  const relative = normalize(path).replace(/^([/\\])+/, '')
  const file = join(deps.distDir, relative === '' ? 'index.html' : relative)
  if (file !== deps.distDir && !file.startsWith(deps.distDir + sep)) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  const target = extname(file) === '' ? join(deps.distDir, 'index.html') : file
  try {
    const body = await readFile(target)
    const type = CONTENT_TYPES[extname(target)] ?? 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(type.startsWith('text/html') ? withToken(body.toString('utf8'), deps.token) : body)
  } catch {
    sendJson(res, 404, { error: 'Not found' })
  }
}

export function createHandler(deps: AppDeps) {
  const page = new URL(deps.origin)
  const hosts = new Set([page.host, `localhost:${page.port}`])
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const host = req.headers.host ?? ''
    if (!hosts.has(host)) {
      sendJson(res, 403, { error: 'Forbidden: the request needs the page host' })
      return
    }
    const url = new URL(req.url ?? '/', deps.origin)
    const write = req.method !== 'GET' && req.method !== 'HEAD'
    if (write && !allowsWrite(req.headers, `${page.protocol}//${host}`, deps.token)) {
      sendJson(res, 403, { error: 'Forbidden: the request needs the page origin and the page token' })
      return
    }
    const tunnelStart = write && req.method === 'POST' && url.pathname === TUNNEL_ROUTE
    const databaseAdd = write && req.method === 'POST' && url.pathname === DATABASES_ROUTE
    const target = write && req.method === 'POST' ? writeRoute(url.pathname) : null
    if (write && !target && !tunnelStart && !databaseAdd) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    if (!url.pathname.startsWith('/api/')) {
      await serveFile(res, deps, url.pathname)
      return
    }

    try {
      if (databaseAdd) {
        const text = await readBody(req)
        const entry = text === null ? `The request is larger than ${MAX_BODY_BYTES} bytes` : readDatabaseRequest(parsedBody(text))
        const added = typeof entry === 'string' ? entry : deps.addDatabase(entry)
        if (typeof added === 'string') {
          sendJson(res, 400, { error: added, code: INVALID })
          return
        }
        sendJson(res, 200, { databases: added.map(publicEntry), spawn: deps.canSpawn })
        return
      }
      const databases = deps.databases()
      if (url.pathname === DATABASES_ROUTE) {
        sendJson(res, 200, { databases: databases.map(publicEntry), spawn: deps.canSpawn })
        return
      }
      const name = url.searchParams.get('db')
      const db = databases.find((entry) => entry.name === name)
      if (!db) {
        sendJson(res, 404, { error: `No database is named "${name ?? ''}" in the beadoo config` })
        return
      }
      if (tunnelStart) {
        await deps.tunnels.start(db)
        sendJson(res, 200, { started: db.name })
        return
      }
      if (target?.action === 'edit' || target?.action === 'spawn') {
        const text = await readBody(req)
        if (text === null) {
          sendJson(res, 413, { error: `The ${target.action} request is larger than ${MAX_BODY_BYTES} bytes`, code: INVALID })
          return
        }
        const request = parsedBody(text)
        if (target.action === 'spawn') {
          if (!deps.canSpawn) throw new StoreError(REFUSED, ORCA_MISSING)
          const spawn = readSpawnRequest(request)
          if (typeof spawn === 'string') {
            sendJson(res, 400, { error: spawn, code: INVALID })
            return
          }
          sendJson(res, 200, await deps.spawner.spawn(db, target.id, spawn))
          return
        }
        if (!isEditRequest(request)) {
          sendJson(res, 400, { error: 'The edit is not a valid request of the page', code: INVALID })
          return
        }
        sendJson(res, 200, await deps.store.editBead(db, target.id, request))
        return
      }
      if (target) {
        sendJson(res, 200, await deps.store.writeClaim(db, target.id, target.action))
        return
      }
      if (url.pathname === '/api/actor') {
        sendJson(res, 200, { actor: await deps.store.actor(db) })
        return
      }
      if (url.pathname === '/api/beads') {
        sendJson(res, 200, await deps.store.listBeads(db))
        return
      }
      const choices = /^\/api\/beads\/([^/]+)\/spawn-choices$/.exec(url.pathname)
      const choicesId = choices?.[1] ? decoded(choices[1]) : null
      if (choicesId !== null) {
        if (!deps.canSpawn) throw new StoreError(REFUSED, ORCA_MISSING)
        sendJson(res, 200, await deps.spawner.choices(db, choicesId))
        return
      }
      const commits = /^\/api\/beads\/([^/]+)\/commits$/.exec(url.pathname)
      const commitsId = commits?.[1] ? decoded(commits[1]) : null
      if (commitsId !== null) {
        sendJson(res, 200, { commits: await deps.commits.since(db, commitsId) })
        return
      }
      const match = /^\/api\/beads\/([^/]+)$/.exec(url.pathname)
      const id = match?.[1] ? decoded(match[1]) : null
      if (id !== null) {
        sendJson(res, 200, await deps.store.showBead(db, id))
        return
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      const code = error instanceof StoreError ? error.code : UNKNOWN_ERROR
      const bead = error instanceof StoreError && error.bead ? { bead: error.bead } : {}
      sendJson(res, statusOf(error), { error: (error as Error).message, code, ...bead })
    }
  }
}
