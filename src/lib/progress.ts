export type Progress = { closed: number; total: number }

export const progressOf = (counts: Record<string, number>): Progress => ({
  closed: counts.closed ?? 0,
  total: Object.values(counts).reduce((sum, count) => sum + count, 0),
})

export const progressLabel = ({ closed, total }: Progress): string => `${closed}/${total}`

export const progressPercent = ({ closed, total }: Progress): number => (total === 0 ? 0 : Math.round((100 * closed) / total))

export type Mismatch = 'can-close' | 'open-child'

export const MISMATCH_TEXTS: Record<Mismatch, { short: string; full: string }> = {
  'can-close': { short: 'can close', full: 'All the children are closed, so the epic can close.' },
  'open-child': { short: 'open child', full: 'The epic is closed, but a child is still open.' },
}

export function epicMismatch(status: string, { closed, total }: Progress): Mismatch | null {
  if (status !== 'closed' && total > 0 && closed === total) return 'can-close'
  if (status === 'closed' && closed < total) return 'open-child'
  return null
}
