import { labelEmoji, statusEmoji, typeEmoji } from '@/lib/emojis'

describe('the emojis of the beads', () => {
  it('shows a wave for a handoff bead', () => {
    expect(labelEmoji('handoff')).toBe('👋')
  })

  it('gives each usual status its own emoji', () => {
    const emojis = ['open', 'in_progress', 'blocked', 'closed', 'deferred'].map(statusEmoji)
    expect(emojis.every(Boolean)).toBe(true)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  it('gives each usual type its own emoji', () => {
    const emojis = ['epic', 'feature', 'task', 'bug', 'chore'].map(typeEmoji)
    expect(emojis.every(Boolean)).toBe(true)
    expect(new Set(emojis).size).toBe(emojis.length)
  })

  it('gives a property label the emoji of its name, for each value', () => {
    expect(labelEmoji('repo:.claude')).toBe(labelEmoji('repo:mill'))
    expect(labelEmoji('complexity:0')).toBe(labelEmoji('complexity:4'))
    expect(labelEmoji('repo:.claude')).toBeDefined()
  })

  it('shows no emoji for an unknown status, type or label', () => {
    expect(statusEmoji('review')).toBeUndefined()
    expect(typeEmoji('unknown')).toBeUndefined()
    expect(typeEmoji(undefined)).toBeUndefined()
    expect(labelEmoji('front')).toBeUndefined()
    expect(labelEmoji('team:front')).toBeUndefined()
  })
})
