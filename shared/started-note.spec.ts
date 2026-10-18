import { lastStarted, startedLine, startedNotes } from './started-note.ts'

describe('the note that the page writes when a session starts', () => {
  const note = {
    at: '2026-10-18 09:05',
    kind: 'child',
    worktree: '/home/me/orca/workspaces/shop/feat-1-cart',
    branch: 'feat/1-cart',
    parent: '/home/me/orca/workspaces/shop/epic',
    location: 'worktree',
    mode: 'plan',
  }

  it('writes the start on one line of key=value pairs', () => {
    expect(startedLine(note)).toBe(
      'started 2026-10-18 09:05 kind=child worktree=/home/me/orca/workspaces/shop/feat-1-cart branch=feat/1-cart parent=/home/me/orca/workspaces/shop/epic location=worktree mode=plan',
    )
  })

  it('leaves out a value that the start does not have', () => {
    expect(startedLine({ at: '2026-10-18 09:05', kind: 'new', worktree: '/w', location: 'worktree', mode: 'plan' })).toBe(
      'started 2026-10-18 09:05 kind=new worktree=/w location=worktree mode=plan',
    )
  })

  it('reads back each value that it wrote', () => {
    expect(startedNotes(startedLine(note))).toEqual([note])
  })

  it('keeps a path with a space in one value', () => {
    const line = startedLine({ at: '2026-10-18 09:05', worktree: '/home/me/my shop' })
    expect(line).toBe('started 2026-10-18 09:05 worktree="/home/me/my shop"')
    expect(lastStarted(line)?.worktree).toBe('/home/me/my shop')
  })

  it('reads the older start note that names only the worktree', () => {
    expect(lastStarted('started 2026-10-16 17:45 in /home/me/wt/cart')).toEqual({ at: '2026-10-16 17:45', worktree: '/home/me/wt/cart' })
  })

  it('takes the last start among the other notes of the bead', () => {
    const notes = [
      'started 2026-10-16 17:45 in /home/me/wt/old',
      'released 2026-10-16 17:46: no session started in /home/me/wt/old. Cause: Timed out',
      '2026-10-17 10:00 The user asked for a smaller scope.',
      startedLine({ at: '2026-10-18 09:05', kind: 'existing', worktree: '/home/me/wt/new' }),
    ].join('\n')
    expect(lastStarted(notes)).toMatchObject({ at: '2026-10-18 09:05', worktree: '/home/me/wt/new' })
  })

  it('finds no start in notes that have none', () => {
    expect(lastStarted('2026-10-17 10:00 started the review')).toBeNull()
    expect(lastStarted(null)).toBeNull()
  })
})
