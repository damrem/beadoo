import { describe, expect, it } from 'vitest'
import { serverAddress } from './address.ts'

describe('the address where beadoo listens', () => {
  it('listens on 127.0.0.1:4747 when the user gives no port', () => {
    expect(serverAddress({})).toEqual({ port: 4747, origin: 'http://127.0.0.1:4747' })
  })

  it('listens on the port that the user gives, so that two worktrees run side by side', () => {
    expect(serverAddress({ PORT: '4748' })).toEqual({ port: 4748, origin: 'http://127.0.0.1:4748' })
  })

  it.each([['a word', 'abc'], ['zero', '0'], ['a port above 65535', '70000'], ['a decimal', '47.5']])(
    'refuses %s as the port',
    (_case, PORT) => {
      expect(serverAddress({ PORT })).toBe(`PORT must be a number from 1 to 65535, and not "${PORT}".`)
    },
  )

  it('accepts the named URL that portless gives to the worktree', () => {
    expect(serverAddress({ PORT: '4123', PORTLESS_URL: 'https://feat-x.beadoo.localhost/' })).toEqual({
      port: 4123,
      origin: 'http://127.0.0.1:4123',
      publicOrigin: 'https://feat-x.beadoo.localhost',
    })
  })

  it('refuses a portless URL that is not a URL', () => {
    expect(serverAddress({ PORTLESS_URL: 'beadoo' })).toBe('PORTLESS_URL must be a URL, and not "beadoo".')
  })
})
