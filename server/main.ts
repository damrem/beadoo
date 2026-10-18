import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { realRunAsync } from './process.ts'
import { createStore } from './beads-store.ts'
import { configPath, loadConfig, loadDatabases } from './config.ts'
import type { ConfigPlace } from './config.ts'
import { startMessage } from './config-rules.ts'
import { newToken } from './guard.ts'
import { onPath } from './orca-rules.ts'
import { createHandler } from './http.ts'
import { createSpawner, realSpawnIo } from './spawner.ts'
import { createTunnels, stopTunnelsOnExit } from './tunnels.ts'

const HOST = '127.0.0.1'
const PORT = 4747
const place: ConfigPlace = { home: homedir(), cwd: process.cwd(), log: (line) => console.log(line) }
const origin = `http://${HOST}:${PORT}`
const tunnels = createTunnels()
const store = createStore(realRunAsync)

stopTunnelsOnExit(tunnels, process, (line) => console.error(line))

const handler = createHandler({
  databases: () => loadDatabases(place),
  store,
  tunnels,
  spawner: createSpawner(store, realSpawnIo(), { sessionCommand: () => loadConfig(place).sessionCommand }),
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
