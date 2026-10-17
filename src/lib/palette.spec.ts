import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ACCENTS, contrastRatio, LATTE, mix, MOCHA, TINT_PERCENT } from '@/lib/palette'
import type { Flavor } from '@/lib/palette'

const css = readFileSync(join(import.meta.dirname, '../index.css'), 'utf8')

const variablesOf = (selector: string): Record<string, string> => {
  const start = css.indexOf(`\n${selector} {`)
  const body = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
}

const resolve = (variables: Record<string, string>, name: string): string => {
  const value = variables[name]
  const reference = /^var\(--([\w-]+)\)$/.exec(value)
  return reference ? resolve(variables, reference[1]) : value
}

const MODES: [string, string, Flavor][] = [
  ['light', ':root', LATTE],
  ['dark', '.dark', MOCHA],
]

const STRONGEST_PATTERN_PERCENT = 21

describe.each(MODES)('the %s mode', (_mode, selector, flavor) => {
  const variables = variablesOf(selector)
  const token = (name: string) => resolve(variables, name)

  it('uses the colours of the Catppuccin palette', () => {
    for (const [name, hex] of Object.entries(flavor)) expect(variables[`ctp-${name}`]).toBe(hex)
  })

  it.each([
    ['foreground', 'background'],
    ['foreground', 'card'],
    ['foreground', 'muted'],
    ['foreground', 'accent'],
    ['muted-foreground', 'background'],
    ['muted-foreground', 'card'],
    ['muted-foreground', 'muted'],
    ['card-foreground', 'card'],
    ['popover-foreground', 'popover'],
    ['primary-foreground', 'primary'],
    ['secondary-foreground', 'secondary'],
    ['accent-foreground', 'accent'],
    ['sidebar-foreground', 'sidebar'],
    ['destructive', 'card'],
  ])('keeps the text colour %s readable on %s', (text, surface) => {
    expect(contrastRatio(token(text), token(surface))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the text readable on each coloured chip and card header', () => {
    for (const tone of [...ACCENTS, 'overlay1' as const]) {
      for (const percent of [TINT_PERCENT, STRONGEST_PATTERN_PERCENT]) {
        const surface = mix(flavor[tone], token('card'), percent)
        expect(contrastRatio(token('foreground'), surface), `${tone} at ${percent}%`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

describe('the coloured chips and card headers', () => {
  it('use the tint strength that the contrast check measures', () => {
    const tints = [...css.matchAll(/var\(--tone\) (\d+)%, var\(--color-card\)/g)].map((match) => Number(match[1]))
    expect(tints.length).toBeGreaterThan(0)
    expect(new Set(tints)).toEqual(new Set([TINT_PERCENT]))
    const patterns = [...css.matchAll(/var\(--tone\) (\d+)%, transparent/g)].map((match) => Number(match[1]))
    expect(TINT_PERCENT + (Math.max(...patterns) * (100 - TINT_PERCENT)) / 100).toBeLessThanOrEqual(STRONGEST_PATTERN_PERCENT)
  })
})
