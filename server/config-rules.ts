import { basename, isAbsolute } from 'node:path'
import type { DatabaseEntry } from '../shared/contract.ts'
import { DEFAULT_SESSION_COMMAND } from './orca-rules.ts'

export type TunnelCommands = { start: string[]; stop: string[] }

export type ConfiguredDatabase = DatabaseEntry & { tunnel?: TunnelCommands }

export type BeadooConfig = { databases: ConfiguredDatabase[]; sessionCommand: string }

export const MOUNT_REFUSAL = 'Use a WSL path: the /mnt/c clone has a store that diverged.'

export const defaultDatabases = (cwd: string, hasBeads: boolean): ConfiguredDatabase[] =>
  hasBeads ? [{ name: basename(cwd) || cwd, path: cwd }] : []

export function startMessage(origin: string, databases: readonly DatabaseEntry[], configFile: string): string {
  const first = databases[0]
  if (!first) return `beadoo: ${origin}\nNo beads database: start beadoo in a folder that holds .beads, or list the databases in ${configFile}.`
  return `beadoo: ${origin}/?db=${encodeURIComponent(first.name)}`
}

const isEntry = (value: unknown): value is { name: string; path: string; tunnel?: unknown } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { name?: unknown }).name === 'string' &&
  typeof (value as { path?: unknown }).path === 'string'

const isCommand = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((part) => typeof part === 'string') &&
  (value[0] as string).trim() !== ''

const isTunnel = (value: unknown): value is TunnelCommands =>
  typeof value === 'object' &&
  value !== null &&
  isCommand((value as { start?: unknown }).start) &&
  isCommand((value as { stop?: unknown }).stop)

export function checkDatabases(config: unknown): ConfiguredDatabase[] {
  const databases = (config as { databases?: unknown } | null)?.databases
  if (!Array.isArray(databases)) throw new Error('The beadoo config holds no "databases" list')
  return databases.map((entry, index) => {
    if (!isEntry(entry)) throw new Error(`The beadoo config: entry ${index} needs a "name" and a "path"`)
    const { name, path } = entry
    if (entry.tunnel !== undefined && !isTunnel(entry.tunnel)) {
      throw new Error(
        `The beadoo config: the "tunnel" of entry ${index} needs a "start" and a "stop" command, each a list of strings that starts with the program`,
      )
    }
    const tunnel = entry.tunnel ? { tunnel: { start: [...entry.tunnel.start], stop: [...entry.tunnel.stop] } } : {}
    return path.startsWith('/mnt/') ? { name, path, refused: MOUNT_REFUSAL, ...tunnel } : { name, path, ...tunnel }
  })
}

export function checkSessionCommand(config: unknown): string {
  const command = (config as { sessionCommand?: unknown } | null)?.sessionCommand
  if (command === undefined) return DEFAULT_SESSION_COMMAND
  if (typeof command !== 'string' || !command.includes('{prompt}')) {
    throw new Error('The beadoo config: "sessionCommand" needs a text that holds {prompt}, such as "claude --permission-mode {mode} {prompt}"')
  }
  return command
}

export const checkConfig = (config: unknown): BeadooConfig => ({
  databases: checkDatabases(config),
  sessionCommand: checkSessionCommand(config),
})

export const publicEntry = ({ name, path, refused, tunnel }: ConfiguredDatabase): DatabaseEntry => ({
  name,
  path,
  ...(refused ? { refused } : {}),
  ...(tunnel ? { hasTunnel: true } : {}),
})

export type NewDatabase = { name: string; path: string }

export function readDatabaseRequest(body: unknown): NewDatabase | string {
  const { name, path } = (body ?? {}) as { name?: unknown; path?: unknown }
  if (typeof path !== 'string' || path.trim() === '') return 'The new database needs a "path"'
  if (name !== undefined && typeof name !== 'string') return 'The "name" of the new database must be a text'
  const folder = path.trim().replace(/\/+$/, '') || '/'
  return { name: name?.trim() || basename(folder) || folder, path: folder }
}

export function newDatabaseProblem(entry: NewDatabase, databases: readonly DatabaseEntry[], hasBeads: boolean): string | null {
  if (!isAbsolute(entry.path)) return `The path "${entry.path}" is not an absolute path`
  if (databases.some((db) => db.name === entry.name)) return `The beadoo config already holds a database named "${entry.name}"`
  const twin = databases.find((db) => db.path === entry.path)
  if (twin) return `The beadoo config already holds the folder ${entry.path}, as "${twin.name}"`
  if (!hasBeads) return `The folder ${entry.path} holds no .beads folder`
  return null
}
