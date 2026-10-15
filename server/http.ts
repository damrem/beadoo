import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import { CLAIM_ACTIONS, CONFLICT, NOT_FOUND, REFUSED, STORE_NOT_OPEN, UNKNOWN_ERROR } from '../shared/contract.ts'
import type { ClaimAction, DatabaseEntry } from '../shared/contract.ts'
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
  if (error.code === CONFLICT) return 409
  return 500
}

export const withToken = (html: string, token: string): string =>
  html.replace('</head>', `  <meta name="beads-token" content="${token}" />\n  </head>`)

const CLAIM_ROUTE = /^\/api\/beads\/([^/]+)\/([a-z]+)$/

const isClaimAction = (value: string | undefined): value is ClaimAction =>
  (CLAIM_ACTIONS as readonly string[]).includes(value ?? '')

const decoded = (text: string): string | null => {
  try {
    return decodeURIComponent(text)
  } catch {
    return null
  }
}

const claimRoute = (pathname: string): { id: string; action: ClaimAction } | null => {
  const match = CLAIM_ROUTE.exec(pathname)
  const id = match?.[1] ? decoded(match[1]) : null
  const action = match?.[2]
  return id !== null && isClaimAction(action) ? { id, action } : null
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
    if (!hosts.has(req.headers.host ?? '')) {
      sendJson(res, 403, { error: 'Forbidden: the request needs the page host' })
      return
    }
    const url = new URL(req.url ?? '/', deps.origin)
    const write = req.method !== 'GET' && req.method !== 'HEAD'
    if (write && !allowsWrite(req.headers, deps.origin, deps.token)) {
      sendJson(res, 403, { error: 'Forbidden: the request needs the page origin and the page token' })
      return
    }
    const claim = write && req.method === 'POST' ? claimRoute(url.pathname) : null
    if (write && !claim) {
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
      if (claim) {
        sendJson(res, 200, await deps.store.writeClaim(db, claim.id, claim.action))
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
      sendJson(res, statusOf(error), { error: (error as Error).message, code })
    }
  }
}
