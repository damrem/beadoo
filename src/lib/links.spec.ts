import { childBeadsOf, dependenciesOf, dependentsOf } from './links'

const beads = [
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic' },
  { id: 't-3', title: 'Receipt mail', status: 'closed', parent: 'e-1' },
  { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', priority: 1 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1', priority: 2 },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
]

describe('the children of a bead', () => {
  it('lists each child of the bead with its title and status, the most urgent first', () => {
    expect(childBeadsOf(beads, 'e-1')).toEqual([
      { id: 't-2', title: 'Pay button', status: 'open' },
      { id: 't-1', title: 'Cart total', status: 'open' },
      { id: 't-3', title: 'Receipt mail', status: 'closed' },
    ])
  })

  it('lists no child for a bead that has no child', () => {
    expect(childBeadsOf(beads, 't-4')).toEqual([])
  })
})

describe('the dependency links of a bead', () => {
  const listed = [
    {
      id: 'q-1',
      title: 'Ship the release',
      status: 'open',
      dependencies: [
        { issue_id: 'q-1', depends_on_id: 'r-1', type: 'blocks' },
        { issue_id: 'q-1', depends_on_id: 'r-2', type: 'relates-to' },
        { issue_id: 'q-1', depends_on_id: 'e-9', type: 'parent-child' },
      ],
    },
    { id: 'r-1', title: 'Fix the build', status: 'closed' },
    { id: 'r-2', title: 'Write the notes', status: 'in_progress' },
    { id: 's-1', title: 'Announce the release', status: 'open', dependencies: [{ issue_id: 's-1', depends_on_id: 'q-1', type: 'blocks' }] },
    { id: 's-2', title: 'Find the regression', status: 'open', dependencies: [{ issue_id: 's-2', depends_on_id: 'q-1', type: 'discovered-from' }] },
  ] as unknown as Parameters<typeof dependentsOf>[0]

  it('names the beads that the bead depends on, with the type of each link, and leaves out the parent', () => {
    const shown = {
      id: 'q-1',
      title: 'Ship the release',
      status: 'open',
      dependencies: [
        { id: 'r-1', title: 'Fix the build', status: 'closed', dependency_type: 'blocks' },
        { id: 'r-2', title: 'Write the notes', status: 'in_progress', dependency_type: 'relates-to' },
        { id: 'e-9', dependency_type: 'parent-child' },
      ],
    }
    expect(dependenciesOf(shown, listed)).toEqual([
      { id: 'r-1', title: 'Fix the build', status: 'closed', type: 'blocked by' },
      { id: 'r-2', title: 'Write the notes', status: 'in_progress', type: 'relates to' },
    ])
  })

  it('names the same dependencies when the bead comes from the bead list', () => {
    expect(dependenciesOf(listed[0]!, listed).map((link) => `${link.type} ${link.id}`)).toEqual(['blocked by r-1', 'relates to r-2'])
  })

  it('names the beads that depend on the bead, with the type of each link', () => {
    expect(dependentsOf(listed, 'q-1')).toEqual([
      { id: 's-1', title: 'Announce the release', status: 'open', type: 'blocks' },
      { id: 's-2', title: 'Find the regression', status: 'open', type: 'led to' },
    ])
  })

  it('names no dependency for a bead that depends on no bead', () => {
    expect(dependenciesOf(listed[1]!, listed)).toEqual([])
  })

  it('names no dependent for a bead that no other bead depends on', () => {
    expect(dependentsOf(listed, 's-2')).toEqual([])
  })
})
