export type Progress = { closed: number; total: number }

export const progressOf = (counts: Record<string, number>): Progress => ({
  closed: counts.closed ?? 0,
  total: Object.values(counts).reduce((sum, count) => sum + count, 0),
})

export const progressLabel = ({ closed, total }: Progress): string => `${closed}/${total}`

export const progressPercent = ({ closed, total }: Progress): number => (total === 0 ? 0 : Math.round((100 * closed) / total))
