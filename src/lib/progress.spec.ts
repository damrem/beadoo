import { epicMismatch, progressLabel, progressOf, progressPercent } from '@/lib/progress'

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

describe('the warning on an epic whose status disagrees with its children', () => {
  it('tells that an open epic can close when all its children are closed', () => {
    expect(epicMismatch('open', progressOf({ closed: 1 }))).toBe('can-close')
    expect(epicMismatch('in_progress', progressOf({ closed: 2 }))).toBe('can-close')
  })

  it('tells that a closed epic still has an open child', () => {
    expect(epicMismatch('closed', progressOf({ open: 1 }))).toBe('open-child')
    expect(epicMismatch('closed', progressOf({ closed: 3, in_progress: 1 }))).toBe('open-child')
  })

  it('gives no warning when the status of the epic agrees with its children', () => {
    expect(epicMismatch('open', progressOf({ open: 1, closed: 1 }))).toBeNull()
    expect(epicMismatch('closed', progressOf({ closed: 2 }))).toBeNull()
  })

  it('gives no warning on an epic with no child', () => {
    expect(epicMismatch('open', progressOf({}))).toBeNull()
    expect(epicMismatch('closed', progressOf({}))).toBeNull()
  })
})
