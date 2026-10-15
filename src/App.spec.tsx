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

describe('the beads page', () => {
  it('shows the ready beads of the epic when the page opens', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    expect(within(column('Open')).getByText('Cart total')).toBeInTheDocument()
    expect(within(column('Open')).queryByText('Pay button')).not.toBeInTheDocument()
    expect(within(column('Closed')).queryByText('Receipt mail')).not.toBeInTheDocument()
    expect(window.location.search).toContain('db=.claude')
    expect(window.location.search).toContain('status=ready')
  })

  it('lists the epics with the count of their children for each status', async () => {
    render(<App />)
    const epics = await screen.findByRole('navigation', { name: 'Epics' })
    expect(within(epics).getByRole('button', { name: /Checkout.*2 open · 1 closed/ })).toBeInTheDocument()
    expect(within(epics).getByRole('button', { name: /No epic.*1 open/ })).toBeInTheDocument()
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
    expect(within(dialog).getByRole('button', { name: 'e-1' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 't-2' })).toBeInTheDocument()
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

  it('keeps the last filter of the user for the next visit', async () => {
    render(<App />)
    await screen.findByText('Cart total')
    await userEvent.click(screen.getByRole('button', { name: 'Closed' }))
    expect(JSON.parse(window.localStorage.getItem('beads-page:filters') ?? '{}')).toMatchObject({ status: 'closed' })
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
      const meta = document.createElement('meta')
      meta.name = 'beads-token'
      meta.content = 'page-token'
      document.head.append(meta)
    })

    afterEach(() => {
      document.head.querySelector('meta[name="beads-token"]')?.remove()
    })

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
      expect(await within(dialog).findByText('in_progress')).toBeInTheDocument()
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
      await within(dialog).findByText('closed')
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
