import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ANY_STATUS, anyOf, READY_ONLY } from '@/lib/filters'
import type { StatusFilter } from '@/lib/filters'
import { FilterBar, TitleSearch } from './FilterBar'

const renderBar = (status: StatusFilter, onStatus: (status: StatusFilter) => void = () => {}) =>
  render(<FilterBar status={status} onStatus={onStatus} />)

describe('the ready and blockers filter', () => {
  it('shows the ready and the blockers filters as words, and no all filter', () => {
    renderBar(ANY_STATUS)
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveTextContent('Ready')
    expect(screen.getByRole('button', { name: 'Blockers' })).toHaveTextContent('Blockers')
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
  })

  it('adds the blockers filter to the ready filter when the user clicks it', async () => {
    const onStatus = vi.fn()
    renderBar(READY_ONLY, onStatus)
    await userEvent.click(screen.getByRole('button', { name: 'Blockers' }))
    expect(onStatus).toHaveBeenCalledWith({ ...READY_ONLY, blocker: true })
  })

  it('keeps the selected statuses when the user clicks the ready filter', async () => {
    const onStatus = vi.fn()
    renderBar(anyOf('in_progress'), onStatus)
    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(onStatus).toHaveBeenCalledWith({ ...anyOf('in_progress'), ready: true })
  })

  it('removes the ready filter when the user clicks it a second time', async () => {
    const onStatus = vi.fn()
    renderBar(READY_ONLY, onStatus)
    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(onStatus).toHaveBeenCalledWith(ANY_STATUS)
  })
})

describe('the search field', () => {
  it('names the fields that the search reads', () => {
    render(<TitleSearch text="" onText={() => {}} />)
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Title, id, description, notes…')
  })
})
