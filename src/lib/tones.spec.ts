import { ACCENTS } from '@/lib/palette'
import { blockedFirst, complexityTone, labelTone, NEUTRAL, priorityTone, statusTone, typeStyle } from '@/lib/tones'

describe('the colours of the beads', () => {
  it('gives each usual status its own colour', () => {
    const tones = ['open', 'in_progress', 'blocked', 'closed', 'deferred'].map(statusTone)
    expect(new Set(tones).size).toBe(tones.length)
    expect(statusTone('blocked')).toBe('red')
  })

  it('gives a neutral colour to an unusual status', () => {
    expect(statusTone('review')).toBe(NEUTRAL)
  })

  it('gives each priority from P0 to P4 its own colour, with P0 in red', () => {
    const tones = [0, 1, 2, 3, 4].map(priorityTone)
    expect(new Set(tones).size).toBe(5)
    expect(priorityTone(0)).toBe('red')
  })

  it('gives a neutral colour to a bead with no priority or an unknown priority', () => {
    expect(priorityTone(undefined)).toBe(NEUTRAL)
    expect(priorityTone(7)).toBe(NEUTRAL)
  })

  it('gives each complexity from 0 to 4 its own colour, also on the complexity label', () => {
    const tones = [0, 1, 2, 3, 4].map(complexityTone)
    expect(new Set(tones).size).toBe(5)
    expect(labelTone('complexity:3')).toBe(complexityTone(3))
  })

  it('gives the same label the same colour each time, from the accents of the palette', () => {
    expect(labelTone('front')).toBe(labelTone('front'))
    expect(ACCENTS).toContain(labelTone('front'))
    expect(ACCENTS).toContain(labelTone('area:server'))
  })

  it('spreads the labels over more than one colour', () => {
    const tones = ['front', 'back', 'docs', 'infra', 'tests', 'ux', 'api', 'perf'].map(labelTone)
    expect(new Set(tones).size).toBeGreaterThan(3)
  })

  it('gives each usual bead type its own colour and a pattern for the card', () => {
    const types = ['epic', 'feature', 'task', 'bug', 'chore']
    const styles = types.map(typeStyle)
    expect(new Set(styles.map((style) => style.tone)).size).toBe(types.length)
    expect(typeStyle('epic').pattern).not.toBe('none')
    expect(typeStyle('bug').tone).toBe('red')
  })

  it('gives a stable accent colour to an unknown bead type, and a neutral colour to a bead with no type', () => {
    expect(ACCENTS).toContain(typeStyle('experiment').tone)
    expect(typeStyle('experiment')).toEqual(typeStyle('experiment'))
    expect(typeStyle(undefined).tone).toBe(NEUTRAL)
  })
})

describe('the order of the status columns', () => {
  it('shows the blocked column first', () => {
    expect(blockedFirst(['open', 'in_progress', 'blocked', 'closed'])).toEqual(['blocked', 'open', 'in_progress', 'closed'])
  })

  it('keeps the order when no bead is blocked', () => {
    expect(blockedFirst(['open', 'closed'])).toEqual(['open', 'closed'])
  })
})
