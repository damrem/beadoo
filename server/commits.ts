import { isAbsolute } from 'node:path'
import { INVALID, SHA } from '../shared/contract.ts'
import type { Commit, DatabaseEntry } from '../shared/contract.ts'
import { StoreError } from './beads-store.ts'
import type { Store } from './beads-store.ts'
import { checked } from './process.ts'
import type { RunAsync } from './process.ts'

export const MAX_COMMITS = 200

const textOf = (value: string | number | undefined) => (value === undefined ? undefined : String(value))

export function createCommits(store: Store, run: RunAsync) {
  return {
    async since(db: DatabaseEntry, id: string): Promise<Commit[]> {
      const { metadata } = await store.showBead(db, id)
      const repoPath = textOf(metadata?.repoPath)
      const baseline = textOf(metadata?.baselineSha)
      if (!repoPath || !isAbsolute(repoPath)) throw new StoreError(INVALID, `The bead ${id} names no repo path.`)
      if (!baseline || !SHA.test(baseline)) throw new StoreError(INVALID, `The baselineSha of the bead ${id} is not a commit sha.`)
      const git = (args: string[]) => run('git', ['-C', repoPath, ...args])
      if ((await git(['rev-parse', '--git-dir'])).status !== 0) {
        throw new StoreError(INVALID, `The repo path ${repoPath} is not a git repo.`)
      }
      if ((await git(['cat-file', '-e', `${baseline}^{commit}`])).status !== 0) {
        throw new StoreError(INVALID, `The repo ${repoPath} has no commit ${baseline}.`)
      }
      if ((await git(['merge-base', '--is-ancestor', baseline, 'HEAD'])).status !== 0) {
        throw new StoreError(INVALID, `The commit ${baseline} is not in the history of the HEAD of ${repoPath}.`)
      }
      const args = ['-C', repoPath, 'log', `--max-count=${MAX_COMMITS}`, '--format=%H%x09%s', `${baseline}..HEAD`]
      return checked(await run('git', args), 'git', args)
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [sha = '', ...subject] = line.split('\t')
          return { sha, subject: subject.join('\t') }
        })
    },
  }
}

export type Commits = ReturnType<typeof createCommits>
