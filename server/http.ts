import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { CLAIM_ACTIONS, CONFLICT, INVALID, NOT_FOUND, REFUSED, STALE, STORE_NOT_OPEN, UNKNOWN_ERROR } from '../shared/contract.ts'
import type { ClaimAction, DatabaseEntry } from '../shared/contract.ts'
import { isEditRequest } from '../shared/edit.ts'
import { StoreError } from './beads-store.ts'
import type { Store } from './beads-store.ts'
import { allowsWrite } from './guard.ts'

export type AppDeps = {
  databases: () => DatabaseEntry[]
  store: Store
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
  if (error.code === STORE_NOT_OPEN || error.code === REFUSED) return 503
  if (error.code === NOT_FOUND) return 404
  if (error.code === CONFLICT || error.code === STALE) return 409
  if (error.code === INVALID) return 400
  return 500
}

export const withToken = (html: string, token: string): string =>
  html.replace('</head>', `  <meta name="beads-token" content="${token}" />\n  </head>`)

const WRITE_ROUTE = /^\/api\/beads\/([^/]+)\/([a-z]+)$/

export const MAX_BODY_BYTES = 1024 * 1024

type WriteAction = ClaimAction | 'edit'

const isWriteAction = (value: string | undefined): value is WriteAction =>
  value === 'edit' || (CLAIM_ACTIONS as readonly string[]).includes(value ?? '')

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
    const target = write && req.method === 'POST' ? writeRoute(url.pathname) : null
    if (write && !target) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }

    if (!url.pathname.startsWith('/api/')) {
      await serveFile(res, deps, url.pathname)
      return
    }

    try {
      const databases = deps.databases()
      if (url.pathname === '/api/databases') {
        sendJson(res, 200, { databases })
        return
      }
      const name = url.searchParams.get('db')
      const db = databases.find((entry) => entry.name === name)
      if (!db) {
        sendJson(res, 404, { error: `No database is named "${name ?? ''}" in beads-page.json` })
        return
      }
      if (target?.action === 'edit') {
        const text = await readBody(req)
        if (text === null) {
          sendJson(res, 413, { error: `The edit is larger than ${MAX_BODY_BYTES} bytes`, code: INVALID })
          return
        }
        const request = parsedBody(text)
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
      const match = /^\/api\/beads\/([^/]+)$/.exec(url.pathname)
      const id = match?.[1] ? decoded(match[1]) : null
      if (id !== null) {
        sendJson(res, 200, await deps.store.showBead(db, id))
        return
      }
      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      const code = error instanceof StoreError ? error.code : UNKNOWN_ERROR
      const bead = error instanceof StoreError && error.code === STALE ? { bead: error.bead } : {}
      sendJson(res, statusOf(error), { error: (error as Error).message, code, ...bead })
    }
  }
}
