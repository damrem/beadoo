import type { Bead } from '../../shared/contract'

export type LeaseState = { kind: 'none' } | { kind: 'active'; until: Date } | { kind: 'expired'; at: Date }

const pad = (value: number) => String(value).padStart(2, '0')

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function formatLeaseTime(date: Date, now: Date): string {
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (sameDay(date, now)) return time
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}

export function leaseState(bead: Bead, now: Date): LeaseState {
  if (bead.status !== 'in_progress' || !bead.lease_expires_at) return { kind: 'none' }
  const expires = new Date(bead.lease_expires_at)
  if (Number.isNaN(expires.getTime())) return { kind: 'none' }
  return expires.getTime() <= now.getTime() ? { kind: 'expired', at: expires } : { kind: 'active', until: expires }
}

export function leaseLabel(state: LeaseState, now: Date): string | undefined {
  if (state.kind === 'expired') return `lease expired at ${formatLeaseTime(state.at, now)}`
  if (state.kind === 'active') return `lease until ${formatLeaseTime(state.until, now)}`
  return undefined
}
