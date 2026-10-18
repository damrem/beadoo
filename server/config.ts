import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import { checkConfig, defaultDatabases } from './config-rules.ts'
import type { BeadooConfig, ConfiguredDatabase } from './config-rules.ts'
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

export function loadConfig(place: ConfigPlace, path = configPath(place)): BeadooConfig {
  if (!existsSync(path)) copyLegacyConfig(place, path)
  if (!existsSync(path)) {
    return { databases: defaultDatabases(place.cwd, existsSync(join(place.cwd, '.beads'))), sessionCommand: DEFAULT_SESSION_COMMAND }
  }
  return checkConfig(parseJson(readFileSync(path, 'utf8'), path))
}

export const loadDatabases = (place: ConfigPlace, path = configPath(place)): ConfiguredDatabase[] => loadConfig(place, path).databases
