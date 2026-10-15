import { changedFields, editableOf, editProblem, isEditRequest, labelProblem, lineDiff, versionOf, withEntry } from './edit.ts'

const bead = {
  id: 's-1',
  title: 'Cart',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['front', 'complexity:2'],
  parent: 's-0',
  dependencies: [
    { id: 's-0', dependency_type: 'parent-child' },
    { id: 's-5', dependency_type: 'blocks' },
  ],
  updated_at: '2026-10-15T10:00:00Z',
  revision: '42',
}

describe('the edit rules of a bead', () => {
  it('gives the blockers of a bead as its dependencies, and not its parent', () => {
    expect(editableOf(bead).dependencies).toEqual(['s-5'])
  })

  it('sees a new revision as a new version of the bead, also in the same second', () => {
    expect(versionOf({ ...bead, revision: '43' })).not.toBe(versionOf(bead))
  })

  it('finds the fields that changed and ignores the order of the labels', () => {
    const before = editableOf(bead)
    expect(changedFields(before, { ...before, labels: ['complexity:2', 'front'], title: 'Basket' })).toEqual(['title'])
  })

  it('accepts one complexity label with a value from 0 to 4', () => {
    expect(labelProblem(['front', 'complexity:4'])).toBeNull()
  })

  it('refuses two complexity labels on one bead', () => {
    expect(labelProblem(['complexity:1', 'complexity:3'])).toMatch(/one complexity label only/)
  })

  it('refuses a complexity value out of the range 0 to 4', () => {
    expect(labelProblem(['complexity:7'])).toMatch(/value from 0 to 4/)
  })

  it('refuses a label with a comma, because bd reads the comma as two labels', () => {
    expect(labelProblem(['a,b'])).toMatch(/space or a comma/)
  })

  it('asks for a reason when the user closes a bead', () => {
    expect(editProblem({ version: '', changes: { status: 'closed' } }, editableOf(bead))).toMatch(/reason/)
    expect(editProblem({ version: '', changes: { status: 'closed' }, closeReason: 'Done' }, editableOf(bead))).toBeNull()
  })

  it('refuses a text with a NUL character, because bd cannot take it', () => {
    const current = editableOf(bead)
    expect(editProblem({ version: '', changes: { title: 'Cart\0' } }, current)).toMatch(/NUL/)
    expect(editProblem({ version: '', changes: { status: 'closed' }, closeReason: 'Done\0' }, current)).toMatch(/NUL/)
    expect(editProblem({ version: '', changes: {}, noteEntry: 'paused\0' }, current)).toMatch(/NUL/)
  })

  it('refuses a parent that is not a bead id', () => {
    expect(editProblem({ version: '', changes: { parent: '--force' } }, editableOf(bead))).toMatch(/not a bead id/)
  })

  it('refuses an edit with a field that the page does not edit', () => {
    expect(isEditRequest({ version: 'v', changes: { assignee: 'Bob' } })).toBe(false)
    expect(isEditRequest({ version: 'v', changes: { priority: 1, labels: ['a'] } })).toBe(true)
  })

  it('adds a note entry with its date stamp on a new line', () => {
    expect(withEntry('first\n', '2026-10-15 12:00', ' second ')).toBe('first\n2026-10-15 12:00 second')
    expect(withEntry('', '2026-10-15 12:00', 'first')).toBe('2026-10-15 12:00 first')
  })

  it('shows the lines that only my text holds and the lines that only their text holds', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'mine', text: 'b' },
      { kind: 'theirs', text: 'x' },
      { kind: 'same', text: 'c' },
    ])
  })
})
