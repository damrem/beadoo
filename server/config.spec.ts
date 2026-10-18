import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MOUNT_REFUSAL, publicEntry, startMessage } from './config-rules.ts'
import { configPath, legacyConfigPaths, loadConfig, loadDatabases } from './config.ts'
import type { ConfigPlace } from './config.ts'

const tempHome = () => mkdtempSync(join(tmpdir(), 'beadoo-'))

const placeIn = (home: string, overrides: Partial<ConfigPlace> = {}): ConfigPlace => ({
  home,
  cwd: join(home, 'work'),
  env: {},
  ...overrides,
})

const writeJson = (path: string, value: unknown) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

describe('the place of the beadoo config', () => {
  it('reads the config from the XDG config folder', () => {
    expect(configPath({ home: '/home/me', env: { XDG_CONFIG_HOME: '/home/me/xdg' } })).toBe('/home/me/xdg/beadoo/config.json')
  })

  it('reads the config from ~/.config/beadoo when XDG_CONFIG_HOME is not set', () => {
    expect(configPath({ home: '/home/me', env: {} })).toBe('/home/me/.config/beadoo/config.json')
  })

  it('ignores an XDG_CONFIG_HOME that is not an absolute path', () => {
    expect(configPath({ home: '/home/me', env: { XDG_CONFIG_HOME: 'xdg' } })).toBe('/home/me/.config/beadoo/config.json')
  })
})

describe('the database list of the page', () => {
  it('offers the beads database of the current folder when the user has no config', () => {
    const home = tempHome()
    const place = placeIn(home)
    mkdirSync(join(place.cwd, '.beads'), { recursive: true })
    expect(loadDatabases(place)).toEqual([{ name: 'work', path: place.cwd }])
    expect(existsSync(configPath(place))).toBe(false)
  })

  it('offers no database when the current folder has no .beads and no config exists', () => {
    expect(loadDatabases(placeIn(tempHome()))).toEqual([])
  })

  it('copies the old beadoo config once, at the first start', () => {
    const home = tempHome()
    const lines: string[] = []
    const place = placeIn(home, { log: (line) => lines.push(line) })
    const old = { databases: [{ name: 'shop', path: '/home/me/shop' }] }
    writeJson(legacyConfigPaths(home)[0]!, old)
    expect(loadDatabases(place)).toEqual(old.databases)
    expect(JSON.parse(readFileSync(configPath(place), 'utf8'))).toEqual(old)
    expect(lines).toEqual([`beadoo copied the config ${legacyConfigPaths(home)[0]} to ${configPath(place)}.`])
  })

  it('does not copy the old config again when the new config exists', () => {
    const home = tempHome()
    const place = placeIn(home)
    writeJson(configPath(place), { databases: [{ name: 'new', path: '/home/me/new' }] })
    writeJson(legacyConfigPaths(home)[0]!, { databases: [{ name: 'old', path: '/home/me/old' }] })
    expect(loadDatabases(place)).toEqual([{ name: 'new', path: '/home/me/new' }])
  })

  it('keeps the databases of the oldest config file', () => {
    const home = tempHome()
    const place = placeIn(home)
    const tunnel = { start: ['node', 'tunnel.mjs', '--ensure'], stop: ['node', 'tunnel.mjs', '--stop'] }
    const old = { databases: [{ name: 'mill', path: '/home/me/mill', tunnel }] }
    writeJson(legacyConfigPaths(home)[1]!, old)
    expect(loadDatabases(place)).toEqual(old.databases)
    expect(JSON.parse(readFileSync(configPath(place), 'utf8'))).toEqual(old)
  })

  it('keeps the databases that the user wrote in the config', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'shop', path: '/home/me/shop' }] }))
    expect(loadDatabases(placeIn(home), path)).toEqual([{ name: 'shop', path: '/home/me/shop' }])
  })

  it('refuses a database on the Windows mount and tells the user to use a WSL path', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'win', path: '/mnt/c/Users/me/.team' }] }))
    expect(loadDatabases(placeIn(home), path)).toEqual([
      { name: 'win', path: '/mnt/c/Users/me/.team', refused: MOUNT_REFUSAL },
    ])
  })

  it('keeps the tunnel commands of a database on a Dolt server', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    const tunnel = { start: ['ssh', '-fN', '-L', '3307:127.0.0.1:3307', 'db-host'], stop: ['pkill', '-f', '3307:127.0.0.1:3307'] }
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'remote', path: '/home/me/remote', tunnel }] }))
    expect(loadDatabases(placeIn(home), path)).toEqual([{ name: 'remote', path: '/home/me/remote', tunnel }])
  })

  it.each([
    ['a command written as one text', { start: 'ssh -fN db-host', stop: ['pkill', 'ssh'] }],
    ['no stop command', { start: ['ssh', '-fN', 'db-host'] }],
    ['an empty start command', { start: [], stop: ['pkill', 'ssh'] }],
    ['a start command with a number in it', { start: ['ssh', 22], stop: ['pkill', 'ssh'] }],
  ])('reports a tunnel with %s', (_case, tunnel) => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'remote', path: '/home/me/remote', tunnel }] }))
    expect(() => loadDatabases(placeIn(home), path)).toThrow('the "tunnel" of entry 0 needs a "start" and a "stop" command')
  })

  it('shows the page that a database has a tunnel, and not the tunnel commands', () => {
    const tunnel = { start: ['ssh', '-fN', 'db-host'], stop: ['pkill', 'ssh'] }
    expect(publicEntry({ name: 'remote', path: '/home/me/remote', tunnel })).toEqual({
      name: 'remote',
      path: '/home/me/remote',
      hasTunnel: true,
    })
  })

  it('reports a config entry that has no path', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'broken' }] }))
    expect(() => loadDatabases(placeIn(home), path)).toThrow('entry 0 needs a "name" and a "path"')
  })
})

describe('the session command of the config', () => {
  it('uses the session command that the user wrote in the config', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeJson(path, { databases: [], sessionCommand: 'opencode --prompt {prompt}' })
    expect(loadConfig(placeIn(home), path).sessionCommand).toBe('opencode --prompt {prompt}')
  })

  it('starts claude in the chosen mode when the config holds no session command', () => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeJson(path, { databases: [] })
    expect(loadConfig(placeIn(home), path).sessionCommand).toBe('claude --permission-mode {mode} {prompt}')
    expect(loadConfig(placeIn(tempHome())).sessionCommand).toBe('claude --permission-mode {mode} {prompt}')
  })

  it.each([
    ['a command with no {prompt} place', 'claude --permission-mode {mode}'],
    ['a command that is not a text', ['claude', '{prompt}']],
  ])('reports %s', (_case, sessionCommand) => {
    const home = tempHome()
    const path = join(home, 'config.json')
    writeJson(path, { databases: [], sessionCommand })
    expect(() => loadConfig(placeIn(home), path)).toThrow('"sessionCommand" needs a text that holds {prompt}')
  })
})

describe('the start message of beadoo', () => {
  it('gives the link to the first database', () => {
    expect(startMessage('http://127.0.0.1:4747', [{ name: 'my shop', path: '/home/me/shop' }], '/c.json')).toBe(
      'beadoo: http://127.0.0.1:4747/?db=my%20shop',
    )
  })

  it('tells the user how to give a database when there is none', () => {
    expect(startMessage('http://127.0.0.1:4747', [], '/home/me/.config/beadoo/config.json')).toContain(
      'start beadoo in a folder that holds .beads, or list the databases in /home/me/.config/beadoo/config.json',
    )
  })
})
