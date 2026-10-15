import { spawn, spawnSync } from 'node:child_process'
import type { RunResult } from '../../../lib/process.ts'
import { withoutWarnings } from '../../../lib/process.ts'
import { INVALID, REFUSED } from '../shared/contract.ts'
import { StoreError } from './beads-store.ts'
import type { ConfiguredDatabase, TunnelCommands } from './config-rules.ts'

export const TUNNEL_TIMEOUT_MS = 30_000

export type Launch = (command: string, args: readonly string[], timeoutMs: number) => Promise<RunResult>

export type LaunchSync = (command: string, args: readonly string[], timeoutMs: number) => RunResult

const STDERR_GRACE_MS = 500

export const realLaunch: Launch = (command, args, timeoutMs) =>
  new Promise((resolve) => {
    let stderr = ''
    let settled = false
    let grace: NodeJS.Timeout | undefined
    const child = spawn(command, [...args], { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
    const finish = (result: RunResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(grace)
      child.stderr?.destroy()
      child.unref()
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGTERM')
      } catch {
        child.kill('SIGTERM')
      }
      finish({ status: null, stdout: '', stderr: `did not finish in ${timeoutMs / 1000} s` })
    }, timeoutMs)
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => finish({ status: null, stdout: '', stderr: error.message }))
    child.on('exit', (code) => {
      grace = setTimeout(() => finish({ status: code, stdout: '', stderr }), STDERR_GRACE_MS)
    })
    child.on('close', (code) => finish({ status: code, stdout: '', stderr }))
  })

export const realLaunchSync: LaunchSync = (command, args, timeoutMs) => {
  const result = spawnSync(command, [...args], { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8', timeout: timeoutMs })
  if (result.error) return { status: null, stdout: '', stderr: result.error.message }
  return { status: result.status, stdout: '', stderr: result.stderr ?? '' }
}

const detailOf = (result: RunResult): string =>
  withoutWarnings(result.stderr).trim() || (result.status === null ? 'no exit code' : `exit ${result.status}`)

export function createTunnels(launch: Launch = realLaunch, launchSync: LaunchSync = realLaunchSync) {
  const started = new Map<string, TunnelCommands>()
  const pending = new Map<string, Promise<void>>()

  const startOnce = async (name: string, tunnel: TunnelCommands): Promise<void> => {
    const [command, ...args] = tunnel.start
    const result = await launch(command!, args, TUNNEL_TIMEOUT_MS)
    if (result.status !== 0) {
      const [stopCommand, ...stopArgs] = tunnel.stop
      await launch(stopCommand!, stopArgs, TUNNEL_TIMEOUT_MS)
      throw new Error(
        `The tunnel of "${name}" did not start: ${tunnel.start.join(' ')} failed (${detailOf(result)}). Use a start command that returns when the tunnel is open, as ssh -f.`,
      )
    }
    started.set(name, tunnel)
  }

  return {
    start(db: ConfiguredDatabase): Promise<void> {
      if (db.refused) return Promise.reject(new StoreError(REFUSED, db.refused))
      if (!db.tunnel) return Promise.reject(new StoreError(INVALID, `beads-page.json gives no tunnel for the database "${db.name}".`))
      const running = pending.get(db.name)
      if (running) return running
      const task = startOnce(db.name, db.tunnel).finally(() => pending.delete(db.name))
      pending.set(db.name, task)
      return task
    },

    stopAll(): string[] {
      const problems: string[] = []
      for (const [name, tunnel] of started) {
        const [command, ...args] = tunnel.stop
        const result = launchSync(command!, args, TUNNEL_TIMEOUT_MS)
        if (result.status !== 0) problems.push(`The tunnel of "${name}" did not stop: ${tunnel.stop.join(' ')} failed (${detailOf(result)}).`)
      }
      started.clear()
      return problems
    },
  }
}

export type Tunnels = ReturnType<typeof createTunnels>

type ExitTarget = {
  on(event: 'exit', listener: () => void): unknown
  on(event: NodeJS.Signals, listener: () => void): unknown
  exit(code?: number): unknown
}

export const EXIT_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']

export function stopTunnelsOnExit(tunnels: Tunnels, target: ExitTarget, report: (line: string) => void): void {
  const stop = () => {
    for (const problem of tunnels.stopAll()) report(problem)
  }
  target.on('exit', stop)
  for (const signal of EXIT_SIGNALS) {
    target.on(signal, () => {
      stop()
      target.exit(0)
    })
  }
}
