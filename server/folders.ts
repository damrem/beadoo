import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { FolderList } from '../shared/contract.ts'
import { expandHome } from './config.ts'

const byName = (a: string, b: string): number => Number(a.startsWith('.')) - Number(b.startsWith('.')) || a.localeCompare(b)

const isFolder = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

export function listFolders(request: string | null, home: string): FolderList | string {
  const path = request?.trim() ? expandHome(request.trim(), home) : home
  if (!isAbsolute(path)) return `The path "${path}" is not an absolute path`
  if (!isFolder(path)) return `The folder ${path} does not exist`
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    return `beadoo cannot read the folder ${path}`
  }
  const folders = names
    .filter((name) => name !== '.beads' && isFolder(join(path, name)))
    .sort(byName)
    .map((name) => ({ name, path: join(path, name), hasBeads: existsSync(join(path, name, '.beads')) }))
  const parent = dirname(path)
  return { path, parent: parent === path ? null : parent, hasBeads: existsSync(join(path, '.beads')), folders }
}
