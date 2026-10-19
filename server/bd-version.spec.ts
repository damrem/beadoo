import { bdVersionProblem } from './bd-version.ts'

const printed = (stdout: string, status: number | null = 0) => ({ status, stdout, stderr: '' })

describe('the bd version that beadoo needs', () => {
  it.each(['bd version 1.3.1 (c1c4b642a)', 'bd version 1.3.10', 'bd version 1.4.0', 'bd version 2.0.0 (dev)'])(
    'accepts %s',
    (stdout) => {
      expect(bdVersionProblem(printed(stdout))).toBeUndefined()
    },
  )

  it.each(['bd version 1.3.0 (abc)', 'bd version 1.2.9', 'bd version 0.62.0'])('stops with the minimum version when bd prints %s', (stdout) => {
    expect(bdVersionProblem(printed(stdout))).toBe(`beadoo needs bd 1.3.1 or later. bd --version printed: ${stdout}`)
  })

  it('stops with a clear message when bd is not installed', () => {
    expect(bdVersionProblem({ status: null, stdout: '', stderr: 'spawnSync bd ENOENT' })).toBe(
      'beadoo needs bd 1.3.1 or later, and bd is not on the PATH: spawnSync bd ENOENT',
    )
  })

  it('stops when bd prints a version that it cannot read', () => {
    expect(bdVersionProblem(printed('beads dev build'))).toBe('beadoo needs bd 1.3.1 or later. bd --version printed: beads dev build')
  })

  it('stops when bd --version fails', () => {
    expect(bdVersionProblem(printed('bd version 1.3.1', 1))).toContain('beadoo needs bd 1.3.1 or later')
  })
})
