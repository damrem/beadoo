import type { RunResult } from './process.ts'

export const MIN_BD_VERSION = '1.3.1'

const MINIMUM = MIN_BD_VERSION.split('.').map(Number)

export function parseBdVersion(stdout: string): number[] | undefined {
  const match = /\bversion\s+v?(\d+)\.(\d+)\.(\d+)/.exec(stdout)
  return match ? match.slice(1).map(Number) : undefined
}

function older(version: readonly number[], minimum: readonly number[]): boolean {
  for (let i = 0; i < minimum.length; i++) {
    if ((version[i] ?? 0) !== minimum[i]) return (version[i] ?? 0) < minimum[i]!
  }
  return false
}

export function bdVersionProblem(result: RunResult): string | undefined {
  if (result.status === null) return `beadoo needs bd ${MIN_BD_VERSION} or later, and bd is not on the PATH: ${result.stderr.trim()}`
  const printed = (result.stdout || result.stderr).trim()
  const version = result.status === 0 ? parseBdVersion(printed) : undefined
  if (version && !older(version, MINIMUM)) return undefined
  return `beadoo needs bd ${MIN_BD_VERSION} or later. bd --version printed: ${printed || 'nothing'}`
}
