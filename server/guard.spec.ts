import { allowsWrite, newToken } from './guard.ts'

const origin = 'http://127.0.0.1:4747'
const token = 'a'.repeat(64)

describe('the write guard of the page', () => {
  it('accepts a write that comes from the page with its token', () => {
    expect(allowsWrite({ origin, 'x-beads-token': token }, origin, token)).toBe(true)
  })

  it('refuses a write that comes without the page token', () => {
    expect(allowsWrite({ origin }, origin, token)).toBe(false)
  })

  it('refuses a write that holds a wrong token', () => {
    expect(allowsWrite({ origin, 'x-beads-token': 'b'.repeat(64) }, origin, token)).toBe(false)
  })

  it('refuses a write that another site sends with the right token', () => {
    expect(allowsWrite({ origin: 'http://evil.test', 'x-beads-token': token }, origin, token)).toBe(false)
  })

  it('makes a new secret token at each server start', () => {
    expect(newToken()).toMatch(/^[0-9a-f]{64}$/)
    expect(newToken()).not.toBe(newToken())
  })
})
