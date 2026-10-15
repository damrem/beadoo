import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseJson } from '../../../lib/process.ts'
import { checkDatabases, defaultConfig } from './config-rules.ts'
import type { DatabaseEntry } from '../shared/contract.ts'

export const configPath = (home: string): string => join(home, '.claude', '.local', 'beads-page.json')

export function loadDatabases(home: string, path = configPath(home)): DatabaseEntry[] {
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(defaultConfig(home), null, 2)}\n`)
  }
  return checkDatabases(parseJson(readFileSync(path, 'utf8'), path))
}
