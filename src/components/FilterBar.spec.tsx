import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'

const renderBar = () =>
  render(
    <FilterBar
      status={['in_progress', 'blocked']}
      statuses={['open', 'in_progress', 'blocked', 'deferred', 'closed', 'blocker']}
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

  it('shows the blockers filter as a word after the statuses', () => {
    renderBar()
    const buttons = screen.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(buttons.at(-1)).toBe('Blockers')
  })

  it('adds the blockers filter to the selected statuses when the user clicks it', async () => {
    const onStatus = vi.fn()
    render(<FilterBar status={['in_progress']} statuses={['open', 'in_progress', 'blocked', 'closed', 'blocker']} text="" onStatus={onStatus} onText={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Blockers' }))
    expect(onStatus).toHaveBeenCalledWith(['in_progress', 'blocker'])
  })
})
