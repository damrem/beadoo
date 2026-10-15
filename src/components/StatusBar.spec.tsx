import { render, screen } from '@testing-library/react'
import { StatusBar } from './StatusBar'

const segmentsOf = (bar: HTMLElement) =>
  Array.from(bar.querySelectorAll<HTMLElement>('[data-status]')).map((segment) => [
    segment.dataset.status,
    segment.style.width,
  ])

describe('the status bar of an epic', () => {
  it('shows one part for each status, as wide as its share of the children', () => {
    render(<StatusBar title="Checkout" counts={{ closed: 1, open: 2, in_progress: 1 }} />)
    const bar = screen.getByRole('img', { name: 'Checkout: 2 Open · 1 In progress · 1 Closed' })
    expect(segmentsOf(bar)).toEqual([
      ['open', '50%'],
      ['in_progress', '25%'],
      ['closed', '25%'],
    ])
  })

  it('gives a colour to each part, also to an unusual status', () => {
    render(<StatusBar title="Checkout" counts={{ open: 1, review: 1 }} />)
    const bar = screen.getByRole('img', { name: /Checkout/ })
    for (const segment of bar.querySelectorAll<HTMLElement>('[data-status]')) {
      expect(segment.className).toMatch(/\bbg-/)
    }
    expect(segmentsOf(bar)).toHaveLength(2)
  })

  it('shows an empty bar when the epic has no child', () => {
    render(<StatusBar title="Checkout" counts={{}} />)
    const bar = screen.getByRole('img', { name: 'Checkout: no bead' })
    expect(segmentsOf(bar)).toEqual([])
  })
})
