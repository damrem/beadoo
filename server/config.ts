import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { checkConfig, newDatabaseProblem, withStartFolder } from './config-rules.ts'
import type { BeadooConfig, ConfiguredDatabase, NewDatabase } from './config-rules.ts'
import { DEFAULT_SESSION_COMMAND } from './orca-rules.ts'
import { parseJson } from './process.ts'

export type ConfigPlace = { home: string; cwd: string; env?: Record<string, string | undefined>; log?: (line: string) => void }

export function configPath({ home, env = process.env }: Pick<ConfigPlace, 'home' | 'env'>): string {
  const xdg = env.XDG_CONFIG_HOME
  return join(xdg && isAbsolute(xdg) ? xdg : join(home, '.config'), 'beadoo', 'config.json')
}

export const legacyConfigPaths = (home: string): string[] => [
  join(home, '.claude', '.local', 'beadoo.json'),
  join(home, '.claude', '.local', 'beads-page.json'),
]

function copyLegacyConfig(place: ConfigPlace, path: string): void {
  const legacy = legacyConfigPaths(place.home).find((candidate) => existsSync(candidate))
  if (!legacy) return
  mkdirSync(dirname(path), { recursive: true })
  copyFileSync(legacy, path)
  place.log?.(`beadoo copied the config ${legacy} to ${path}.`)
}

function savedConfig(place: ConfigPlace, path: string): BeadooConfig {
  if (!existsSync(path)) copyLegacyConfig(place, path)
  if (!existsSync(path)) return { databases: [], sessionCommand: DEFAULT_SESSION_COMMAND }
  return checkConfig(parseJson(readFileSync(path, 'utf8'), path))
}

export function loadConfig(place: ConfigPlace, path = configPath(place)): BeadooConfig {
  const config = savedConfig(place, path)
  return { ...config, databases: withStartFolder(config.databases, place.cwd, existsSync(join(place.cwd, '.beads'))) }
}

export const loadDatabases = (place: ConfigPlace, path = configPath(place)): ConfiguredDatabase[] => loadConfig(place, path).databases

export const expandHome = (path: string, home: string): string => (path === '~' || path.startsWith('~/') ? join(home, path.slice(1)) : path)

export function addDatabase(place: ConfigPlace, request: NewDatabase, path = configPath(place)): ConfiguredDatabase[] | string {
  const entry = { name: request.name, path: expandHome(request.path, place.home) }
  const { databases } = savedConfig(place, path)
  const problem = newDatabaseProblem(entry, databases, existsSync(join(entry.path, '.beads')))
  if (problem) return problem
  const config = existsSync(path) ? (parseJson(readFileSync(path, 'utf8'), path) as { databases: unknown[] }) : { databases: [] }
  config.databases = [...config.databases, entry]
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)
  place.log?.(`beadoo added the database "${entry.name}" to ${path}.`)
  return loadDatabases(place, path)
}
