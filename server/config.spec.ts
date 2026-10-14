import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MOUNT_REFUSAL } from './config-rules.ts'
import { configPath, loadDatabases } from './config.ts'

const tempHome = () => mkdtempSync(join(tmpdir(), 'beads-page-'))

describe('the database list of the page', () => {
  it('offers the ~/.claude database when the user has no config yet', () => {
    const home = tempHome()
    expect(loadDatabases(home)).toEqual([{ name: '.claude', path: `${home}/.claude` }])
    expect(JSON.parse(readFileSync(configPath(home), 'utf8'))).toEqual({
      databases: [{ name: '.claude', path: `${home}/.claude` }],
    })
  })

  it('keeps the databases that the user wrote in the config', () => {
    const home = tempHome()
    const path = join(home, 'beads-page.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'shop', path: '/home/me/shop' }] }))
    expect(loadDatabases(home, path)).toEqual([{ name: 'shop', path: '/home/me/shop' }])
  })

  it('refuses a database on the Windows mount and tells the user to use a WSL path', () => {
    const home = tempHome()
    const path = join(home, 'beads-page.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'win', path: '/mnt/c/Users/me/.claude' }] }))
    expect(loadDatabases(home, path)).toEqual([
      { name: 'win', path: '/mnt/c/Users/me/.claude', refused: MOUNT_REFUSAL },
    ])
  })

  it('reports a config entry that has no path', () => {
    const home = tempHome()
    const path = join(home, 'beads-page.json')
    writeFileSync(path, JSON.stringify({ databases: [{ name: 'broken' }] }))
    expect(() => loadDatabases(home, path)).toThrow('entry 0 needs a "name" and a "path"')
  })
})
