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

let answers: Record<string, Answer>
let calls: string[]

const json = (body: unknown, status = 200): Answer => ({ status, body })

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  calls = []
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
    vi.fn(async (input: string) => {
      calls.push(input)
      const answer = answers[input] ?? json({ error: 'Not found' }, 404)
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
})
