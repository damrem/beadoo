import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BeadDetail } from './BeadDetail'
import type { Bead } from '../../shared/contract'

const show = async (bead: Partial<Bead>) => {
  const full = { id: 'claude-7', title: 'Cart total', status: 'open', ...bead }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(full), { status: 200 })),
  )
  render(<BeadDetail db=".team" id={full.id} actor={null} onClose={() => {}} onOpen={() => {}} onWritten={() => {}} />)
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByText('Cart total')
  return dialog
}

const toneOf = (element: Element | null) => (element as HTMLElement | null)?.style.getPropertyValue('--tone')

beforeAll(async () => {
  await import('./Markdown')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the detail of a bead', () => {
  it('shows the headings and the bold text of the description', async () => {
    const dialog = await show({ description: '## Work done\n\nThe file is **untracked**, see `bd show`.' })
    expect(await within(dialog).findByRole('heading', { name: 'Work done' })).toBeInTheDocument()
    expect(within(dialog).getByText('untracked').tagName).toBe('STRONG')
    expect(within(dialog).getByText('bd show').tagName).toBe('CODE')
    expect(within(dialog).queryByText(/##/)).not.toBeInTheDocument()
  })

  it('shows the lists, the tables and the links of the notes, and opens a link in a new tab', async () => {
    const dialog = await show({
      notes: '- first step\n- second step\n\n| Gate | Result |\n| --- | --- |\n| test | pass |\n\n[the log](https://example.com/log)',
    })
    expect((await within(dialog).findAllByRole('listitem')).map((item) => item.textContent)).toEqual(['first step', 'second step'])
    expect(within(dialog).getByRole('cell', { name: 'pass' })).toBeInTheDocument()
    const link = within(dialog).getByRole('link', { name: 'the log' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('does not add the HTML of the description to the page', async () => {
    const dialog = await show({ description: 'Before <img src="x" onerror="alert(1)"> **after**' })
    await within(dialog).findByText('after', { selector: 'strong' })
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
    expect(dialog.querySelector('img')).toBeNull()
  })

  it('shows the status, the priority and the type in the same colours as the card', async () => {
    const dialog = await show({ status: 'blocked', priority: 0, issue_type: 'bug' })
    const status = within(dialog).getByText('Blocked')
    expect(status).toHaveTextContent('⛔Blocked')
    expect(status.querySelector('.tone-dot')).toBeNull()
    expect(toneOf(within(dialog).getByText('P0'))).toBe('var(--ctp-red)')
    expect(within(dialog).getByText('bug')).toHaveTextContent('🐛bug')
    expect(toneOf(within(dialog).getByText('bug'))).toBe('var(--ctp-red)')
  })

  it('shows the id without the project prefix and gives the full id on hover', async () => {
    const dialog = await show({ id: 'claude-258.1', parent: 'claude-dp9' })
    const header = within(dialog).getByTitle('claude-258.1')
    expect(header).toHaveTextContent(/^258\.1$/)
    expect(within(dialog).getByRole('link', { name: 'dp9' }).firstElementChild).toHaveAttribute('title', 'claude-dp9')
  })

  it('copies the full address of the bead page when the user clicks the copy button', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const dialog = await show({ id: 'claude-31u.9' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }))
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/bead?db=.team&id=claude-31u.9`)
    expect(await within(dialog).findByRole('button', { name: 'Link copied' })).toBeInTheDocument()
  })
  it('shows how many open beads the bead waits on, and their ids, whatever its own status', async () => {
    const dialog = await show({
      status: 'in_progress',
      dependencies: [
        { id: 'claude-1', status: 'open', dependency_type: 'blocks' },
        { id: 'claude-2', status: 'closed', dependency_type: 'blocks' },
        { id: 'claude-3', status: 'open', dependency_type: 'parent-child' },
      ],
    })
    expect(within(dialog).getByText(/waits on 1/)).toHaveTextContent('waits on 1: 1')
  })

  it('shows no wait line when all the blockers of the bead are closed', async () => {
    const dialog = await show({ dependencies: [{ id: 'claude-2', status: 'closed', dependency_type: 'blocks' }] })
    expect(within(dialog).queryByText(/waits on/)).not.toBeInTheDocument()
  })
})
