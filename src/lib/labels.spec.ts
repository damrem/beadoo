import { labelParts, mergedLabels } from '@/lib/labels'

describe('the labels of the beads', () => {
  it('reads a label with a colon as a property with a name and a value', () => {
    expect(labelParts('complexity:3')).toEqual({ name: 'complexity', value: '3' })
    expect(labelParts('repo:.claude')).toEqual({ name: 'repo', value: '.claude' })
  })

  it('keeps the text after the first colon as the value', () => {
    expect(labelParts('scan:a:b')).toEqual({ name: 'scan', value: 'a:b' })
  })

  it('reads a label with no colon, or with an empty name or value, as a plain label', () => {
    expect(labelParts('handoff')).toBeNull()
    expect(labelParts(':3')).toBeNull()
    expect(labelParts('repo:')).toBeNull()
  })

  it('merges the labels of an epic and of its children, each one time and in the order found', () => {
    expect(mergedLabels(['front', 'repo:a'], ['repo:a', 'back'], undefined, ['front', 'ux'])).toEqual([
      'front',
      'repo:a',
      'back',
      'ux',
    ])
  })
})
