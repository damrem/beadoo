import { render, screen, within } from '@testing-library/react'
import { BeadDetail } from './BeadDetail'
import type { Bead } from '../../shared/contract'

const show = async (bead: Partial<Bead>) => {
  const full = { id: 'claude-7', title: 'Cart total', status: 'open', ...bead }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(full), { status: 200 })),
  )
  render(<BeadDetail db=".claude" id={full.id} actor={null} onClose={() => {}} onOpen={() => {}} onWritten={() => {}} />)
  const dialog = await screen.findByRole('dialog')
  await within(dialog).findByText('Cart total')
  return dialog
}

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
})
