import { EventEmitter } from 'node:events'
import type { RunResult } from '../../../lib/process.ts'
import { INVALID, REFUSED } from '../shared/contract.ts'
import type { ConfiguredDatabase } from './config-rules.ts'
import { createTunnels, realLaunch, stopTunnelsOnExit } from './tunnels.ts'
import type { Launch } from './tunnels.ts'

const done: RunResult = { status: 0, stdout: '', stderr: '' }

const remote: ConfiguredDatabase = {
  name: 'remote',
  path: '/home/me/remote',
  tunnel: { start: ['ssh', '-fN', 'db-host'], stop: ['pkill', '-f', 'db-host'] },
}

function fakeLaunch(answer: RunResult = done) {
  const started: string[][] = []
  const stopped: string[][] = []
  const launch: Launch = async (command, args) => {
    started.push([command, ...args])
    return answer
  }
  const launchSync = (command: string, args: readonly string[]) => {
    stopped.push([command, ...args])
    return done
  }
  return { launch, launchSync, started, stopped }
}

describe('the tunnels of the Dolt server databases', () => {
  it('stops each tunnel that the page started when the server stops', async () => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await tunnels.start(remote)
    expect(tunnels.stopAll()).toEqual([])
    expect(fake.stopped).toEqual([['pkill', '-f', 'db-host']])
  })

  it('does not stop a tunnel that the page did not start', () => {
    const fake = fakeLaunch()
    createTunnels(fake.launch, fake.launchSync).stopAll()
    expect(fake.stopped).toEqual([])
  })

  it('does not stop a tunnel whose start failed', async () => {
    const fake = fakeLaunch({ status: 255, stdout: '', stderr: 'ssh: connect to host db-host port 22: Connection refused' })
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await expect(tunnels.start(remote)).rejects.toThrow('ssh: connect to host db-host port 22: Connection refused')
    tunnels.stopAll()
    expect(fake.stopped).toEqual([])
  })

  it('stops a tunnel one time only, also when the server stops two times', async () => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await tunnels.start(remote)
    tunnels.stopAll()
    tunnels.stopAll()
    expect(fake.stopped).toHaveLength(1)
  })

  it('starts the tunnel one time when the user clicks two times before the tunnel is open', async () => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await Promise.all([tunnels.start(remote), tunnels.start(remote)])
    expect(fake.started).toEqual([['ssh', '-fN', 'db-host']])
  })

  it('tells the user that the config gives no tunnel for the database', async () => {
    const fake = fakeLaunch()
    await expect(createTunnels(fake.launch, fake.launchSync).start({ name: 'shop', path: '/home/me/shop' })).rejects.toThrow(
      expect.objectContaining({ code: INVALID }),
    )
    expect(fake.started).toEqual([])
  })

  it('does not start the tunnel of a database on the Windows mount', async () => {
    const fake = fakeLaunch()
    const refused = { ...remote, path: '/mnt/c/x', refused: 'Use a WSL path' }
    await expect(createTunnels(fake.launch, fake.launchSync).start(refused)).rejects.toThrow(
      expect.objectContaining({ code: REFUSED }),
    )
    expect(fake.started).toEqual([])
  })

  it('reports a tunnel that did not stop', async () => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, () => ({ status: 1, stdout: '', stderr: 'pkill: no process found' }))
    await tunnels.start(remote)
    expect(tunnels.stopAll()).toEqual([
      'The tunnel of "remote" did not stop: pkill -f db-host failed (pkill: no process found).',
    ])
  })

  it.each(['SIGINT', 'SIGTERM', 'SIGHUP'] as const)('stops the tunnels and exits when the server gets %s', async (signal) => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await tunnels.start(remote)
    const target = Object.assign(new EventEmitter(), { exit: vi.fn() })
    stopTunnelsOnExit(tunnels, target, () => undefined)
    target.emit(signal)
    expect(fake.stopped).toEqual([['pkill', '-f', 'db-host']])
    expect(target.exit).toHaveBeenCalledWith(0)
  })

  it('stops the tunnels when the server exits on an error', async () => {
    const fake = fakeLaunch()
    const tunnels = createTunnels(fake.launch, fake.launchSync)
    await tunnels.start(remote)
    const target = Object.assign(new EventEmitter(), { exit: vi.fn() })
    const lines: string[] = []
    stopTunnelsOnExit(tunnels, target, (line) => lines.push(line))
    target.emit('exit')
    expect(fake.stopped).toEqual([['pkill', '-f', 'db-host']])
    expect(lines).toEqual([])
  })
})

describe('the start command of a tunnel', () => {
  it('answers the start of the tunnel when the start command returns, and does not wait for the tunnel to close', async () => {
    const begin = Date.now()
    const result = await realLaunch('sh', ['-c', 'sleep 5 & exit 0'], 4_000)
    expect(result.status).toBe(0)
    expect(Date.now() - begin).toBeLessThan(3_000)
  })

  it('gives the error output of a start command that fails', async () => {
    expect(await realLaunch('sh', ['-c', 'echo no route to db-host >&2; exit 3'], 4_000)).toEqual({
      status: 3,
      stdout: '',
      stderr: 'no route to db-host\n',
    })
  })

  it('gives the cause of a failed start, also when the error output arrives after the start command exits', async () => {
    const result = await realLaunch('sh', ['-c', '(sleep 0.1; echo bind: Address already in use >&2) & exit 255'], 4_000)
    expect(result).toEqual({ status: 255, stdout: '', stderr: 'bind: Address already in use\n' })
  })

  it('stops a start command that does not return in time', async () => {
    const result = await realLaunch('sleep', ['5'], 300)
    expect(result).toMatchObject({ status: null, stderr: 'did not finish in 0.3 s' })
  })

  it('reports a start program that does not exist', async () => {
    const result = await realLaunch('no-such-tunnel-program', [], 4_000)
    expect(result.status).toBeNull()
    expect(result.stderr).toContain('ENOENT')
  })
})
