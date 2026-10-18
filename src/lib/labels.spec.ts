import { labelParts, mergedLabels } from '@/lib/labels'

describe('the labels of the beads', () => {
  it('reads a label with a colon as a property with a name and a value', () => {
    expect(labelParts('complexity:3')).toEqual({ name: 'complexity', value: '3' })
    expect(labelParts('repo:.team')).toEqual({ name: 'repo', value: '.team' })
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

  it('shows only the complexity of the epic when the children have other complexities', () => {
    expect(
      mergedLabels(['complexity:4'], ['complexity:0', 'front'], ['complexity:2'], ['complexity:4', 'complexity:3']),
    ).toEqual(['complexity:4', 'front'])
  })

  it('keeps the repo of a child when the epic has no repo', () => {
    expect(mergedLabels(['complexity:4'], ['repo:.team', 'complexity:1'])).toEqual(['complexity:4', 'repo:.team'])
  })

  it('keeps each different value of a property that only the children have', () => {
    expect(mergedLabels(['front'], ['repo:a'], ['repo:b'], ['repo:a'])).toEqual(['front', 'repo:a', 'repo:b'])
  })

  it('keeps a plain label of a child that has the name of a property of the epic', () => {
    expect(mergedLabels(['scan:weekly'], ['scan', 'scan:daily'])).toEqual(['scan:weekly', 'scan'])
  })
})
