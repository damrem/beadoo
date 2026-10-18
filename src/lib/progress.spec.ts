import { progressLabel, progressOf, progressPercent } from '@/lib/progress'

describe('the progress of an epic', () => {
  it('counts the closed children over all the children', () => {
    const progress = progressOf({ open: 2, in_progress: 1, blocked: 1, closed: 13 })
    expect(progressLabel(progress)).toBe('13/17')
    expect(progressPercent(progress)).toBe(76)
  })

  it('shows an empty bar for an epic with no child', () => {
    const progress = progressOf({})
    expect(progressLabel(progress)).toBe('0/0')
    expect(progressPercent(progress)).toBe(0)
  })

  it('shows a full bar when all the children are closed', () => {
    expect(progressPercent(progressOf({ closed: 3 }))).toBe(100)
  })
})
