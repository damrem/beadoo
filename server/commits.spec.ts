import type { Bead } from '../shared/contract.ts'
import type { Store } from './beads-store.ts'
import { createCommits } from './commits.ts'
import type { RunResult } from './process.ts'

const db = { name: 'shop', path: '/home/me/shop' }
const done = (stdout = ''): RunResult => ({ status: 0, stdout, stderr: '' })
const failed: RunResult = { status: 128, stdout: '', stderr: 'fatal' }

const listed = (metadata: Bead['metadata'], answers: { gitDir?: RunResult; commit?: RunResult; branch?: RunResult; ancestor?: RunResult; log?: RunResult } = {}) => {
  const calls: string[][] = []
  const store = { showBead: async (_db: unknown, id: string) => ({ id, title: 'Cart', status: 'open', metadata }) } as unknown as Store
  const commits = createCommits(store, async (_command, args) => {
    calls.push([...args])
    if (args.includes('rev-parse')) return answers.gitDir ?? done('.git\n')
    if (args.includes('cat-file')) return answers.commit ?? done()
    if (args.includes('show-ref')) return answers.branch ?? done()
    if (args.includes('merge-base')) return answers.ancestor ?? done()
    return answers.log ?? done('a1b2c3d4\tAdd the cart total\nb5c6d7e8\tShow the total\twith tax\n')
  })
  return { since: () => commits.since(db, 's-1'), calls }
}

describe('the commits since the baseline sha of a bead', () => {
  it('lists the commits of the repo of the bead since its baseline sha, newest first', async () => {
    const { since, calls } = listed({ repoPath: '/home/me/shop', baselineSha: '465ab60' })
    expect(await since()).toEqual([
      { sha: 'a1b2c3d4', subject: 'Add the cart total' },
      { sha: 'b5c6d7e8', subject: 'Show the total\twith tax' },
    ])
    expect(calls.at(-1)).toEqual(['-C', '/home/me/shop', 'log', '--max-count=200', '--format=%H%x09%s', '465ab60..HEAD'])
  })

  it('shows an empty list when no commit came after the baseline sha', async () => {
    expect(await listed({ repoPath: '/home/me/shop', baselineSha: '465ab60' }, { log: done() }).since()).toEqual([])
  })

  it('refuses a bead with no repo path, or with a repo path that is not absolute', async () => {
    await expect(listed({ baselineSha: '465ab60' }).since()).rejects.toThrow('The bead s-1 names no repo path.')
    await expect(listed({ repoPath: 'shop', baselineSha: '465ab60' }).since()).rejects.toThrow('The bead s-1 names no repo path.')
  })

  it('refuses a baseline that is not a commit sha, and runs no git command', async () => {
    const { since, calls } = listed({ repoPath: '/home/me/shop', baselineSha: '--all' })
    await expect(since()).rejects.toThrow('The baselineSha of the bead s-1 is not a commit sha.')
    expect(calls).toEqual([])
  })

  it('tells the user that the repo path is not a git repo', async () => {
    const { since } = listed({ repoPath: '/home/me/shop', baselineSha: '465ab60' }, { gitDir: failed })
    await expect(since()).rejects.toThrow('The repo path /home/me/shop is not a git repo.')
  })

  it('tells the user that the repo has no commit with the baseline sha', async () => {
    const { since } = listed({ repoPath: '/home/me/shop', baselineSha: '465ab60' }, { commit: failed })
    await expect(since()).rejects.toThrow('The repo /home/me/shop has no commit 465ab60.')
  })

  it('refuses a baseline sha that is not in the history of the HEAD of the repo', async () => {
    const { since } = listed({ repoPath: '/home/me/shop', baselineSha: '465ab60' }, { ancestor: { status: 1, stdout: '', stderr: '' } })
    await expect(since()).rejects.toThrow('The commit 465ab60 is not in the history of the HEAD of /home/me/shop.')
  })

  it('lists the commits when bd stores an all-digit baseline sha as a number', async () => {
    const { since, calls } = listed({ repoPath: '/home/me/shop', baselineSha: 4567890 })
    expect(await since()).toHaveLength(2)
    expect(calls.at(-1)).toContain('4567890..HEAD')
  })

  describe('a bead that names its branch', () => {
    const metadata = { repoPath: '/home/me/shop', baselineSha: '465ab60', branch: 'feat/cart-total' }

    it('lists the commits of the branch of the bead, and not of the checkout', async () => {
      const { since, calls } = listed(metadata)
      await since()
      expect(calls.at(-1)).toContain('465ab60..refs/heads/feat/cart-total')
    })

    it('lists the commits of the checkout when the repo no longer has the branch', async () => {
      const { since, calls } = listed(metadata, { branch: failed })
      await since()
      expect(calls.at(-1)).toContain('465ab60..HEAD')
    })

    it('names the branch when the baseline sha is not in its history', async () => {
      const { since } = listed(metadata, { ancestor: { status: 1, stdout: '', stderr: '' } })
      await expect(since()).rejects.toThrow('The commit 465ab60 is not in the history of the branch feat/cart-total of /home/me/shop.')
    })
  })
})
