import type { DatabaseEntry } from '../shared/contract.ts'

export type TunnelCommands = { start: string[]; stop: string[] }

export type ConfiguredDatabase = DatabaseEntry & { tunnel?: TunnelCommands }

export type PageConfig = { databases: { name: string; path: string; tunnel?: TunnelCommands }[] }

export const MOUNT_REFUSAL = 'Use a WSL path: the /mnt/c clone has a store that diverged.'

export const defaultConfig = (home: string): PageConfig => ({
  databases: [{ name: '.claude', path: `${home}/.claude` }],
})

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
  if (!Array.isArray(databases)) throw new Error('beads-page.json holds no "databases" list')
  return databases.map((entry, index) => {
    if (!isEntry(entry)) throw new Error(`beads-page.json: entry ${index} needs a "name" and a "path"`)
    const { name, path } = entry
    if (entry.tunnel !== undefined && !isTunnel(entry.tunnel)) {
      throw new Error(
        `beads-page.json: the "tunnel" of entry ${index} needs a "start" and a "stop" command, each a list of strings that starts with the program`,
      )
    }
    const tunnel = entry.tunnel ? { tunnel: { start: [...entry.tunnel.start], stop: [...entry.tunnel.stop] } } : {}
    return path.startsWith('/mnt/') ? { name, path, refused: MOUNT_REFUSAL, ...tunnel } : { name, path, ...tunnel }
  })
}

export const publicEntry = ({ name, path, refused, tunnel }: ConfiguredDatabase): DatabaseEntry => ({
  name,
  path,
  ...(refused ? { refused } : {}),
  ...(tunnel ? { hasTunnel: true } : {}),
})
