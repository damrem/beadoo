import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseJson } from '../../../lib/process.ts'
import { checkDatabases, defaultConfig } from './config-rules.ts'
import type { ConfiguredDatabase } from './config-rules.ts'

export const configPath = (home: string): string => join(home, '.claude', '.local', 'beadoo.json')

export const legacyConfigPath = (home: string): string => join(home, '.claude', '.local', 'beads-page.json')

export function loadDatabases(home: string, path = configPath(home), legacyPath = legacyConfigPath(home)): ConfiguredDatabase[] {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(legacyPath)) copyFileSync(legacyPath, path)
    else writeFileSync(path, `${JSON.stringify(defaultConfig(home), null, 2)}\n`)
  }
  return checkDatabases(parseJson(readFileSync(path, 'utf8'), path))
}
