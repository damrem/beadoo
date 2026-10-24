import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listFolders } from './folders.ts'

let home: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'beadoo-folders-'))
  mkdirSync(join(home, 'shop', '.beads'), { recursive: true })
  mkdirSync(join(home, 'Notes'))
  mkdirSync(join(home, '.claude', '.beads'), { recursive: true })
  writeFileSync(join(home, 'todo.txt'), 'x')
})

describe('the folders that the user browses to add a repo', () => {
  it('opens on the home folder, and marks each folder that holds beads', () => {
    expect(listFolders(null, home)).toEqual({
      path: home,
      parent: join(home, '..'),
      hasBeads: false,
      folders: [
        { name: 'Notes', path: join(home, 'Notes'), hasBeads: false },
        { name: 'shop', path: join(home, 'shop'), hasBeads: true },
        { name: '.claude', path: join(home, '.claude'), hasBeads: true },
      ],
    })
  })

  it('opens a folder that the user writes with a tilde, and hides its .beads folder', () => {
    expect(listFolders('~/shop', home)).toEqual({ path: join(home, 'shop'), parent: home, hasBeads: true, folders: [] })
  })

  it('stops at the root folder', () => {
    expect(listFolders('/', home)).toMatchObject({ path: '/', parent: null })
  })

  it('tells the user when the folder does not exist', () => {
    expect(listFolders(join(home, 'gone'), home)).toBe(`The folder ${join(home, 'gone')} does not exist`)
  })

  it('refuses a path that is not absolute', () => {
    expect(listFolders('shop', home)).toBe('The path "shop" is not an absolute path')
  })
})
