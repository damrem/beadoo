import { render, screen } from '@testing-library/react'
import { FilterBar } from './FilterBar'

const renderBar = () =>
  render(
    <FilterBar
      status={['in_progress', 'blocked']}
      statuses={['open', 'in_progress', 'blocked', 'deferred', 'closed']}
      text=""
      onStatus={() => {}}
      onText={() => {}}
    />,
  )

describe('the status filter', () => {
  it('shows each status as its emoji, with the status name as the tooltip', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'In progress' })).toHaveTextContent('🚧')
    expect(screen.getByRole('button', { name: 'In progress' })).toHaveAttribute('title', 'In progress')
    expect(screen.getByRole('button', { name: 'Deferred' })).toHaveTextContent('💤')
    expect(screen.getByRole('button', { name: 'Closed' })).toHaveTextContent('✅')
  })

  it('shows the ready and the all choices as words', () => {
    renderBar()
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveTextContent('Ready')
    expect(screen.getByRole('button', { name: 'All' })).toHaveTextContent('All')
  })
})
