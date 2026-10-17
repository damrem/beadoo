import { shortId } from '@/lib/ids'

describe('the ids of the beads', () => {
  it('shows the id without the project prefix', () => {
    expect(shortId('claude-258.1')).toBe('258.1')
    expect(shortId('claude-dp9')).toBe('dp9')
    expect(shortId('mill-a1b')).toBe('a1b')
  })

  it('removes only the prefix before the first hyphen', () => {
    expect(shortId('claude-dp9-x')).toBe('dp9-x')
  })

  it('keeps an id that has no hyphen', () => {
    expect(shortId('dp9')).toBe('dp9')
  })

  it('keeps an id that has no text before or after its hyphen', () => {
    expect(shortId('-dp9')).toBe('-dp9')
    expect(shortId('claude-')).toBe('claude-')
  })
})
