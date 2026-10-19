import { busyPlace, defaultTarget, proposedRequest, readSpawnChoice, sentRequest, spawnChoiceKey, usableLocations, writeSpawnChoice } from '@/lib/spawn-choice'
import type { SpawnChoices } from '../../shared/spawn'

const bead = { id: 't-1', title: 'Cart total', issue_type: 'task' }

const MAIN = '/home/me/shop'
const EPIC = '/home/me/wt/e-1'
const OTHER = '/home/me/wt/t-9'

const choices: SpawnChoices = {
  repo: MAIN,
  worktrees: [
    { path: MAIN, branch: 'main', main: true },
    { path: EPIC, branch: 'feat/e-1-checkout', parent: MAIN },
    { path: OTHER, branch: 'feat/t-9', busy: true },
  ],
  epic: { id: 'e-1', path: EPIC },
}

const noEpic: SpawnChoices = { ...choices, epic: undefined }

describe('the choice that the spawn window proposes', () => {
  it('proposes a child of the epic worktree in plan mode on the first spawn', () => {
    expect(proposedRequest(bead, choices, null)).toEqual({
      kind: 'child',
      target: EPIC,
      location: 'worktree',
      mode: 'plan',
      branch: 'feat/1-cart-total',
    })
  })

  it('proposes a new worktree in plan mode on the first spawn when the epic has no worktree', () => {
    expect(proposedRequest(bead, noEpic, null)).toEqual({ kind: 'new', location: 'worktree', mode: 'plan', branch: 'feat/1-cart-total' })
  })

  it('proposes again the kind, the location and the mode that the user chose last time in the same database', () => {
    writeSpawnChoice('shop', { kind: 'existing', location: 'parent', mode: 'acceptEdits', target: OTHER, branch: 'feat/x' })
    expect(proposedRequest(bead, choices, readSpawnChoice('shop'))).toMatchObject({ kind: 'existing', location: 'parent', mode: 'acceptEdits', target: EPIC })
    expect(readSpawnChoice('other')).toBeNull()
  })

  it('does not keep the path or the branch of the last spawn', () => {
    writeSpawnChoice('shop', { kind: 'child', location: 'worktree', mode: 'default', target: OTHER, branch: 'feat/x' })
    expect(JSON.parse(window.localStorage.getItem(spawnChoiceKey('shop'))!)).toEqual({ kind: 'child', location: 'worktree', mode: 'default' })
  })

  it('does not keep a spawn with no worktree, and proposes the first-spawn choice again', () => {
    writeSpawnChoice('shop', { kind: 'new', location: 'worktree', mode: 'default', branch: 'feat/x' })
    writeSpawnChoice('shop', { kind: 'none', location: 'worktree', mode: 'default', confirmed: true })
    expect(readSpawnChoice('shop')).toBeNull()
    expect(proposedRequest(bead, choices, readSpawnChoice('shop'))).toMatchObject({ kind: 'child', mode: 'plan' })
  })

  it('proposes the plan mode in place of a last spawn that bypassed the permissions', () => {
    writeSpawnChoice('shop', { kind: 'new', location: 'worktree', mode: 'bypassPermissions', branch: 'feat/x', confirmed: true })
    expect(readSpawnChoice('shop')).toEqual({ kind: 'new', location: 'worktree', mode: 'plan' })
  })

  it('proposes the selected worktree when the proposed worktree has no parent', () => {
    const flat = { repo: MAIN, worktrees: [choices.worktrees[0]!, choices.worktrees[2]!] }
    expect(proposedRequest(bead, flat, { kind: 'existing', location: 'parent', mode: 'plan' })).toMatchObject({ target: MAIN, location: 'worktree' })
    expect(usableLocations({ kind: 'none' }, noEpic)).toEqual(['worktree'])
  })

  it('preselects the main checkout as the parent worktree when no epic worktree applies, and not a merged worktree listed first', () => {
    const dead = { path: '/home/me/wt/chore-memories-migrate', branch: 'chore/memories-migrate', merged: true }
    const listedFirst: SpawnChoices = { repo: MAIN, worktrees: [dead, choices.worktrees[0]!, choices.worktrees[2]!] }
    expect(proposedRequest(bead, listedFirst, { kind: 'child', location: 'worktree', mode: 'plan' })).toMatchObject({ kind: 'child', target: MAIN })
    expect(defaultTarget(listedFirst)).toBe(MAIN)
  })

  it('never preselects a merged worktree when the repo has no main checkout', () => {
    const dead = { path: '/home/me/wt/chore-memories-migrate', branch: 'chore/memories-migrate', merged: true }
    expect(defaultTarget({ repo: MAIN, worktrees: [dead, choices.worktrees[2]!] })).toBe(OTHER)
    expect(defaultTarget({ repo: MAIN, worktrees: [dead], epic: { id: 'e-9', path: dead.path } })).toBeUndefined()
  })

  it('ignores a stored choice that the page cannot read, and a browser that refuses the storage', () => {
    window.localStorage.setItem(spawnChoiceKey('shop'), '{not json')
    expect(readSpawnChoice('shop')).toBeNull()
    const refuse = () => {
      throw new Error('denied')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    expect(() => writeSpawnChoice('shop', { kind: 'new', location: 'worktree', mode: 'plan' })).not.toThrow()
    expect(readSpawnChoice('shop')).toBeNull()
    vi.restoreAllMocks()
  })

  it('offers the parent location of an existing worktree only when that worktree has a parent', () => {
    expect(usableLocations({ kind: 'existing', target: EPIC }, choices)).toEqual(['worktree', 'parent'])
    expect(usableLocations({ kind: 'existing', target: OTHER }, choices)).toEqual(['worktree'])
  })

  it('names the worktree where a Claude session already runs', () => {
    expect(busyPlace({ kind: 'existing', target: OTHER, location: 'worktree', mode: 'plan' }, choices)).toBe(OTHER)
    expect(busyPlace({ kind: 'existing', target: EPIC, location: 'worktree', mode: 'plan' }, choices)).toBeUndefined()
    expect(busyPlace({ kind: 'child', target: OTHER, location: 'worktree', mode: 'plan', branch: 'feat/x' }, choices)).toBeUndefined()
  })

  it('sends only the fields that the chosen kind uses', () => {
    expect(sentRequest({ kind: 'existing', target: EPIC, branch: 'feat/x', location: 'worktree', mode: 'plan', confirmed: true })).toEqual({
      kind: 'existing',
      target: EPIC,
      location: 'worktree',
      mode: 'plan',
    })
  })
})
