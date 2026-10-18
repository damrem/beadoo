import { branchFor, branchProblem, isSpawnRequest, MAX_BRANCH_LENGTH } from './spawn.ts'

describe('the branch of a new session', () => {
  it('starts the branch at the bead id, with no project name', () => {
    expect(
      branchFor({ id: 'claude-2qx', title: 'Mill: finish the git repair after the crash', issue_type: 'task' }),
    ).toBe('feat/2qx-mill-finish-git-repair')
  })

  it('keeps the child number of a bead id in the branch', () => {
    expect(branchFor({ id: 'claude-1vi.6', title: 'Claim and spawn a session', issue_type: 'feature' })).toBe(
      'feat/1vi-6-claim-spawn-session',
    )
  })

  it('keeps only the last part of a project name with hyphens', () => {
    expect(branchFor({ id: 'my-shop-a1b', title: 'Cart total', issue_type: 'task' })).toBe('feat/a1b-cart-total')
  })

  it('keeps a few short words of the title and drops the filler words', () => {
    expect(
      branchFor({ id: 'claude-0fo.11', title: 'beadoo: shorter branch name for a bead, from the id, in caveman style', issue_type: 'task' }),
    ).toBe('feat/0fo-11-beadoo-shorter-branch-name')
  })

  it('proposes a fix branch for a bug and a chore branch for a chore', () => {
    expect(branchFor({ id: 's-1', title: 'Logo', issue_type: 'bug' })).toBe('fix/1-logo')
    expect(branchFor({ id: 's-1', title: 'Logo', issue_type: 'chore' })).toBe('chore/1-logo')
  })

  it('removes the accents and the signs of the title from the branch', () => {
    expect(branchFor({ id: 's-1', title: 'Prix «réduit» & total!', issue_type: 'task' })).toBe('feat/1-prix-reduit-total')
  })

  it('proposes a branch with the id only when the title has only filler words', () => {
    expect(branchFor({ id: 'claude-x9z', title: 'The and of', issue_type: 'task' })).toBe('feat/x9z')
  })

  it('proposes a branch that the page accepts, also for a long title', () => {
    const branch = branchFor({ id: 's-1', title: 'word '.repeat(40), issue_type: 'task' })
    expect(branchProblem(branch)).toBeNull()
  })

  it('accepts a branch of a type and a slug', () => {
    expect(branchProblem('feat/cart-total')).toBeNull()
  })

  it.each([
    ['a branch with no type', 'cart-total'],
    ['a branch with a space', 'feat/cart total'],
    ['a branch with two dots', 'feat/cart..total'],
    ['a branch that starts with a hyphen', 'feat/-cart'],
    ['a branch with an option in it', '--force'],
    ['a branch with uppercase letters', 'feat/Cart'],
    ['an empty branch', ''],
  ])('refuses %s', (_case, branch) => {
    expect(branchProblem(branch)).toMatch(/<type>\/<slug>/)
  })

  it('refuses a branch that is too long', () => {
    expect(branchProblem(`feat/${'a'.repeat(MAX_BRANCH_LENGTH)}`)).toMatch(/longer than/)
  })

  it('accepts a request that gives a branch, and refuses a request with no branch', () => {
    expect(isSpawnRequest({ branch: 'feat/x' })).toBe(true)
    expect(isSpawnRequest({ branch: 3 })).toBe(false)
    expect(isSpawnRequest(null)).toBe(false)
  })
})
