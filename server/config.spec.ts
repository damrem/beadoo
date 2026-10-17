import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { MOUNT_REFUSAL, publicEntry } from './config-rules.ts'
import { configPath, legacyConfigPath, loadDatabases } from './config.ts'

const tempHome = () => mkdtempSync(join(tmpdir(), 'beadoo-'))

describe('the database list of the page', () => {
  it('offers the ~/.claude database when the user has no config yet', () => {
    const home = tempHome()
    expect(loadDatabases(home)).toEqual([{ name: '.claude', path: `${home}/.claude` }])
    expect(JSON.parse(readFileSync(configPath(home), 'utf8'))).toEqual({
      databases: [{ name: '.claude', path: `${home}/.claude` }],
    })
  })

  it('keeps the databases of the old config file after the rename', () => {
    const home = tempHome()
    const tunnel = { start: ['node', 'tunnel.mjs', '--ensure'], stop: ['node', 'tunnel.mjs', '--stop'] }
    const old = { databases: [{ name: '.claude', path: `${home}/.claude` }, { name: 'mill', path: '/home/me/mill', tunnel }] }
    mkdirSync(dirname(legacyConfigPath(home)), { recursive: true })
    writeFileSync(legacyConfigPath(home), JSON.stringify(old))
    expect(loadDatabases(home)).toEqual(old.databases)
    expect(JSON.parse(readFileSync(configPath(home), 'utf8'))).toEqual(old)
  })

  it('keeps the databases that the user wrote in the config', () => {
    const home = tempHome()
    const path = join(home, 'beadoo.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'shop', path: '/home/me/shop' }] }))
    expect(loadDatabases(home, path)).toEqual([{ name: 'shop', path: '/home/me/shop' }])
  })

  it('refuses a database on the Windows mount and tells the user to use a WSL path', () => {
    const home = tempHome()
    const path = join(home, 'beadoo.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'win', path: '/mnt/c/Users/me/.claude' }] }))
    expect(loadDatabases(home, path)).toEqual([
      { name: 'win', path: '/mnt/c/Users/me/.claude', refused: MOUNT_REFUSAL },
    ])
  })

  it('keeps the tunnel commands of a database on a Dolt server', () => {
    const home = tempHome()
    const path = join(home, 'beadoo.json')
    const tunnel = { start: ['ssh', '-fN', '-L', '3307:127.0.0.1:3307', 'db-host'], stop: ['pkill', '-f', '3307:127.0.0.1:3307'] }
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'remote', path: '/home/me/remote', tunnel }] }))
    expect(loadDatabases(home, path)).toEqual([{ name: 'remote', path: '/home/me/remote', tunnel }])
  })

  it.each([
    ['a command written as one text', { start: 'ssh -fN db-host', stop: ['pkill', 'ssh'] }],
    ['no stop command', { start: ['ssh', '-fN', 'db-host'] }],
    ['an empty start command', { start: [], stop: ['pkill', 'ssh'] }],
    ['a start command with a number in it', { start: ['ssh', 22], stop: ['pkill', 'ssh'] }],
  ])('reports a tunnel with %s', (_case, tunnel) => {
    const home = tempHome()
    const path = join(home, 'beadoo.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'remote', path: '/home/me/remote', tunnel }] }))
    expect(() => loadDatabases(home, path)).toThrow('the "tunnel" of entry 0 needs a "start" and a "stop" command')
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
    const path = join(home, 'beadoo.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'broken' }] }))
    expect(() => loadDatabases(home, path)).toThrow('entry 0 needs a "name" and a "path"')
  })
})
