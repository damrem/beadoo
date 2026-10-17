import { cn } from '@/lib/utils'
import { toneStyle } from '@/lib/tones'
import type { Tone } from '@/lib/palette'

export function ToneDot({ tone, title, className }: { tone: Tone; title?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      title={title}
      className={cn('inline-block size-2 shrink-0 rounded-full tone-dot', className)}
      style={toneStyle(tone)}
    />
  )
}
