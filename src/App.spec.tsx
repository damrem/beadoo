import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
      spawn: true,
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

  it('shows on each epic lane the count of the closed children over all the children, also under the ready filter', async () => {
    window.history.replaceState(null, '', '/?db=.claude&view=lanes')
    render(<App />)
    const lane = await screen.findByRole('region', { name: 'Checkout' })
    expect(within(lane).getByRole('progressbar', { name: 'Checkout: 1/3 children closed' })).toBeInTheDocument()
  })

  it('marks only the ready beads, and the ready filter shows only them', async () => {
    window.history.replaceState(null, '', '/?db=.claude&status=all')
    render(<App />)
    const cart = await screen.findByRole('button', { name: 't-1 Cart total' })
    expect(within(cart).getByText('ready')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 't-2 Pay button' })).queryByText('ready')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(screen.queryByRole('button', { name: 't-2 Pay button' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: 't-1 Cart total' })).getByText('ready')).toBeInTheDocument()
  })

  it('shows an open bead that waits on an open bead in the blocked column, with the id of its blocker', async () => {
    answers['/api/beads?db=.claude'] = json({
      beads: beads.map((bead) =>
        bead.id === 't-2' ? { ...bead, dependencies: [{ issue_id: 't-2', depends_on_id: 't-1', type: 'blocks' }] } : bead,
      ),
      readyIds: ['t-1', 't-4'],
    })
    window.history.replaceState(null, '', '/?db=.claude&status=all')
    render(<App />)
    const card = await within(await screen.findByRole('region', { name: 'Blocked' })).findByRole('button', { name: 't-2 Pay button' })
    expect(card).toHaveTextContent('waits on 1: 1')
    expect(within(column('Open')).queryByText('Pay button')).not.toBeInTheDocument()
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
    expect(within(dialog).getByRole('link', { name: '1' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '2' })).toBeInTheDocument()
    expect(window.location.search).toContain('bead=t-1')
  })

  it('gives the detail of a bead a link to the page of that bead', async () => {
    window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
    render(<App />)
    const dialog = await screen.findByRole('dialog')
    const link = within(dialog).getByRole('link', { name: 'Open t-1 as a page' })
    expect(link).toHaveAttribute('href', '/bead?db=.claude&id=t-1')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('shows the parent of a bead in the detail when the user clicks the parent link', async () => {
    window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
    render(<App />)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('link', { name: '1' }))
    expect(window.location.pathname).toBe('/')
    expect(window.location.search).toContain('bead=e-1')
  })

  describe('the children of a bead', () => {
    beforeEach(() => {
      answers['/api/beads/e-1?db=.claude'] = json({ ...beads[0], description: 'Pay for the cart.' })
    })

    it('lists a link to each child of a bead in its detail', async () => {
      window.history.replaceState(null, '', '/?db=.claude&bead=e-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      const children = await within(dialog).findByRole('list', { name: 'Children' })
      expect(within(children).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        '2Pay button📋Open',
        '1Cart total📋Open',
        '3Receipt mail✅Closed',
      ])
      expect(within(children).getByRole('link', { name: '1' })).toHaveAttribute('href', '/bead?db=.claude&id=t-1')
    })

    it('opens the child in the detail when the user clicks its link', async () => {
      window.history.replaceState(null, '', '/?db=.claude&bead=e-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      const children = await within(dialog).findByRole('list', { name: 'Children' })
      await userEvent.click(within(children).getByRole('link', { name: '1' }))
      expect(await within(dialog).findByText('Show the total of the cart.')).toBeInTheDocument()
      expect(window.location.search).toContain('bead=t-1')
    })

    it('shows no list of children for a bead that has no child', async () => {
      window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      await within(dialog).findByText('Show the total of the cart.')
      expect(within(dialog).queryByRole('list', { name: 'Children' })).not.toBeInTheDocument()
    })

    it('lists the children on the page of the bead, with links to their pages', async () => {
      window.history.replaceState(null, '', '/bead?db=.claude&id=e-1')
      render(<App />)
      const children = await screen.findByRole('list', { name: 'Children' })
      expect(within(children).getByRole('link', { name: '2' })).toHaveAttribute('href', '/bead?db=.claude&id=t-2')
    })
  })

  describe('the dependency links of a bead', () => {
    beforeEach(() => {
      answers['/api/beads?db=.claude'] = json({
        beads: [
          beads[0],
          { ...beads[1], dependencies: [{ issue_id: 't-1', depends_on_id: 't-2', type: 'blocks' }] },
          { ...beads[2], dependencies: [{ issue_id: 't-2', depends_on_id: 't-3', type: 'relates-to' }] },
          beads[3],
          { ...beads[4], dependencies: [{ issue_id: 't-4', depends_on_id: 't-2', type: 'blocks' }] },
        ],
        readyIds: ['t-1', 't-4'],
      })
      answers['/api/beads/t-2?db=.claude'] = json({
        ...beads[2],
        dependencies: [
          { id: 'e-1', dependency_type: 'parent-child' },
          { id: 't-3', title: 'Receipt mail', status: 'closed', dependency_type: 'relates-to' },
        ],
      })
    })

    it('lists the beads that block a bead and the beads that it blocks, with the type of each link', async () => {
      window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      const dependencies = await within(dialog).findByRole('list', { name: 'Dependencies' })
      await waitFor(() =>
        expect(within(dependencies).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['blocked by2Pay button📋Open']),
      )
      expect(within(dialog).queryByRole('list', { name: 'Dependents' })).not.toBeInTheDocument()

      await userEvent.click(within(dependencies).getByRole('link', { name: '2' }))
      const dependents = await within(dialog).findByRole('list', { name: 'Dependents' })
      expect(within(dependents).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'blocks1Cart total📋Open',
        'blocks4Fix the logo📋Open',
      ])
      expect(within(dialog).getByRole('list', { name: 'Dependencies' })).toHaveTextContent('relates to3Receipt mail✅Closed')
      expect(within(dependents).getByRole('link', { name: '4' })).toHaveAttribute('href', '/bead?db=.claude&id=t-4')
    })

    it('shows the dependency links on the page of the bead', async () => {
      window.history.replaceState(null, '', '/bead?db=.claude&id=t-2')
      render(<App />)
      const dependents = await screen.findByRole('list', { name: 'Dependents' })
      expect(within(dependents).getByRole('link', { name: '1' })).toHaveAttribute('href', '/bead?db=.claude&id=t-1')
    })
  })

  describe('the page of one bead', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/bead?db=.claude&id=t-1')
    })

    it('shows the bead as a full page when the user opens the address of the bead', async () => {
      render(<App />)
      expect(await screen.findByRole('heading', { level: 1, name: 'Cart total' })).toBeInTheDocument()
      expect(await screen.findByText('Show the total of the cart.')).toBeInTheDocument()
      expect(screen.getByText('2026-10-14 started')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Epics' })).not.toBeInTheDocument()
    })

    it('keeps the address of the bead, so that a reload shows the same bead', async () => {
      render(<App />)
      await screen.findByText('Show the total of the cart.')
      expect(window.location.pathname).toBe('/bead')
      expect(window.location.search).toBe('?db=.claude&id=t-1')
      expect(calls).toContain('/api/beads/t-1?db=.claude')
    })

    it('links the other beads to their own pages and links back to the board', async () => {
      render(<App />)
      await screen.findByText('Show the total of the cart.')
      expect(screen.getByRole('link', { name: '1' })).toHaveAttribute('href', '/bead?db=.claude&id=e-1')
      expect(screen.getByRole('link', { name: 'beadoo' })).toHaveAttribute('href', '/?db=.claude')
    })

    it('tells the user when the database has no bead with the id of the address', async () => {
      window.history.replaceState(null, '', '/bead?db=.claude&id=t-9')
      render(<App />)
      expect(await screen.findByText('Not found')).toBeInTheDocument()
    })
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
      expect(within(within(checkout).getByRole('group', { name: 'Checkout: Open' })).getAllByRole('button', { name: /^t-\d+ / }).map((b) => b.getAttribute('aria-label'))).toEqual(['t-2 Pay button', 't-1 Cart total'])
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
      bead: { ...beads[1], status: 'in_progress', assignee: 'Ann', notes: 'started 2026-10-16 09:05 kind=new worktree=/home/me/wt/t-1' },
      worktree: 'repo::/home/me/wt/t-1',
      path: '/home/me/wt/t-1',
      branch: 'feat/1-cart-total',
      terminal: 'term_7',
    }

    const MAIN = '/home/me/.claude'
    const EPIC = '/home/me/wt/e-1'
    const OTHER = '/home/me/wt/t-9'

    const worktrees = [
      { path: MAIN, branch: 'master', main: true },
      { path: EPIC, branch: 'feat/e-1-checkout', parent: MAIN },
      { path: OTHER, branch: 'feat/t-9-pay', heldBy: 't-9', busy: true },
    ]

    beforeEach(() => {
      answers['/api/actor?db=.claude'] = json({ actor: 'Ann' })
      answers['/api/beads/t-1/spawn-choices?db=.claude'] = json({ repo: MAIN, worktrees })
    })

    withPageToken()

    const openDetail = async (search = '/?db=.claude&bead=t-1') => {
      window.history.replaceState(null, '', search)
      render(<App />)
      return screen.findByRole('dialog')
    }

    const openSpawn = async (panel: HTMLElement) => {
      await userEvent.click(await within(panel).findByRole('button', { name: 'Spawn' }))
      const modal = await screen.findByRole('dialog', { name: 'Spawn a session on t-1' })
      await within(modal).findByRole('button', { name: 'Claim and spawn' })
      return modal
    }

    it('shows no spawn button when Orca is not on the PATH of the server', async () => {
      answers['/api/databases'] = json({ databases: [{ name: '.claude', path: MAIN }], spawn: false })
      const panel = await openDetail()
      expect(await within(panel).findByRole('button', { name: 'Claim' })).toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Spawn' })).not.toBeInTheDocument()
    })

    it('shows the spawn button when Orca is on the PATH of the server', async () => {
      const panel = await openDetail()
      expect(await within(panel).findByRole('button', { name: 'Spawn' })).toBeInTheDocument()
    })

    const spawnBody = () => {
      const call = vi.mocked(fetch).mock.calls.find(([path]) => String(path).includes('/spawn?'))
      return call ? JSON.parse(String(call[1]?.body)) : undefined
    }

    it('proposes a new worktree in plan mode, with a branch from the id and the title of the bead', async () => {
      const modal = await openSpawn(await openDetail())
      expect(within(modal).getByRole('radio', { name: 'A new worktree' })).toBeChecked()
      expect(within(modal).getByLabelText('Branch of the session')).toHaveValue('feat/1-cart-total')
      expect(within(modal).getByRole('radio', { name: 'The new worktree' })).toBeChecked()
      expect(within(modal).getByRole('radio', { name: 'Plan' })).toBeChecked()
    })

    it('proposes a child of the epic worktree in plan mode when the epic already has a worktree', async () => {
      answers['/api/beads/t-1/spawn-choices?db=.claude'] = json({ repo: MAIN, worktrees, epic: { id: 'e-1', path: EPIC } })
      const modal = await openSpawn(await openDetail())
      expect(within(modal).getByRole('radio', { name: 'A child of a worktree' })).toBeChecked()
      expect(within(modal).getByLabelText('Parent worktree')).toHaveValue(EPIC)
      expect(within(modal).getByRole('radio', { name: 'The child worktree' })).toBeChecked()
      expect(within(modal).getByRole('radio', { name: 'Plan' })).toBeChecked()
    })

    it('claims the bead and starts a session, then shows the worktree, the branch and the terminal', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(session)
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      expect(await within(panel).findByText('A session started on the bead')).toBeInTheDocument()
      expect(within(panel).getByText('/home/me/wt/t-1')).toBeInTheDocument()
      expect(within(panel).getByText('feat/1-cart-total')).toBeInTheDocument()
      expect(within(panel).getByText('term_7')).toBeInTheDocument()
      expect(within(panel).getByText('In progress')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Spawn a session on t-1' })).not.toBeInTheDocument())
      expect(writes).toEqual([{ path: '/api/beads/t-1/spawn?db=.claude', token: 'page-token' }])
      expect(spawnBody()).toEqual({ kind: 'new', location: 'worktree', mode: 'plan', branch: 'feat/1-cart-total' })
    })

    it('starts the session on the branch that the user typed', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, branch: 'fix/cart-total' })
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      const branch = within(modal).getByLabelText('Branch of the session')
      await userEvent.clear(branch)
      await userEvent.type(branch, 'fix/cart-total')
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      await within(panel).findByText('A session started on the bead')
      expect(spawnBody()).toMatchObject({ branch: 'fix/cart-total' })
    })

    it('does not start a session on a branch that is not a type and a slug, and tells the user why', async () => {
      const modal = await openSpawn(await openDetail())
      const branch = within(modal).getByLabelText('Branch of the session')
      await userEvent.clear(branch)
      await userEvent.type(branch, 'Cart')
      expect(within(modal).getByRole('button', { name: 'Claim and spawn' })).toBeDisabled()
      expect(within(modal).getByText(/Give the branch as <type>\/<slug>/)).toBeInTheDocument()
    })

    it('starts the session in an existing worktree that the user chose, in the mode that the user chose', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, path: EPIC, kind: 'existing', mode: 'acceptEdits' })
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      await userEvent.click(within(modal).getByRole('radio', { name: 'An existing worktree' }))
      await userEvent.selectOptions(within(modal).getByLabelText('Target worktree'), EPIC)
      await userEvent.click(within(modal).getByRole('radio', { name: 'The parent worktree' }))
      await userEvent.click(within(modal).getByRole('radio', { name: 'Accept edits' }))
      expect(within(modal).queryByLabelText('Branch of the session')).not.toBeInTheDocument()
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      await within(panel).findByText('A session started on the bead')
      expect(spawnBody()).toEqual({ kind: 'existing', target: EPIC, location: 'parent', mode: 'acceptEdits' })
    })

    it('shows which bead holds a worktree, and still lets the user choose that worktree', async () => {
      const modal = await openSpawn(await openDetail())
      await userEvent.click(within(modal).getByRole('radio', { name: 'An existing worktree' }))
      expect(within(modal).getByRole('option', { name: /feat\/t-9-pay .* held by t-9/ })).toBeEnabled()
      await userEvent.selectOptions(within(modal).getByLabelText('Target worktree'), OTHER)
      expect(within(modal).getByLabelText('Target worktree')).toHaveValue(OTHER)
    })

    it('warns the user when a Claude session already runs in the chosen worktree, and still lets the user start the session', async () => {
      const modal = await openSpawn(await openDetail())
      await userEvent.click(within(modal).getByRole('radio', { name: 'An existing worktree' }))
      await userEvent.selectOptions(within(modal).getByLabelText('Target worktree'), OTHER)
      expect(within(modal).getByText('A Claude session already runs in this worktree')).toBeInTheDocument()
      expect(within(modal).getByRole('button', { name: 'Claim and spawn' })).toBeEnabled()
    })

    it('asks the user to confirm a session with no worktree before the start', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, path: MAIN, kind: 'none' })
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      await userEvent.click(within(modal).getByRole('radio', { name: 'No worktree' }))
      expect(within(modal).getByRole('radio', { name: 'The main checkout' })).toBeChecked()
      expect(within(modal).getByRole('button', { name: 'Claim and spawn' })).toBeDisabled()
      await userEvent.click(within(modal).getByRole('checkbox', { name: /I confirm the risky choice: the session has no dedicated worktree/ }))
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      await within(panel).findByText('A session started on the bead')
      expect(spawnBody()).toEqual({ kind: 'none', location: 'worktree', mode: 'plan', confirmed: true })
    })

    it('asks the user to confirm a session that bypasses the permissions before the start', async () => {
      const modal = await openSpawn(await openDetail())
      await userEvent.click(within(modal).getByRole('radio', { name: 'Bypass permissions' }))
      expect(within(modal).getByRole('button', { name: 'Claim and spawn' })).toBeDisabled()
      await userEvent.click(within(modal).getByRole('checkbox', { name: /the session bypasses the permissions/ }))
      expect(within(modal).getByRole('button', { name: 'Claim and spawn' })).toBeEnabled()
    })

    it('proposes the kind, the location and the mode of the last spawn when the user opens the window again', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, path: EPIC, kind: 'existing', mode: 'default' })
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      await userEvent.click(within(modal).getByRole('radio', { name: 'An existing worktree' }))
      await userEvent.click(within(modal).getByRole('radio', { name: 'Default' }))
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      await within(panel).findByText('A session started on the bead')
      cleanup()
      const again = await openSpawn(await openDetail())
      expect(within(again).getByRole('radio', { name: 'An existing worktree' })).toBeChecked()
      expect(within(again).getByRole('radio', { name: 'Default' })).toBeChecked()
    })

    it('tells the user when the page cannot list the worktrees of the repo', async () => {
      answers['/api/beads/t-1/spawn-choices?db=.claude'] = json({ repo: MAIN, worktrees: [], problem: 'orca repo list failed: Orca is not running' })
      const modal = await openSpawn(await openDetail())
      expect(within(modal).getByText('The page could not list the worktrees')).toBeInTheDocument()
      expect(within(modal).getByText(/Orca is not running/)).toBeInTheDocument()
    })

    it('tells the user why the session did not start', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(
        { error: 'orca terminal create failed: Timed out\nThe bead t-1 is open again.', code: 'SPAWN_FAILED' },
        502,
      )
      const panel = await openDetail()
      await userEvent.click(within(await openSpawn(panel)).getByRole('button', { name: 'Claim and spawn' }))
      expect(await within(panel).findByText('The page could not start a session')).toBeInTheDocument()
      expect(within(panel).getByText(/The bead t-1 is open again/)).toBeInTheDocument()
    })

    it('shows the bead as the database holds it after a start that failed', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json(
        { error: 'orca terminal create failed: Timed out\nThe page could not give the bead t-1 back: database is locked.', code: 'SPAWN_FAILED' },
        502,
      )
      const panel = await openDetail()
      const modal = await openSpawn(panel)
      answers['/api/beads/t-1?db=.claude'] = json({ ...beads[1], status: 'in_progress', assignee: 'Ann' })
      await userEvent.click(within(modal).getByRole('button', { name: 'Claim and spawn' }))
      expect(await within(panel).findByText('The page could not start a session')).toBeInTheDocument()
      expect(await within(panel).findByText('In progress')).toBeInTheDocument()
    })

    it('shows the warning when the session runs but the page could not note its start', async () => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({ ...session, warning: 'The session runs, but the page could not write the note of the start' })
      const panel = await openDetail()
      await userEvent.click(within(await openSpawn(panel)).getByRole('button', { name: 'Claim and spawn' }))
      expect(await within(panel).findByText(/could not write the note of the start/)).toBeInTheDocument()
    })

    it('does not offer to start a session on a bead that another actor holds', async () => {
      answers['/api/beads/t-1?db=.claude'] = json({ ...beads[1], status: 'in_progress', assignee: 'Bob' })
      const panel = await openDetail()
      await within(panel).findByText('Bob')
      expect(within(panel).queryByRole('button', { name: 'Spawn' })).not.toBeInTheDocument()
    })

    it('tells the user that the worktree stays after the release of the claim', async () => {
      answers['/api/beads/t-1?db=.claude'] = json(session.bead)
      answers['POST /api/beads/t-1/unclaim?db=.claude'] = json({ ...session.bead, status: 'open', assignee: undefined })
      const panel = await openDetail()
      await userEvent.click(await within(panel).findByRole('button', { name: 'Unclaim' }))
      expect(await within(panel).findByText('The worktree of the session stays')).toBeInTheDocument()
      expect(within(panel).getByText('/home/me/wt/t-1')).toBeInTheDocument()
      expect(within(panel).getByText(/Remove it in Orca, or with git worktree remove/)).toBeInTheDocument()
      expect(writes.map((write) => write.path)).toEqual(['/api/beads/t-1/unclaim?db=.claude'])
    })
  })

  describe('the claim and the spawn from a card', () => {
    const claimed = { ...beads[1], status: 'in_progress', assignee: 'Ann' }

    beforeEach(() => {
      answers['/api/actor?db=.claude'] = json({ actor: 'Ann' })
      answers['POST /api/beads/t-1/claim?db=.claude'] = json(claimed)
      answers['/api/beads/t-1/spawn-choices?db=.claude'] = json({ repo: '/home/me/.claude', worktrees: [] })
    })

    withPageToken()

    const actionsOf = async (id: string) => screen.findByRole('toolbar', { name: `Actions on ${id}` })

    const reads = () => calls.filter((call) => call.startsWith('/api/beads?')).length

    it.each([
      ['the epic board', '/?db=.claude&status=all&view=epic'],
      ['the lanes', '/?db=.claude&status=all&view=lanes'],
      ['the table', '/?db=.claude&status=all&view=table'],
    ])('claims a bead from its card in %s, and does not open the detail of the bead', async (_view, search) => {
      window.history.replaceState(null, '', search)
      render(<App />)
      await userEvent.click(within(await actionsOf('t-1')).getByRole('button', { name: 'Claim' }))
      await waitFor(() => expect(reads()).toBe(2))
      expect(writes).toEqual([{ path: '/api/beads/t-1/claim?db=.claude', token: 'page-token' }])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(window.location.search).not.toContain('bead=')
    })

    it.each([
      ['the epic board', '/?db=.claude&status=all&view=epic'],
      ['the lanes', '/?db=.claude&status=all&view=lanes'],
      ['the table', '/?db=.claude&status=all&view=table'],
    ])('starts a session from the card in %s through the spawn window', async (_view, search) => {
      answers['POST /api/beads/t-1/spawn?db=.claude'] = json({
        bead: claimed,
        worktree: 'repo::/home/me/wt/t-1',
        path: '/home/me/wt/t-1',
        branch: 'feat/1-cart-total',
        terminal: 'term_7',
      })
      window.history.replaceState(null, '', search)
      render(<App />)
      await userEvent.click(within(await actionsOf('t-1')).getByRole('button', { name: 'Spawn' }))
      const modal = await screen.findByRole('dialog', { name: 'Spawn a session on t-1' })
      await userEvent.click(await within(modal).findByRole('button', { name: 'Claim and spawn' }))
      const result = await screen.findByRole('region', { name: 'Result on t-1' })
      expect(await within(result).findByText('A session started on the bead')).toBeInTheDocument()
      expect(within(result).getByText('term_7')).toBeInTheDocument()
      expect(writes.map((write) => write.path)).toEqual(['/api/beads/t-1/spawn?db=.claude'])
      expect(window.location.search).not.toContain('bead=')
    })

    it('offers to renew and to release a bead of the current actor on its card, and no action on a bead of another actor or a closed bead', async () => {
      answers['/api/beads?db=.claude'] = json({
        beads: [...beads, { ...claimed, id: 't-5', title: 'Ship the order' }, { ...claimed, id: 't-6', title: 'Mail the bill', assignee: 'Bob' }],
        readyIds: ['t-1', 't-4'],
      })
      window.history.replaceState(null, '', '/?db=.claude&status=all&view=epic')
      render(<App />)
      const mine = await actionsOf('t-5')
      expect(within(mine).getByRole('button', { name: 'Renew' })).toBeInTheDocument()
      expect(within(mine).getByRole('button', { name: 'Unclaim' })).toBeInTheDocument()
      expect(within(mine).queryByRole('button', { name: 'Spawn' })).not.toBeInTheDocument()
      expect(screen.queryByRole('toolbar', { name: 'Actions on t-6' })).not.toBeInTheDocument()
      expect(screen.queryByRole('toolbar', { name: 'Actions on t-3' })).not.toBeInTheDocument()
    })

    it('tells the user why the claim from a card failed', async () => {
      answers['POST /api/beads/t-1/claim?db=.claude'] = json({ error: 'issue already claimed by Bob', code: 'CONFLICT' }, 409)
      window.history.replaceState(null, '', '/?db=.claude&status=all&view=lanes')
      render(<App />)
      await userEvent.click(within(await actionsOf('t-1')).getByRole('button', { name: 'Claim' }))
      const result = await screen.findByRole('region', { name: 'Result on t-1' })
      expect(within(result).getByText('The page could not change the claim of t-1')).toBeInTheDocument()
      expect(within(result).getByText('issue already claimed by Bob')).toBeInTheDocument()
      await userEvent.click(within(result).getByRole('button', { name: 'Dismiss' }))
      expect(screen.queryByRole('region', { name: 'Result on t-1' })).not.toBeInTheDocument()
    })

    it('tells the user that the worktree stays after the release of a claim from a card', async () => {
      const started = { ...claimed, notes: 'started 2026-10-16 09:05 kind=new worktree=/home/me/wt/t-1 mode=plan' }
      answers['/api/beads?db=.claude'] = json({ beads: [beads[0], started], readyIds: [] })
      answers['POST /api/beads/t-1/unclaim?db=.claude'] = json({ ...started, status: 'open', assignee: undefined })
      window.history.replaceState(null, '', '/?db=.claude&status=all&view=table')
      render(<App />)
      await userEvent.click(within(await actionsOf('t-1')).getByRole('button', { name: 'Unclaim' }))
      const result = await screen.findByRole('region', { name: 'Result on t-1' })
      expect(within(result).getByText('The worktree of the session stays')).toBeInTheDocument()
      expect(within(result).getByText('/home/me/wt/t-1')).toBeInTheDocument()
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

    describe('the claim of an epic', () => {
      const epic = { ...beads[0], dependencies: [] }

      beforeEach(() => {
        answers['/api/beads/e-1?db=.claude'] = json(epic)
        answers['POST /api/beads/e-1/claim?db=.claude'] = json({ ...epic, status: 'in_progress', assignee: 'Ann' })
      })

      it('opens the epic from its board, and the user claims the epic from its detail', async () => {
        window.history.replaceState(null, '', '/?db=.claude&view=epic')
        render(<App />)
        await userEvent.click(await screen.findByRole('button', { name: 'Open the epic Checkout' }))
        const dialog = await screen.findByRole('dialog')
        await userEvent.click(await within(dialog).findByRole('button', { name: 'Claim' }))
        expect(await within(dialog).findByText('In progress')).toBeInTheDocument()
        expect(within(dialog).getByText('Ann')).toBeInTheDocument()
        expect(writes).toEqual([{ path: '/api/beads/e-1/claim?db=.claude', token: 'page-token' }])
      })

      it('opens the epic from the table of the beads by epic', async () => {
        window.history.replaceState(null, '', '/?db=.claude&view=table')
        render(<App />)
        const group = await screen.findByRole('rowgroup', { name: 'Checkout' })
        await userEvent.click(within(group).getByRole('button', { name: 'Open the epic Checkout' }))
        const dialog = await screen.findByRole('dialog')
        expect(await within(dialog).findByRole('button', { name: 'Claim' })).toBeInTheDocument()
        expect(window.location.search).toContain('bead=e-1')
      })

      it('does not offer to open an epic for the beads that have no epic', async () => {
        window.history.replaceState(null, '', '/?db=.claude&view=table')
        render(<App />)
        const group = await screen.findByRole('rowgroup', { name: 'No epic' })
        expect(within(group).queryByRole('button', { name: /Open the epic/ })).not.toBeInTheDocument()
      })
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

    it('tells the user that the worktree of the session stays after the close of the bead', async () => {
      const started = { ...beads[1], status: 'in_progress', notes: 'started 2026-10-16 09:05 kind=child worktree=/home/me/wt/t-1 mode=plan' }
      answers['/api/beads/t-1?db=.claude'] = json(started)
      answers['POST /api/beads/t-1/edit?db=.claude'] = json({ ...started, status: 'closed', close_reason: 'Shipped' })
      window.history.replaceState(null, '', '/?db=.claude&bead=t-1')
      render(<App />)
      const dialog = await screen.findByRole('dialog')
      await userEvent.click(await within(dialog).findByRole('button', { name: 'Edit' }))
      await userEvent.selectOptions(within(dialog).getByLabelText('Status'), 'closed')
      await userEvent.type(within(dialog).getByLabelText('Close reason'), 'Shipped')
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
      expect(await within(dialog).findByText('The worktree of the session stays')).toBeInTheDocument()
      expect(within(dialog).getByText('/home/me/wt/t-1')).toBeInTheDocument()
      expect(writes.map((write) => write.path)).toEqual(['/api/beads/t-1/edit?db=.claude'])
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
