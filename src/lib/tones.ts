import type { CSSProperties } from 'react'
import { ACCENTS, toneVar } from '@/lib/palette'
import type { Accent, Tone } from '@/lib/palette'

export const NEUTRAL: Tone = 'overlay1'

const STATUS_TONES: Record<string, Tone> = {
  open: 'blue',
  in_progress: 'peach',
  blocked: 'red',
  closed: 'green',
  deferred: 'mauve',
  pinned: 'lavender',
  hooked: 'sapphire',
}

const PRIORITY_TONES: Tone[] = ['red', 'peach', 'yellow', 'blue', NEUTRAL]

const COMPLEXITY_TONES: Tone[] = ['teal', 'sky', 'blue', 'lavender', 'mauve']

const LABEL_TONES: Record<string, Tone> = {
  handoff: 'pink',
}

export type Pattern = 'none' | 'stripes' | 'dots' | 'hatch' | 'lines'

export type TypeStyle = { tone: Tone; pattern: Pattern }

const TYPE_STYLES: Record<string, TypeStyle> = {
  epic: { tone: 'mauve', pattern: 'stripes' },
  feature: { tone: 'blue', pattern: 'dots' },
  task: { tone: 'green', pattern: 'none' },
  bug: { tone: 'red', pattern: 'hatch' },
  chore: { tone: NEUTRAL, pattern: 'lines' },
  decision: { tone: 'yellow', pattern: 'dots' },
  spike: { tone: 'sky', pattern: 'lines' },
  story: { tone: 'teal', pattern: 'none' },
  milestone: { tone: 'peach', pattern: 'stripes' },
  message: { tone: 'lavender', pattern: 'none' },
  gate: { tone: 'maroon', pattern: 'hatch' },
  molecule: { tone: 'pink', pattern: 'dots' },
  agent: { tone: 'sapphire', pattern: 'lines' },
  role: { tone: 'flamingo', pattern: 'none' },
  event: { tone: 'rosewater', pattern: 'lines' },
}

const COMPLEXITY_LABEL = /^complexity:(\d+)$/

export const hashOf = (text: string): number => {
  let hash = 0x811c9dc5
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

const hashedAccent = (text: string): Accent => ACCENTS[hashOf(text) % ACCENTS.length]

export const statusTone = (status: string): Tone => STATUS_TONES[status] ?? NEUTRAL

export const priorityTone = (priority: number | undefined): Tone =>
  (priority !== undefined && PRIORITY_TONES[priority]) || NEUTRAL

export const complexityTone = (level: number): Tone => COMPLEXITY_TONES[level] ?? NEUTRAL

export function labelTone(label: string): Tone {
  const complexity = COMPLEXITY_LABEL.exec(label)
  if (complexity) return complexityTone(Number(complexity[1]))
  return LABEL_TONES[label] ?? hashedAccent(label)
}

export const typeStyle = (type: string | undefined): TypeStyle =>
  type === undefined ? { tone: NEUTRAL, pattern: 'none' } : TYPE_STYLES[type] ?? { tone: hashedAccent(type), pattern: 'none' }

export const blockedFirst = (statuses: string[]): string[] =>
  statuses.includes('blocked') ? ['blocked', ...statuses.filter((status) => status !== 'blocked')] : statuses

export const toneStyle = (tone: Tone): CSSProperties => ({ '--tone': toneVar(tone) }) as CSSProperties
