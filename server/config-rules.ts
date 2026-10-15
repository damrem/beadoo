import type { DatabaseEntry } from '../shared/contract.ts'

export type PageConfig = { databases: DatabaseEntry[] }

export const MOUNT_REFUSAL = 'Use a WSL path: the /mnt/c clone has a store that diverged.'

export const defaultConfig = (home: string): PageConfig => ({
  databases: [{ name: '.claude', path: `${home}/.claude` }],
})

const isEntry = (value: unknown): value is { name: string; path: string } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { name?: unknown }).name === 'string' &&
  typeof (value as { path?: unknown }).path === 'string'

export function checkDatabases(config: unknown): DatabaseEntry[] {
  const databases = (config as { databases?: unknown } | null)?.databases
  if (!Array.isArray(databases)) throw new Error('beads-page.json holds no "databases" list')
  return databases.map((entry, index) => {
    if (!isEntry(entry)) throw new Error(`beads-page.json: entry ${index} needs a "name" and a "path"`)
    const { name, path } = entry
    return path.startsWith('/mnt/') ? { name, path, refused: MOUNT_REFUSAL } : { name, path }
  })
}
