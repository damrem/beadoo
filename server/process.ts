import { execFile, spawnSync } from 'node:child_process'

export type RunResult = { status: number | null; stdout: string; stderr: string }

export type RunOptions = { cwd?: string; env?: Record<string, string | undefined>; input?: string; timeoutMs?: number }

export type Run = (command: string, args: readonly string[], options?: RunOptions) => RunResult

export type RunAsync = (command: string, args: readonly string[], options?: RunOptions) => Promise<RunResult>

const BYTE_ORDER_MARK = 0xfeff

export const realRun: Run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    timeout: options.timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) return { status: null, stdout: '', stderr: result.error.message }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

export const realRunAsync: RunAsync = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = execFile(
      command,
      [...args],
      { encoding: 'utf8', cwd: options.cwd, env: options.env, timeout: options.timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') resolve({ status: null, stdout: '', stderr: error.message })
        else resolve({ status: error ? Number(error.code) : 0, stdout, stderr })
      },
    )
    if (options.input !== undefined) child.stdin?.end(options.input)
  })

const WARNING_LINE = /^warning:/i

const INDENTED_LINE = /^[ \t]/

export function withoutWarnings(stderr: string): string {
  let inWarning = false
  return stderr
    .split(/\r?\n/)
    .filter((line) => {
      inWarning = WARNING_LINE.test(line) || (inWarning && INDENTED_LINE.test(line))
      return line.trim() !== '' && !inWarning
    })
    .join('\n')
}

const OPTIONS_WITH_VALUE = new Set(['-C', '--actor'])

const subcommandOf = (args: readonly string[]): string => {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? ''
    if (OPTIONS_WITH_VALUE.has(arg)) index++
    else if (!arg.startsWith('-')) return arg
  }
  return ''
}

export function checked(result: RunResult, command: string, args: readonly string[]): string {
  if (result.status === 0) return result.stdout
  const detail = (withoutWarnings(result.stderr) || result.stdout).trim()
  throw new Error(`${command} ${subcommandOf(args)} failed (exit ${result.status ?? 'none'}): ${detail}`)
}

export function runChecked(run: Run, command: string, args: readonly string[], options?: RunOptions): string {
  return checked(run(command, args, options), command, args)
}

export async function runCheckedAsync(
  run: RunAsync,
  command: string,
  args: readonly string[],
  options?: RunOptions,
): Promise<string> {
  return checked(await run(command, args, options), command, args)
}

export function parseJson<T = unknown>(text: string, label: string): T {
  const clean = (text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text).trim()
  try {
    return JSON.parse(clean) as T
  } catch (error) {
    throw new Error(`${label} did not print valid JSON (${(error as Error).message}): ${clean.slice(0, 200)}`)
  }
}
