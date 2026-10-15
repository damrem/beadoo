import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { realRunAsync } from '../../../lib/process.ts'
import { createStore } from './beads-store.ts'
import { loadDatabases } from './config.ts'
import { newToken } from './guard.ts'
import { createHandler } from './http.ts'
import { createSpawner, realSpawnIo } from './spawner.ts'
import { createTunnels, stopTunnelsOnExit } from './tunnels.ts'

const HOST = '127.0.0.1'
const PORT = 4747
const home = homedir()
const tunnels = createTunnels()
const store = createStore(realRunAsync)

stopTunnelsOnExit(tunnels, process, (line) => console.error(line))

const handler = createHandler({
  databases: () => loadDatabases(home),
  store,
  tunnels,
  spawner: createSpawner(store, realSpawnIo()),
  distDir: join(import.meta.dirname, '..', 'dist'),
  origin: `http://${HOST}:${PORT}`,
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
  console.log(`beads page: http://${HOST}:${PORT}/?db=.claude`)
})
