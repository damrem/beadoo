import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { realRun, realRunAsync } from './process.ts'
import { bdVersionProblem } from './bd-version.ts'
import { HOST, serverAddress } from './address.ts'
import { createStore } from './beads-store.ts'
import { addDatabase, configPath, loadConfig, loadDatabases } from './config.ts'
import type { ConfigPlace } from './config.ts'
import { startMessage } from './config-rules.ts'
import { newToken } from './guard.ts'
import { onPath } from './orca-rules.ts'
import { createCommits } from './commits.ts'
import { listFolders } from './folders.ts'
import { createHandler } from './http.ts'
import { createSpawner, realSpawnIo } from './spawner.ts'
import { createTunnels, stopTunnelsOnExit } from './tunnels.ts'

const bdProblem = bdVersionProblem(realRun('bd', ['--version'], { timeoutMs: 15_000 }))
if (bdProblem) {
  console.error(bdProblem)
  process.exit(1)
}

const address = serverAddress(process.env)
if (typeof address === 'string') {
  console.error(address)
  process.exit(1)
}

const PORT = address.port
const place: ConfigPlace = { home: homedir(), cwd: process.cwd(), log: (line) => console.log(line) }
const { origin, publicOrigin } = address
const tunnels = createTunnels()
const store = createStore(realRunAsync)

stopTunnelsOnExit(tunnels, process, (line) => console.error(line))

const handler = createHandler({
  databases: () => loadDatabases(place),
  addDatabase: (entry) => addDatabase(place, entry),
  listFolders: (path) => listFolders(path, place.home),
  store,
  tunnels,
  spawner: createSpawner(store, realSpawnIo(), { sessionCommand: () => loadConfig(place).sessionCommand }),
  commits: createCommits(store, (command, args, options) => realRunAsync(command, args, { timeoutMs: 15_000, ...options })),
  canSpawn: onPath('orca', process.env.PATH, existsSync),
  distDir: join(import.meta.dirname, '..', 'dist'),
  origin,
  publicOrigin,
  token: newToken(),
})

const server = createServer((req, res) => {
  handler(req, res).catch((error: unknown) => {
    res.writeHead(500)
    res.end(String(error))
  })
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy: another process listens on ${HOST}:${PORT}. Give another port, for example PORT=${PORT + 1} pnpm start.`)
  else console.error(error.message)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  try {
    console.log(startMessage(publicOrigin ?? origin, loadDatabases(place), configPath(place)))
  } catch (error) {
    console.log(`beadoo: ${publicOrigin ?? origin}\n${(error as Error).message}`)
  }
})
