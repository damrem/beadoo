import { beadAddressOf, beadUrl } from './urls'

describe('the address of a bead page', () => {
  it('holds the database and the bead id, and gives them back when the page opens', () => {
    const url = new URL(beadUrl('.team', 'claude-31u.9'), 'http://127.0.0.1:4747')
    expect(url.pathname).toBe('/bead')
    expect(beadAddressOf(url)).toEqual({ db: '.team', id: 'claude-31u.9' })
  })

  it('keeps a database name with special characters', () => {
    const url = new URL(beadUrl('my db&co', 'x-1'), 'http://127.0.0.1:4747')
    expect(beadAddressOf(url)).toEqual({ db: 'my db&co', id: 'x-1' })
  })

  it('does not open a bead page for the board address or for an address with no bead id', () => {
    expect(beadAddressOf({ pathname: '/', search: '?db=.team&bead=x-1' })).toBeNull()
    expect(beadAddressOf({ pathname: '/bead', search: '?db=.team' })).toBeNull()
  })
})
