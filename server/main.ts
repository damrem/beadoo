import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { realRun, realRunAsync } from './process.ts'
import { bdVersionProblem } from './bd-version.ts'
import { createStore } from './beads-store.ts'
import { addDatabase, configPath, loadConfig, loadDatabases } from './config.ts'
import type { ConfigPlace } from './config.ts'
import { startMessage } from './config-rules.ts'
import { newToken } from './guard.ts'
import { onPath } from './orca-rules.ts'
import { createCommits } from './commits.ts'
import { createHandler } from './http.ts'
import { createSpawner, realSpawnIo } from './spawner.ts'
import { createTunnels, stopTunnelsOnExit } from './tunnels.ts'

const bdProblem = bdVersionProblem(realRun('bd', ['--version'], { timeoutMs: 15_000 }))
if (bdProblem) {
  console.error(bdProblem)
  process.exit(1)
}

const HOST = '127.0.0.1'
const PORT = 4747
const place: ConfigPlace = { home: homedir(), cwd: process.cwd(), log: (line) => console.log(line) }
const origin = `http://${HOST}:${PORT}`
const tunnels = createTunnels()
const store = createStore(realRunAsync)

stopTunnelsOnExit(tunnels, process, (line) => console.error(line))

const handler = createHandler({
  databases: () => loadDatabases(place),
  addDatabase: (entry) => addDatabase(place, entry),
  store,
  tunnels,
  spawner: createSpawner(store, realSpawnIo(), { sessionCommand: () => loadConfig(place).sessionCommand }),
  commits: createCommits(store, (command, args, options) => realRunAsync(command, args, { timeoutMs: 15_000, ...options })),
  canSpawn: onPath('orca', process.env.PATH, existsSync),
  distDir: join(import.meta.dirname, '..', 'dist'),
  origin,
  token: newToken(),
})

const server = createServer((req, res) => {
  handler(req, res).catch((error: unknown) => {
    res.writeHead(500)
    res.end(String(error))
  })
})

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy: another process listens on ${HOST}:${PORT}.`)
  else console.error(error.message)
  process.exit(1)
})

server.listen(PORT, HOST, () => {
  try {
    console.log(startMessage(origin, loadDatabases(place), configPath(place)))
  } catch (error) {
    console.log(`beadoo: ${origin}\n${(error as Error).message}`)
  }
})
