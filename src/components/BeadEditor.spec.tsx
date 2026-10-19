import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Bead } from '../../shared/contract'
import type { EditRequest } from '../../shared/edit'
import { BeadEditor } from './BeadEditor'

const bead: Bead = {
  id: 't-1',
  title: 'Cart total',
  status: 'open',
  priority: 2,
  issue_type: 'task',
  labels: ['front', 'complexity:2'],
  parent: 'e-1',
  description: 'Show the total.\nRound to cents.',
  notes: '2026-10-14 10:00 started',
  dependencies: [
    { id: 'e-1', dependency_type: 'parent-child' },
    { id: 't-2', dependency_type: 'blocks' },
  ],
  updated_at: '2026-10-15T10:00:00Z',
  revision: '41',
}

type Answer = { status: number; body: unknown }

let answers: Answer[]
let sent: { path: string; token: string; body: EditRequest }[]

beforeEach(() => {
  answers = []
  sent = []
  const meta = document.createElement('meta')
  meta.name = 'beads-token'
  meta.content = 'page-token'
  document.head.append(meta)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      sent.push({
        path: input,
        token: (init?.headers as Record<string, string>)['x-beads-token']!,
        body: JSON.parse(String(init?.body)) as EditRequest,
      })
      const answer = answers.shift() ?? { status: 200, body: bead }
      return new Response(JSON.stringify(answer.body), { status: answer.status })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.querySelector('meta[name="beads-token"]')?.remove()
})

const open = (overrides: Partial<Bead> = {}) => {
  const onSaved = vi.fn()
  const onPartlySaved = vi.fn()
  const onCancel = vi.fn()
  render(
    <BeadEditor
      db=".team"
      bead={{ ...bead, ...overrides }}
      onSaved={onSaved}
      onPartlySaved={onPartlySaved}
      onCancel={onCancel}
    />,
  )
  return { onSaved, onPartlySaved, onCancel }
}

const field = (name: string) => screen.getByLabelText(name)

const replace = async (name: string, value: string) => {
  await userEvent.clear(field(name))
  if (value) await userEvent.type(field(name), value)
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('the edit of a bead', () => {
  it('saves the new title, priority and type, and sends only the fields that the user changed', async () => {
    const { onSaved } = open()
    await replace('Title', 'Basket total')
    await userEvent.selectOptions(field('Priority'), 'P1')
    await userEvent.selectOptions(field('Type'), 'bug')
    await save()
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(sent).toEqual([
      {
        path: '/api/beads/t-1/edit?db=.team',
        token: 'page-token',
        body: { version: '2026-10-15T10:00:00Z|41', changes: { title: 'Basket total', priority: 1, issue_type: 'bug' } },
      },
    ])
  })

  it('changes the description, the parent and the dependencies', async () => {
    open()
    await replace('Description', 'Show the total.')
    await replace('Parent', 'e-2')
    await replace('Dependencies', 't-3, t-4')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body.changes).toEqual({ parent: 'e-2', dependencies: ['t-3', 't-4'], description: 'Show the total.' })
  })

  it('replaces the complexity label with the value that the user selects, and keeps the other labels', async () => {
    open()
    await userEvent.selectOptions(field('Complexity'), '3')
    await replace('Labels', 'front back')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body.changes.labels).toEqual(['front', 'back', 'complexity:3'])
  })

  it('saves a complexity label that the user types in the labels, once', async () => {
    open({ labels: ['front'] })
    await replace('Labels', 'ui complexity:3 back')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body.changes.labels).toEqual(['ui', 'complexity:3', 'back'])
  })

  it('asks for a reason before it closes the bead, and sends the reason', async () => {
    open()
    await userEvent.selectOptions(field('Status'), 'closed')
    await save()
    expect(await screen.findByText('Give a reason to close the bead.')).toBeInTheDocument()
    expect(sent).toEqual([])
    await userEvent.type(field('Close reason'), 'Shipped in 1.2')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body).toMatchObject({ changes: { status: 'closed' }, closeReason: 'Shipped in 1.2' })
  })

  it('sends a new note entry, and the server adds its date stamp', async () => {
    open()
    await userEvent.type(field('New note entry'), 'paused for the review')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body).toEqual({ version: '2026-10-15T10:00:00Z|41', changes: {}, noteEntry: 'paused for the review' })
  })

  it('lets the user edit the notes freely', async () => {
    open()
    await replace('Notes', 'all new')
    await save()
    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]!.body.changes).toEqual({ notes: 'all new' })
  })

  it('closes the form and sends nothing when the user changed nothing', async () => {
    const { onCancel } = open()
    await save()
    expect(onCancel).toHaveBeenCalled()
    expect(sent).toEqual([])
  })

  it('tells the user why the server refused the edit', async () => {
    answers = [{ status: 400, body: { error: 'A bead takes one complexity label only.', code: 'INVALID' } }]
    open()
    await replace('Title', 'Basket total')
    await save()
    expect(await screen.findByText('A bead takes one complexity label only.')).toBeInTheDocument()
  })

  describe('when the server wrote a part of the edit, then failed', () => {
    const written: Bead = {
      ...bead,
      notes: '2026-10-14 10:00 started\n2026-10-15 12:30 paused for the review',
      updated_at: '2026-10-15T12:30:00Z',
      revision: '42',
    }

    const partial = {
      status: 500,
      body: { error: 'The page wrote 1 of 2 changes of the edit, then bd dep add failed', code: 'PARTIAL_WRITE', bead: written },
    }

    it('shows the fields that the server wrote in the detail and on the board', async () => {
      answers = [partial]
      const { onPartlySaved, onSaved } = open()
      await userEvent.type(field('New note entry'), 'paused for the review')
      await replace('Dependencies', 't-2, t-9')
      await save()
      expect(await screen.findByText(/wrote 1 of 2 changes/)).toBeInTheDocument()
      expect(onPartlySaved).toHaveBeenCalledWith(written)
      expect(onSaved).not.toHaveBeenCalled()
    })

    it('does not add the note entry a second time when the user saves again', async () => {
      answers = [partial]
      open()
      await userEvent.type(field('New note entry'), 'paused for the review')
      await replace('Dependencies', 't-2, t-9')
      await save()
      await screen.findByText(/wrote 1 of 2 changes/)
      expect(field('New note entry')).toHaveValue('')
      await save()
      await waitFor(() => expect(sent).toHaveLength(2))
      expect(sent[1]!.body).toEqual({ version: '2026-10-15T12:30:00Z|42', changes: { dependencies: ['t-2', 't-9'] } })
    })
  })

  describe('when somebody changed the bead after the page read it', () => {
    const theirs: Bead = {
      ...bead,
      title: 'Cart sum',
      description: 'Show the total.\nRound up.',
      priority: 0,
      updated_at: '2026-10-15T10:05:00Z',
      revision: '42',
    }

    const stale = { status: 409, body: { error: 'Somebody changed t-1', code: 'STALE', bead: theirs } }

    it('shows each changed field with my value and their value, and a line diff for a text field', async () => {
      answers = [stale]
      open()
      await replace('Title', 'Basket total')
      await save()
      const conflict = await screen.findByRole('region', { name: 'Conflict' })
      const title = within(conflict).getByRole('group', { name: 'Title' })
      expect(within(title).getByText('Basket total', { exact: false })).toBeInTheDocument()
      expect(within(title).getByText('Cart sum', { exact: false })).toBeInTheDocument()
      const description = within(conflict).getByRole('group', { name: 'Description' })
      expect(within(description).getByText('Round to cents.', { exact: false })).toHaveTextContent(/^mine/)
      expect(within(description).getByText('Round up.', { exact: false })).toHaveTextContent(/^theirs/)
      const priority = within(conflict).getByRole('group', { name: 'Priority' })
      expect(within(priority).getByText('P2')).toBeInTheDocument()
      expect(within(priority).getByText('P0')).toBeInTheDocument()
      expect(within(conflict).queryByRole('group', { name: 'Labels' })).not.toBeInTheDocument()
    })

    it('keeps my value for a field that I changed and takes their value for the other fields, by default', async () => {
      answers = [stale]
      open()
      await replace('Title', 'Basket total')
      await save()
      const conflict = await screen.findByRole('region', { name: 'Conflict' })
      expect(within(conflict).getByRole('radio', { name: 'Keep my title' })).toBeChecked()
      expect(within(conflict).getByRole('radio', { name: 'Take their description' })).toBeChecked()
      expect(within(conflict).getByRole('radio', { name: 'Take their priority' })).toBeChecked()
    })

    it('saves the choices of the user against the new version of the bead', async () => {
      answers = [stale]
      const { onSaved } = open()
      await replace('Title', 'Basket total')
      await save()
      const conflict = await screen.findByRole('region', { name: 'Conflict' })
      await userEvent.click(within(conflict).getByRole('radio', { name: 'Keep my priority' }))
      await userEvent.click(within(conflict).getByRole('button', { name: 'Save with these choices' }))
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(sent[1]!.body).toEqual({
        version: '2026-10-15T10:05:00Z|42',
        changes: { title: 'Basket total', priority: 2 },
      })
    })

    it('saves again with no question when the change of the other actor touches no field of the page', async () => {
      answers = [{ status: 409, body: { error: 'changed', code: 'STALE', bead: { ...bead, revision: '43' } } }]
      const { onSaved } = open()
      await replace('Title', 'Basket total')
      await save()
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(sent.map((request) => request.body.version)).toEqual(['2026-10-15T10:00:00Z|41', '2026-10-15T10:00:00Z|43'])
      expect(screen.queryByRole('region', { name: 'Conflict' })).not.toBeInTheDocument()
    })

    it('asks the user to save again, with no empty comparison, when the bead changes again during the second save', async () => {
      answers = [
        { status: 409, body: { error: 'changed', code: 'STALE', bead: { ...bead, revision: '43' } } },
        { status: 409, body: { error: 'changed', code: 'STALE', bead: { ...bead, revision: '44' } } },
      ]
      const { onSaved } = open()
      await replace('Title', 'Basket total')
      await save()
      expect(await screen.findByText(/changed this bead again/)).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Conflict' })).not.toBeInTheDocument()
      await save()
      await waitFor(() => expect(onSaved).toHaveBeenCalled())
      expect(sent.map((request) => request.body.version)).toEqual([
        '2026-10-15T10:00:00Z|41',
        '2026-10-15T10:00:00Z|43',
        '2026-10-15T10:00:00Z|44',
      ])
    })
  })
})
