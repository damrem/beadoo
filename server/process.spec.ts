import { checked } from './process.ts'

const ROLE_WARNING = [
  'warning: beads.role not configured (GH#2950).',
  '  Fix: git config beads.role maintainer',
  '  Or:  git config beads.role contributor',
  '',
].join('\n')

const PERMISSIONS_WARNING =
  'Warning: /repo/.beads has permissions 0755 (recommended: 0700). Run: chmod 700 /repo/.beads\n'

const MISSING_BEAD = '{"error": "resolving t-zzz: no issue found matching \\"t-zzz\\"", "schema_version": 1}'

const failure = (stderr: string, stdout = '') => () => checked({ status: 1, stdout, stderr }, 'bd', ['heartbeat'])

describe('the error that the page shows when bd fails', () => {
  it('gives the error that bd writes on stdout when bd writes only a beads.role warning on stderr', () => {
    expect(failure(ROLE_WARNING, MISSING_BEAD)).toThrow(/no issue found matching/)
    expect(failure(ROLE_WARNING, MISSING_BEAD)).not.toThrow(/beads\.role/)
  })

  it('gives the error that bd writes on stdout when bd writes only a permissions warning on stderr', () => {
    expect(failure(PERMISSIONS_WARNING, MISSING_BEAD)).toThrow(/no issue found matching/)
    expect(failure(PERMISSIONS_WARNING, MISSING_BEAD)).not.toThrow(/permissions/)
  })

  it('keeps the error that bd writes on stderr after a warning', () => {
    const error = failure(`${PERMISSIONS_WARNING}${ROLE_WARNING}Error: database is locked\n`)
    expect(error).toThrow('bd heartbeat failed (exit 1): Error: database is locked')
  })

  it('keeps the indented lines of an error that is not a warning', () => {
    expect(failure('Error: database is locked\n  Retry in 5 s\n')).toThrow(
      'bd heartbeat failed (exit 1): Error: database is locked\n  Retry in 5 s',
    )
  })
})
