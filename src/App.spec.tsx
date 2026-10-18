import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App, POLL_MS } from './App'

const beads = [
  { id: 'e-1', title: 'Checkout', status: 'open', issue_type: 'epic', priority: 1 },
  { id: 't-1', title: 'Cart total', status: 'open', parent: 'e-1', priority: 2, labels: ['front'] },
  { id: 't-2', title: 'Pay button', status: 'open', parent: 'e-1', priority: 1 },
  { id: 't-3', title: 'Receipt mail', status: 'closed', parent: 'e-1' },
  { id: 't-4', title: 'Fix the logo', status: 'open' },
]

type Answer = { status: number; body: unknown }

let answers: Record<string, Answer | Promise<Answer>>
let calls: string[]
let writes: { path: string; token: string | undefined }[]

const json = (body: unknown, status = 200): Answer => ({ status, body })

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  calls = []
  writes = []
  answers = {
    '/api/databases': json({
      databases: [
        { name: '.claude', path: '/home/me/.claude' },
        { name: 'win', path: '/mnt/c/x', refused: 'Use a WSL path: the /mnt/c clone has a store that diverged.' },
      ],
    }),
    '/api/beads?db=.claude': json({ beads, readyIds: ['t-1', 't-4'] }),
    '/api/beads/t-1?db=.claude': json({
      ...beads[1],
      description: 'Show the total of the cart.',
      notes: '2026-10-14 started',
      dependencies: [
        { id: 'e-1', dependency_type: 'parent-child' },
        { id: 't-2', dependency_type: 'blocks' },
      ],
    }),
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      calls.push(input)
      const post = init?.method === 'POST'
      if (post) writes.push({ path: input, token: (init?.headers as Record<string, string>)['x-beads-token'] })
      const key = post ? `POST ${input}` : input
      const answer = await (answers[key] ?? json({ error: 'Not found' }, 404))
      return new Response(JSON.stringify(answer.body), { status: answer.status })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const column = (name: string) => screen.getByRole('region', { name })

const withPageToken = () => {
  beforeEach(() => {
    const meta = document.createElement('meta')
    meta.name = 'beads-token'
    meta.content = 'page-token'
    document.head.append(meta)
  })

  afterEach(() => {
    document.head.querySelector('meta[name="beads-token"]')?.remove()
  })
}

describe('the beadoo page', () => {
  it('shows the ready beads of the epic when the page opens', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    expect(within(column('Open')).getByText('Cart total')).toBeInTheDocument()
    expect(within(column('Open')).queryByText('Pay button')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Closed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'In progress' })).not.toBeInTheDocument()
    expect(window.location.search).toContain('db=.claude')
    expect(window.location.search).toContain('status=ready')
  })

  it('lists the epics with the count of their children for each status', async () => {
    window.history.replaceState(null, '', '/?db=.claude&status=all')
    render(<App />)
    const epics = await screen.findByRole('navigation', { name: 'Epics' })
    expect(within(epics).getByRole('button', { name: /Checkout.*2 Open · 1 Closed/ })).toBeInTheDocument()
    expect(within(epics).getByRole('button', { name: /No epic.*1 Open/ })).toBeInTheDocument()
  })

  describe('the epic board and the filters', () => {
    beforeEach(() => {
      answers['/api/beads?db=.claude'] = json({
        beads: [
          { id: 'e-0', title: 'Old search', status: 'open', issue_type: 'epic', priority: 0 },
          { id: 't-0', title: 'Search index', status: 'closed', parent: 'e-0' },
          ...beads,
        ],
        readyIds: ['t-1', 't-4'],
      })
    })

    it('lists only the epics with a child that matches the filters, and counts only the matching children', async () => {
      render(<App />)
      const epics = await screen.findByRole('navigation', { name: 'Epics' })
      expect(within(epics).queryByRole('button', { name: /Old search/ })).not.toBeInTheDocument()
      expect(within(epics).getByRole('button', { name: /Checkout/ })).toHaveTextContent(/1 Open$/)
      expect(within(epics).getByRole('button', { current: true })).toHaveTextContent('Checkout')
      expect(within(column('Open')).getByText('Cart total')).toBeInTheDocument()
    })

    it('lists only the epics with a child whose title holds the text that the user typed', async () => {
      window.history.replaceState(null, '', '/?db=.claude&status=all&q=logo')
      render(<App />)
      const epics = await screen.findByRole('navigation', { name: 'Epics' })
      expect(within(epics).getAllByRole('button').map((button) => button.textContent)).toEqual(['No epic1 Open'])
      expect(within(column('Open')).getByText('Fix the logo')).toBeInTheDocument()
    })

    it('selects the first listed epic when the filters remove the selected epic', async () => {
      window.history.replaceState(null, '', '/?db=.claude&status=closed&epic=e-0')
      render(<App />)
      expect(await screen.findByText('Search index')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
      const epics = screen.getByRole('navigation', { name: 'Epics' })
      expect(within(epics).getByRole('button', { current: true })).toHaveTextContent('Checkout')
      expect(within(column('Open')).getByText('Cart total')).toBeInTheDocument()
    })

    it('tells the user when no bead matches the filters, and shows no empty column', async () => {
      window.history.replaceState(null, '', '/?db=.claude&q=nothing-like-this')
      render(<App />)
      expect(await screen.findByText('No bead matches the filters.')).toBeInTheDocument()
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
    })
  })

  it('shows all the children of the epic when the user selects the all filter', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(within(column('Closed')).getByText('Receipt mail')).toBeInTheDocument()
    expect(window.location.search).toContain('status=all')
  })

  it('shows the beads that have no epic when the user selects "No epic"', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: /No epic/ }))
    expect(within(column('Open')).getByText('Fix the logo')).toBeInTheDocument()
    expect(window.location.search).toContain('epic=none')
  })

  it('shows the children of a parent that is not an epic on the board of that parent', async () => {
    answers['/api/beads?db=.claude'] = json({
      beads: [
        ...beads,
        { id: 'c-1', title: 'Tidy the repo', status: 'closed', issue_type: 'chore' },
        { id: 'c-1.1', title: 'Remove the old script', status: 'closed', parent: 'c-1' },
      ],
      readyIds: ['t-1', 't-4'],
    })
    window.history.replaceState(null, '', '/?db=.claude&status=all')
    render(<App />)
    const epics = await screen.findByRole('navigation', { name: 'Epics' })
    await userEvent.click(within(epics).getByRole('button', { name: /Tidy the repo/ }))
    expect(within(column('Closed')).getByText('Remove the old script')).toBeInTheDocument()
  })

  it('shows the ready child of a closed epic with the default filter', async () => {
    answers['/api/beads?db=.claude'] = json({
      beads: [
        { id: 'e-2', title: 'Old search', status: 'closed', issue_type: 'epic' },
        { id: 't-6', title: 'Search index', status: 'open', parent: 'e-2' },
      ],
      readyIds: ['t-6'],
    })
    render(<App />)
    expect(within(await screen.findByRole('region', { name: 'Open' })).getByText('Search index')).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Epics' })).getByRole('button', { name: /Old search/ })).toBeInTheDocument()
  })

  it('finds the beads whose title holds the text that the user types', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Find in the titles' }), 'receipt')
    expect(screen.queryByText('Cart total')).not.toBeInTheDocument()
    expect(screen.getByText('Receipt mail')).toBeInTheDocument()
  })

  it('opens the full detail of a bead when the user clicks its card', async () => {
    render(<App />)
    await userEvent.click(await screen.findByRole('button', { name: 't-1 Cart total' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('Show the total of the cart.')).toBeInTheDocument()
    expect(within(dialog).getByText('2026-10-14 started')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(window.location.search).toContain('bead=t-1')
  })

  it('opens the bead that the link names', async () => {
    window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
    render(<App />)
    expect(await screen.findByText('Show the total of the cart.')).toBeInTheDocument()
  })

  it('reports a store that did not open instead of an empty board', async () => {
    answers['/api/beads?db=.claude'] = json(
      { error: 'bd list gave no bead: the store did not open', code: 'STORE_NOT_OPEN' },
      503,
    )
    render(<App />)
    expect(await screen.findByText('bd list gave no bead: the store did not open')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Open' })).not.toBeInTheDocument()
  })

  it('tells the user to use a WSL path when the link names a database on the Windows mount', async () => {
    window.history.replaceState(null, '', '/?db=win')
    render(<App />)
    expect(await screen.findByText(/Use a WSL path/)).toBeInTheDocument()
    expect(calls).not.toContain('/api/beads?db=win')
  })

  it('keeps the last beads and shows an alert when a refresh fails', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    answers['/api/beads?db=.claude'] = json({ error: 'bd timed out' }, 500)
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('bd timed out')).toBeInTheDocument()
    expect(screen.getByText('Cart total')).toBeInTheDocument()
  })

  it('reads the beads again each minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<App />)
    await screen.findByText('Cart total')
    const before = calls.filter((call) => call.startsWith('/api/beads?')).length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS)
    })
    await waitFor(() => expect(calls.filter((call) => call.startsWith('/api/beads?')).length).toBe(before + 1))
  })

  it('shows the filters of the link and not the last filters of the user when the user opens a link', async () => {
    window.localStorage.setItem('beadoo:filters', JSON.stringify({ status: 'all', text: 'zzzqqq', labels: ['front'], type: 'bug', priority: 2 }))
    window.history.replaceState(null, '', '/?view=lanes&db=.claude&status=ready')
    render(<App />)
    expect(await screen.findByText('Cart total')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Find in the titles' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Remove the label filter front' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Type filter' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Priority filter' })).toHaveValue('')
    expect(window.location.search).not.toContain('zzzqqq')
  })

  it('keeps the last filter of the user for the next visit', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: 'Closed' }))
    expect(JSON.parse(window.localStorage.getItem('beadoo:filters') ?? '{}')).toMatchObject({ status: ['closed'] })
  })

  it('shows the open and the in progress beads together when the user selects both', async () => {
    answers['/api/beads?db=.claude'] = json({
      beads: [...beads, { id: 't-5', title: 'Ship it', status: 'in_progress', parent: 'e-1' }],
      readyIds: ['t-1', 't-4'],
    })
    window.history.replaceState(null, '', '/?db=.claude&view=lanes')
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await userEvent.click(screen.getByRole('button', { name: 'In progress' }))
    expect(screen.getByText('Pay button')).toBeInTheDocument()
    expect(screen.getByText('Ship it')).toBeInTheDocument()
    expect(screen.queryByText('Receipt mail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'In progress' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'false')
    expect(new URLSearchParams(window.location.search).getAll('status')).toEqual(['open', 'in_progress'])
    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByText('Ship it')).not.toBeInTheDocument()
  })

  it('shows in the lanes only the columns of the statuses that the user selected', async () => {
    window.history.replaceState(null, '', '/?db=.claude&view=lanes&status=open&status=closed')
    render(<App />)
    const checkout = await screen.findByRole('region', { name: 'Checkout' })
    expect(within(checkout).getAllByRole('group').map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'Checkout: Open',
      'Checkout: Closed',
    ])
  })

  it('opens an old link that holds one status', async () => {
    window.history.replaceState(null, '', '/?db=.claude&view=lanes&status=closed')
    render(<App />)
    expect(await screen.findByText('Receipt mail')).toBeInTheDocument()
    expect(screen.queryByText('Cart total')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true')
  })

  describe('the views of the beads', () => {
    const cardNames = (scope: HTMLElement) =>
      within(scope)
        .queryAllByRole('button', { name: /^t-\d+ / })
        .map((button) => button.getAttribute('aria-label'))
        .sort()

    const shownIn = async (view: string) => {
      await userEvent.click(screen.getByRole('button', { name: view }))
      return cardNames(screen.getByRole('main'))
    }

    const shownInEpicBoards = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Epic board' }))
      const epics = screen.getByRole('navigation', { name: 'Epics' })
      const names: (string | null)[] = []
      for (const epic of within(epics).getAllByRole('button')) {
        await userEvent.click(epic)
        names.push(...cardNames(screen.getByRole('main')))
      }
      return names.sort()
    }

    it('shows the same ready beads in the lanes, the table and the epic boards', async () => {
      render(<App />)
      await screen.findByText('Cart total')
      const expected = ['t-1 Cart total', 't-4 Fix the logo']
      expect(await shownIn('Lanes')).toEqual(expected)
      expect(await shownIn('Table')).toEqual(expected)
      expect(await shownInEpicBoards()).toEqual(expected)
    })

    it('shows the same beads in the three views when the user changes the filters', async () => {
      render(<App />)
      await screen.findByText('Cart total')
      await userEvent.click(screen.getByRole('button', { name: 'All' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Find in the titles' }), 'r')
      const expected = ['t-1 Cart total', 't-3 Receipt mail']
      expect(await shownIn('Lanes')).toEqual(expected)
      expect(await shownIn('Table')).toEqual(expected)
      expect(await shownInEpicBoards()).toEqual(expected)
    })

    describe('the label, type and priority filters', () => {
      beforeEach(() => {
        answers['/api/beads?db=.claude'] = json({
          beads: [
            beads[0],
            { ...beads[1], labels: ['front', 'urgent'] },
            { ...beads[2], labels: ['front'] },
            { ...beads[3], issue_type: 'bug', priority: 1, labels: ['front', 'urgent'] },
            { ...beads[4], issue_type: 'bug', priority: 2, labels: ['urgent', 'front'] },
          ],
          readyIds: ['t-1', 't-4'],
        })
      })

      const select = (name: string) => screen.getByRole('combobox', { name })

      it('shows the same beads in the three views when the user selects labels and a type', async () => {
        window.history.replaceState(null, '', '/?db=.claude&status=all')
        render(<App />)
        await screen.findByText('Cart total')
        await userEvent.selectOptions(select('Label filter'), 'front')
        await userEvent.selectOptions(select('Label filter'), 'urgent')
        const allLabels = ['t-1 Cart total', 't-3 Receipt mail', 't-4 Fix the logo']
        expect(await shownIn('Lanes')).toEqual(allLabels)
        expect(await shownIn('Table')).toEqual(allLabels)
        expect(await shownInEpicBoards()).toEqual(allLabels)
        await userEvent.selectOptions(select('Type filter'), 'bug')
        const bugs = ['t-3 Receipt mail', 't-4 Fix the logo']
        expect(await shownIn('Lanes')).toEqual(bugs)
        expect(await shownIn('Table')).toEqual(bugs)
        expect(await shownInEpicBoards()).toEqual(bugs)
      })

      it('shows a bead again when the user removes a label filter that the bead does not hold', async () => {
        window.history.replaceState(null, '', '/?db=.claude&status=all&view=lanes&label=front&label=urgent')
        render(<App />)
        await screen.findByText('Cart total')
        expect(screen.queryByText('Pay button')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Remove the label filter urgent' }))
        expect(screen.getByText('Pay button')).toBeInTheDocument()
        expect(window.location.search).not.toContain('label=urgent')
      })

      it('offers the labels, the types and the priorities that the loaded beads hold', async () => {
        render(<App />)
        await screen.findByText('Cart total')
        const values = (name: string) =>
          within(select(name))
            .getAllByRole('option')
            .map((option) => option.textContent)
        expect(values('Label filter')).toEqual(['Add a label', 'front', 'urgent'])
        expect(values('Type filter')).toEqual(['All types', 'bug', 'epic', 'task'])
        expect(values('Priority filter')).toEqual(['All priorities', 'P1', 'P2'])
      })

      it('keeps the label, type and priority filters in the link and for the next visit', async () => {
        render(<App />)
        await screen.findByText('Cart total')
        await userEvent.selectOptions(select('Label filter'), 'front')
        await userEvent.selectOptions(select('Type filter'), 'bug')
        await userEvent.selectOptions(select('Priority filter'), 'P2')
        const params = new URLSearchParams(window.location.search)
        expect(params.getAll('label')).toEqual(['front'])
        expect(params.get('type')).toBe('bug')
        expect(params.get('priority')).toBe('2')
        expect(JSON.parse(window.localStorage.getItem('beadoo:filters') ?? '{}')).toMatchObject({
          labels: ['front'],
          type: 'bug',
          priority: 2,
        })
      })

      it('opens the page with the label, type and priority filters that the link names', async () => {
        window.history.replaceState(null, '', '/?db=.claude&status=all&view=table&label=urgent&type=bug&priority=2')
        render(<App />)
        const table = await screen.findByRole('table', { name: 'Beads by epic' })
        expect(cardNames(table)).toEqual(['t-4 Fix the logo'])
        expect(select('Type filter')).toHaveValue('bug')
        expect(select('Priority filter')).toHaveValue('2')
        expect(screen.getByRole('button', { name: 'Remove the label filter urgent' })).toBeInTheDocument()
      })
    })

    it('shows one lane for each epic and one column for each status in the lanes view', async () => {
      window.history.replaceState(null, '', '/?db=.claude&status=all&view=lanes')
      render(<App />)
      const checkout = await screen.findByRole('region', { name: 'Checkout' })
      expect(within(checkout).getByText('3 beads')).toBeInTheDocument()
      expect(within(within(checkout).getByRole('group', { name: 'Checkout: Open' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['t-2 Pay button', 't-1 Cart total'])
      expect(within(checkout).getByRole('group', { name: 'Checkout: Closed' })).toHaveTextContent('Receipt mail')
      expect(within(screen.getByRole('region', { name: 'No epic' })).getByRole('group', { name: 'No epic: Open' })).toHaveTextContent('Fix the logo')
      expect(screen.queryByRole('navigation', { name: 'Epics' })).not.toBeInTheDocument()
    })

    it('shows a table grouped by epic, with a status bar that counts the children of each epic', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=table')
      render(<App />)
      const checkout = await screen.findByRole('rowgroup', { name: 'Checkout' })
      expect(within(checkout).getByRole('img', { name: 'Checkout: 2 Open · 1 Closed' })).toBeInTheDocument()
      expect(within(checkout).getByRole('button', { name: 't-1 Cart total' })).toBeInTheDocument()
      expect(within(checkout).queryByText('Pay button')).not.toBeInTheDocument()
      const noEpic = screen.getByRole('rowgroup', { name: 'No epic' })
      expect(within(noEpic).getByRole('img', { name: 'No epic: 1 Open' })).toBeInTheDocument()
      expect(within(noEpic).getByRole('button', { name: 't-4 Fix the logo' })).toBeInTheDocument()
    })

    it('shows the title row of each epic across all the columns of the table', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=table')
      render(<App />)
      const table = await screen.findByRole('table', { name: 'Beads by epic' })
      const columns = within(table).getAllByRole('columnheader').length
      for (const group of within(table).getAllByRole('rowgroup', { name: /./ })) {
        expect(within(group).getByRole('rowheader')).toHaveAttribute('colspan', String(columns))
      }
    })

    it('leaves out of the lanes and of the table an epic with no bead that matches the filters', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=table&q=logo')
      render(<App />)
      expect(await screen.findByRole('rowgroup', { name: 'No epic' })).toBeInTheDocument()
      expect(screen.queryByRole('rowgroup', { name: 'Checkout' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Lanes' }))
      expect(screen.getByRole('region', { name: 'No epic' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Checkout' })).not.toBeInTheDocument()
    })

    it('opens the epic board on the first epic of the lanes view', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=lanes&q=logo')
      render(<App />)
      const [firstLane] = await screen.findAllByRole('region', { name: /./ })
      expect(firstLane).toHaveAccessibleName('No epic')
      await userEvent.click(screen.getByRole('button', { name: 'Epic board' }))
      const epics = screen.getByRole('navigation', { name: 'Epics' })
      expect(within(epics).getByRole('button', { current: true })).toHaveTextContent('No epic')
      expect(cardNames(screen.getByRole('main'))).toEqual(['t-4 Fix the logo'])
    })

    it('tells the user when no bead matches the filters', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=lanes&q=nothing-like-this')
      render(<App />)
      expect(await screen.findByText('No bead matches the filters.')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Table' }))
      expect(screen.getByText('No bead matches the filters.')).toBeInTheDocument()
    })

    it('opens the detail of a bead from a lane card and from a table row', async () => {
      window.history.replaceState(null, '', '/?db=.claude&view=lanes')
      render(<App />)
      await userEvent.click(await screen.findByRole('button', { name: 't-1 Cart total' }))
      expect(await within(await screen.findByRole('dialog')).findByText('Show the total of the cart.')).toBeInTheDocument()
      await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await userEvent.click(screen.getByRole('button', { name: 'Table' }))
      await userEvent.click(within(screen.getByRole('table', { name: 'Beads by epic' })).getByRole('button', { name: 't-1 Cart total' }))
      expect(await within(await screen.findByRole('dialog')).findByText('Show the total of the cart.')).toBeInTheDocument()
      expect(window.location.search).toContain('bead=t-1')
    })

    it('keeps the view in the link and for the next visit', async () => {
      render(<App />)
      await screen.findByText('Cart total')
      expect(window.location.search).toContain('view=epic')
      await userEvent.click(screen.getByRole('button', { name: 'Table' }))
      expect(window.location.search).toContain('view=table')
      expect(JSON.parse(window.localStorage.getItem('beadoo:filters') ?? '{}')).toMatchObject({ view: 'table' })
    })

    it('opens the view of the last visit when the link names no view', async () => {
      window.localStorage.setItem('beadoo:filters', JSON.stringify({ view: 'lanes' }))
      render(<App />)
      expect(await screen.findByRole('region', { name: 'Checkout' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lanes' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('opens the view that the user stored before the rename to beadoo', async () => {
      window.localStorage.setItem('beads-page:filters', JSON.stringify({ view: 'lanes' }))
      render(<App />)
      expect(await screen.findByRole('region', { name: 'Checkout' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Lanes' })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('the claim lease', () => {
    const now = new Date(2026, 9, 14, 23, 50)
    const claimed = {
      id: 't-5',
      title: 'Ship the order',
      status: 'in_progress',
      parent: 'e-1',
      assignee: 'me',
      heartbeat_at: new Date(2026, 9, 14, 23, 26).toISOString(),
      lease_expires_at: new Date(2026, 9, 14, 23, 31).toISOString(),
    }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(now)
      answers['/api/beads?db=.claude'] = json({ beads: [...beads, claimed], readyIds: ['t-1', 't-4'] })
      answers['/api/beads/t-5?db=.claude'] = json(claimed)
    })

    it('shows on the card that the claim lease of a bead expired', async () => {
      window.history.replaceState(null, '', '/?db=.claude&status=all')
      render(<App />)
      const card = await screen.findByRole('button', { name: 't-5 Ship the order' })
      expect(within(card).getByText('lease expired at 23:31')).toBeInTheDocument()
      expect(within(column('In progress')).getByText('Ship the order')).toBeInTheDocument()
    })

    it('shows the lease and the last heartbeat in the detail of a claimed bead', async () => {
      window.history.replaceState(null, '', '/?db=.claude&status=all&bead=t-5')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      expect(await within(dialog).findByText('lease expired at 23:31')).toBeInTheDocument()
      expect(within(dialog).getByText('23:26')).toBeInTheDocument()
    })
  })

  describe('the start of a session on a bead', () => {
    const session = {
      bead: { ...beads[1], status: 'in_progress', assignee: 'Ann', notes: 'started 2026-10-16 09:05 in /home/me/wt/t-1' },
      worktree: 'repo::/home/me/wt/t-1',
      path: '/home/me/wt/t-1',
      branch: 'feat/1-cart-total',
      terminal: 'term_7',
    }

    beforeEach(() => {
      answers['/api/actor?db=.claude'] = json({ actor: 'Ann' })
    })

    withPageToken()

    const openDetail = async (search = '/?db=.claude&bead=t-1') => {
      window.history.replaceState(null, '', search)
      render(<App />)
      return screen.findByRole('dialog')
    }

    const spawnBody = () => {
      const call = vi.mocked(fetch).mock.calls.find(([path]) => String(path).includes('/spawn?'))
      return call ? JSON.parse(String(call[1]?.body)) : undefined
    }

    it('proposes a branch from the id and the title of the bead', async () => {
      const dialog = await openDetail()
      expect(await within(dialog).findByLabelText('Branch of the session')).toHaveValue('feat/1-cart-total')
    })

    it('claims the bead and starts a session with one click, then shows the worktree, the branch and the terminal', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(session)
      const dialog = await openDetail()
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim and spawn' }))
      expect(await within(dialog).findByText('A session started on the bead')).toBeInTheDocument()
      expect(within(dialog).getByText('/home/me/wt/t-1')).toBeInTheDocument()
      expect(within(dialog).getByText('feat/1-cart-total')).toBeInTheDocument()
      expect(within(dialog).getByText('term_7')).toBeInTheDocument()
      expect(within(dialog).getByText('In progress')).toBeInTheDocument()
      expect(writes).toEqual([{ path: '/api/beads/t-1/spawn?db=.claude', token: 'page-token' }])
      expect(spawnBody()).toEqual({ branch: 'feat/1-cart-total' })
    })

    it('starts the session on the branch that the user typed', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, branch: 'fix/cart-total' })
      const dialog = await openDetail()
      const branch = await within(dialog).findByLabelText('Branch of the session')
      await userEvent.clear(branch)
      await userEvent.type(branch, 'fix/cart-total')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Claim and spawn' }))
      await within(dialog).findByText('A session started on the bead')
      expect(spawnBody()).toEqual({ branch: 'fix/cart-total' })
    })

    it('does not start a session on a branch that is not a type and a slug, and tells the user why', async () => {
      const dialog = await openDetail()
      const branch = await within(dialog).findByLabelText('Branch of the session')
      await userEvent.clear(branch)
      await userEvent.type(branch, 'Cart')
      expect(within(dialog).getByRole('button', { name: 'Claim and spawn' })).toBeDisabled()
      expect(within(dialog).getByText(/Give the branch as <type>\/<slug>/)).toBeInTheDocument()
    })

    it('tells the user why the session did not start', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(
        { error: 'orca terminal create failed: Timed out\nThe bead t-1 is open again.', code: 'SPAWN_FAILED' },
        502,
      )
      const dialog = await openDetail()
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim and spawn' }))
      expect(await within(dialog).findByText('The page could not start a session')).toBeInTheDocument()
      expect(within(dialog).getByText(/The bead t-1 is open again/)).toBeInTheDocument()
    })

    it('shows the bead as the database holds it after a start that failed', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(
        { error: 'orca terminal create failed: Timed out\nThe page could not give the bead t-1 back: database is locked.', code: 'SPAWN_FAILED' },
        502,
      )
      const dialog = await openDetail()
      const spawn = await within(dialog).findByRole('button', { name: 'Claim and spawn' })
      answers['/api/beads/t-1?db=.claude'] = json({ ...beads[1], status: 'in_progress', assignee: 'Ann' })
      await userEvent.click(spawn)
      expect(await within(dialog).findByText('The page could not start a session')).toBeInTheDocument()
      expect(await within(dialog).findByText('In progress')).toBeInTheDocument()
    })

    it('shows the warning when the session runs but the page could not note its start', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, warning: 'The session runs, but the page could not write the note of the start' })
      const dialog = await openDetail()
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim and spawn' }))
      expect(await within(dialog).findByText(/could not write the note of the start/)).toBeInTheDocument()
    })

    it('does not offer to start a session on a bead that another actor holds', async () => {
      answers['/api/beads/t-1?db=.claude'] = json({ ...beads[1], status: 'in_progress', assignee: 'Bob' })
      const dialog = await openDetail()
      await within(dialog).findByText('Bob')
      expect(within(dialog).queryByRole('button', { name: 'Claim and spawn' })).not.toBeInTheDocument()
    })
  })

  describe('the claim of a bead', () => {
    const mine = {
      ...beads[1],
      status: 'in_progress',
      assignee: 'Ann',
      heartbeat_at: new Date(2026, 9, 15, 10, 0).toISOString(),
      lease_expires_at: new Date(2026, 9, 15, 10, 5).toISOString(),
    }

    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      vi.setSystemTime(new Date(2026, 9, 15, 10, 2))
      answers['/api/actor?db=.claude'] = json({ actor: 'Ann' })
    })

    withPageToken()

    const openDetail = async (search: string) => {
      window.history.replaceState(null, '', search)
      render(<App />)
      return screen.findByRole('dialog')
    }

    it('claims a bead from its detail, shows the claim and reads the beads again', async () => {
      answers['POST /api/beads/t-1/claim?db=.claude'] = json(mine)
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      const reads = () => calls.filter((call) => call.startsWith('/api/beads?')).length
      await waitFor(() => expect(reads()).toBe(1))
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim' }))
      expect(await within(dialog).findByText('In progress')).toBeInTheDocument()
      expect(within(dialog).getByText('Ann')).toBeInTheDocument()
      expect(within(dialog).getByText('lease until 10:05')).toBeInTheDocument()
      expect(writes).toEqual([{ path: '/api/beads/t-1/claim?db=.claude', token: 'page-token' }])
      await waitFor(() => expect(reads()).toBe(2))
    })

    it('offers to renew and to release a claim of the current actor, and not to claim it again', async () => {
      answers['/api/beads/t-1?db=.claude'] = json(mine)
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      expect(await within(dialog).findByRole('button', { name: 'Renew' })).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Unclaim' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    })

    it('renews the lease of a claim of the current actor and shows the new end of the lease', async () => {
      answers['/api/beads/t-1?db=.claude'] = json(mine)
      answers['POST /api/beads/t-1/renew?db=.claude'] = json({
        ...mine,
        lease_expires_at: new Date(2026, 9, 15, 10, 7).toISOString(),
      })
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Renew' }))
      expect(await within(dialog).findByText('lease until 10:07')).toBeInTheDocument()
      expect(writes.map((write) => write.path)).toEqual(['/api/beads/t-1/renew?db=.claude'])
    })

    it('releases a claim of the current actor', async () => {
      answers['/api/beads/t-1?db=.claude'] = json(mine)
      answers['POST /api/beads/t-1/unclaim?db=.claude'] = json({ ...beads[1], status: 'open' })
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Unclaim' }))
      expect(await within(dialog).findByRole('button', { name: 'Claim' })).toBeInTheDocument()
      expect(within(dialog).getByText('nobody')).toBeInTheDocument()
    })

    it('does not offer to renew or to release a claim of another actor', async () => {
      answers['/api/beads/t-1?db=.claude'] = json({ ...mine, assignee: 'Bob' })
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      await within(dialog).findByText('Bob')
      expect(within(dialog).queryByRole('button', { name: 'Renew' })).not.toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Unclaim' })).not.toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    })

    it('does not offer to claim a closed bead', async () => {
      answers['/api/beads/t-3?db=.claude'] = json(beads[3])
      const dialog = await openDetail('/?db=.claude&status=all&bead=t-3')
      await within(dialog).findByText('Closed')
      expect(within(dialog).queryByRole('button', { name: 'Claim' })).not.toBeInTheDocument()
    })

    it('tells the user why the claim failed and shows the bead as the database has it', async () => {
      answers['POST /api/beads/t-1/claim?db=.claude'] = json(
        { error: 'issue already claimed by Bob', code: 'CONFLICT' },
        409,
      )
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      const claim = await within(dialog).findByRole('button', { name: 'Claim' })
      answers['/api/beads/t-1?db=.claude'] = json({ ...mine, assignee: 'Bob' })
      await userEvent.click(claim)
      expect(await within(dialog).findByText('issue already claimed by Bob')).toBeInTheDocument()
      expect(await within(dialog).findByText('Bob')).toBeInTheDocument()
    })

    it('does not show the error of a failed claim again when the user opens the bead a second time', async () => {
      answers['POST /api/beads/t-1/claim?db=.claude'] = json(
        { error: 'issue already claimed by Bob', code: 'CONFLICT' },
        409,
      )
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim' }))
      expect(await within(dialog).findByText('issue already claimed by Bob')).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await userEvent.click(await screen.findByRole('button', { name: 't-1 Cart total' }))
      const again = await screen.findByRole('dialog')
      expect(await within(again).findByRole('button', { name: 'Claim' })).toBeInTheDocument()
      expect(within(again).queryByText('issue already claimed by Bob')).not.toBeInTheDocument()
      expect(within(again).queryByText('The page could not change the claim')).not.toBeInTheDocument()
    })

    it('tells the user when the export file and the database do not hold the same count of beads', async () => {
      answers['POST /api/beads/t-1/claim?db=.claude'] = json(
        { error: 'The write is done, but /home/me/.claude/.beads/issues.jsonl holds 2 lines and bd list gives 3 beads.', code: 'EXPORT_MISMATCH' },
        500,
      )
      const dialog = await openDetail('/?db=.claude&bead=t-1')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim' }))
      expect(await within(dialog).findByText(/holds 2 lines and bd list gives 3 beads/)).toBeInTheDocument()
    })
  })

  describe('the edit of a bead from its detail', () => {
    it('saves the edit, shows the new values and reads the beads again', async () => {
      answers['POST /api/beads/t-1/edit?db=.claude'] = json({ ...beads[1], title: 'Basket total', status: 'closed', close_reason: 'Shipped' })
      window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      const reads = () => calls.filter((call) => call.startsWith('/api/beads?')).length
      await waitFor(() => expect(reads()).toBe(1))
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Edit' }))
      const title = within(dialog).getByLabelText('Title')
      await userEvent.clear(title)
      await userEvent.type(title, 'Basket total')
      await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'closed')
      await userEvent.type(within(dialog).getByLabelText('Close reason'), 'Shipped')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      expect(await within(dialog).findByRole('heading', { name: 'Basket total' })).toBeInTheDocument()
      expect(within(dialog).getByText('Shipped')).toBeInTheDocument()
      expect(within(dialog).queryByRole('form', { name: 'Edit the bead' })).not.toBeInTheDocument()
      expect(writes.map((write) => write.path)).toEqual(['/api/beads/t-1/edit?db=.claude'])
      await waitFor(() => expect(reads()).toBe(2))
    })

    it('shows the detail again and writes nothing when the user cancels the edit', async () => {
      window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Edit' }))
      await userEvent.type(within(dialog).getByLabelText('Title'), ' changed')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(within(dialog).queryByRole('form', { name: 'Edit the bead' })).not.toBeInTheDocument()
      expect(within(dialog).getByRole('heading', { name: 'Cart total' })).toBeInTheDocument()
      expect(writes).toEqual([])
    })
  })

  describe('a database on a Dolt server that does not answer', () => {
    const down = json(
      {
        error: 'The database "remote" does not answer: Dolt server unreachable at 127.0.0.1:3307. Start its tunnel or its Dolt server.',
        code: 'UNREACHABLE',
      },
      503,
    )

    beforeEach(() => {
      answers['/api/databases'] = json({
        databases: [
          { name: 'remote', path: '/home/me/remote', hasTunnel: true },
          { name: 'local-server', path: '/home/me/local-server' },
        ],
      })
      answers['/api/beads?db=remote'] = down
      answers['/api/beads?db=local-server'] = down
    })

    withPageToken()

    it('shows that the database does not answer, and opens it after the user starts its tunnel', async () => {
      window.history.replaceState(null, '', '/?db=remote&status=all')
      render(<App />)
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByText('The database "remote" does not answer')).toBeInTheDocument()
      expect(within(alert).getByText(/Dolt server unreachable at 127.0.0.1:3307/)).toBeInTheDocument()
      expect(alert.textContent?.match(/does not answer/g)).toHaveLength(1)
      answers['POST /api/tunnel/start?db=remote'] = json({ started: 'remote' })
      answers['/api/beads?db=remote'] = json({ beads, readyIds: [] })
      await userEvent.click(within(alert).getByRole('button', { name: 'Start the tunnel' }))
      expect(await screen.findByText('Cart total')).toBeInTheDocument()
      expect(writes).toEqual([{ path: '/api/tunnel/start?db=remote', token: 'page-token' }])
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows no read time of the previous database when the user selects a database that does not answer', async () => {
      answers['/api/databases'] = json({
        databases: [
          { name: '.claude', path: '/home/me/.claude' },
          { name: 'remote', path: '/home/me/remote', hasTunnel: true },
        ],
      })
      answers['/api/beads?db=.claude'] = json({ beads, readyIds: ['t-1', 't-4'] })
      window.history.replaceState(null, '', '/?db=.claude')
      render(<App />)
      await screen.findByText('Cart total')
      expect(screen.queryByText('Not read')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('combobox', { name: 'Database' }))
      await userEvent.click(await screen.findByRole('option', { name: 'remote' }))
      await screen.findByRole('alert')
      expect(screen.getByText('Not read')).toBeInTheDocument()
    })

    it('tells the user why the tunnel did not start', async () => {
      window.history.replaceState(null, '', '/?db=remote')
      render(<App />)
      const alert = await screen.findByRole('alert')
      answers['POST /api/tunnel/start?db=remote'] = json(
        { error: 'The tunnel of "remote" did not start: ssh -fN db-host failed (Could not resolve hostname db-host).', code: 'ERROR' },
        500,
      )
      await userEvent.click(within(alert).getByRole('button', { name: 'Start the tunnel' }))
      expect(await within(alert).findByRole('status')).toHaveTextContent('Could not resolve hostname db-host')
      expect(within(alert).getByRole('button', { name: 'Start the tunnel' })).toBeEnabled()
    })

    it('tells the user to start the Dolt server when the config gives no tunnel for the database', async () => {
      window.history.replaceState(null, '', '/?db=local-server')
      render(<App />)
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByText(/gives no tunnel for this database/)).toBeInTheDocument()
      expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
    })
  })

  it('keeps the beads of the selected database when a slow answer for the previous database arrives', async () => {
    let answerClaude = (_answer: Answer) => {}
    answers['/api/databases'] = json({
      databases: [
        { name: '.claude', path: '/home/me/.claude' },
        { name: 'shop', path: '/home/me/shop' },
      ],
    })
    answers['/api/beads?db=.claude'] = new Promise<Answer>((resolve) => {
      answerClaude = resolve
    })
    answers['/api/beads?db=shop'] = json({
      beads: [{ id: 's-1', title: 'Shop task', status: 'open' }],
      readyIds: ['s-1'],
    })
    window.history.replaceState(null, '', '/?db=.claude&epic=none')
    render(<App />)
    await userEvent.click(await screen.findByRole('combobox', { name: 'Database' }))
    await userEvent.click(await screen.findByRole('option', { name: 'shop' }))
    await screen.findByText('Shop task')
    await act(async () => answerClaude(json({ beads, readyIds: ['t-1', 't-4'] })))
    expect(screen.getByText('Shop task')).toBeInTheDocument()
    expect(screen.queryByText('Fix the logo')).not.toBeInTheDocument()
  })
})
