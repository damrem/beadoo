import { branchFor, branchProblem, isSpawnRequest, MAX_BRANCH_LENGTH } from './spawn.ts'

describe('the branch of a new session', () => {
  it('proposes a feature branch with the id and the title of the bead', () => {
    expect(branchFor({ id: 'claude-1vi.6', title: 'Claim and spawn a session', issue_type: 'feature' })).toBe(
      'feat/claude-1vi-6-claim-and-spawn-a-session',
    )
  })

  it('proposes a fix branch for a bug and a chore branch for a chore', () => {
    expect(branchFor({ id: 's-1', title: 'Logo', issue_type: 'bug' })).toBe('fix/s-1-logo')
    expect(branchFor({ id: 's-1', title: 'Logo', issue_type: 'chore' })).toBe('chore/s-1-logo')
  })

  it('removes the accents and the signs of the title from the branch', () => {
    expect(branchFor({ id: 's-1', title: 'Prix «réduit» & total!', issue_type: 'task' })).toBe('feat/s-1-prix-reduit-total')
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
