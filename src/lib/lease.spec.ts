import { leaseLabel, leaseState } from './lease'
import type { Bead } from '../../shared/contract'

const now = new Date(2026, 9, 14, 23, 50)

const claimed = (expires: Date): Bead => ({
  id: 't-1',
  title: 'Cart total',
  status: 'in_progress',
  assignee: 'me',
  heartbeat_at: new Date(expires.getTime() - 5 * 60_000).toISOString(),
  lease_expires_at: expires.toISOString(),
})

describe('the claim lease of a bead', () => {
  it('tells that the lease of a claimed bead expired', () => {
    const state = leaseState(claimed(new Date(2026, 9, 14, 23, 31)), now)
    expect(state.kind).toBe('expired')
    expect(leaseLabel(state, now)).toBe('lease expired at 23:31')
  })

  it('tells until when the lease of a claimed bead runs', () => {
    const state = leaseState(claimed(new Date(2026, 9, 14, 23, 53)), now)
    expect(state.kind).toBe('active')
    expect(leaseLabel(state, now)).toBe('lease until 23:53')
  })

  it('shows no lease for a bead that nobody works on', () => {
    const bead = { ...claimed(new Date(2026, 9, 14, 23, 31)), status: 'open' }
    expect(leaseState(bead, now).kind).toBe('none')
    expect(leaseState({ id: 't-2', title: 'Pay button', status: 'in_progress' }, now).kind).toBe('none')
    expect(leaseLabel(leaseState(bead, now), now)).toBeUndefined()
  })

  it('gives the date of a lease that expired on an earlier day', () => {
    const state = leaseState(claimed(new Date(2026, 9, 12, 15, 31)), now)
    expect(leaseLabel(state, now)).toBe('lease expired at 2026-10-12 15:31')
  })
})
