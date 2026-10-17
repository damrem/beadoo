import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeSwitch } from './ThemeSwitch'
import { THEME_KEY } from '@/lib/theme'

const isDarkPage = () => document.documentElement.classList.contains('dark')

const systemPrefersDark = (dark: boolean) => {
  const listeners = new Set<() => void>()
  const query = {
    matches: dark,
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (next: boolean) => {
    query.matches = next
    listeners.forEach((listener) => listener())
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

describe('the colour mode switch', () => {
  it('shows the page in the dark mode when the user selects it, and remembers it', async () => {
    systemPrefersDark(false)
    render(<ThemeSwitch />)
    await userEvent.click(screen.getByRole('button', { name: 'Dark mode' }))
    expect(isDarkPage()).toBe(true)
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('shows the page in the mode that the user chose before', () => {
    systemPrefersDark(true)
    window.localStorage.setItem(THEME_KEY, 'light')
    render(<ThemeSwitch />)
    expect(isDarkPage()).toBe(false)
    expect(screen.getByRole('button', { name: 'Light mode' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('follows a change of the system setting in the system mode', () => {
    const change = systemPrefersDark(false)
    render(<ThemeSwitch />)
    expect(isDarkPage()).toBe(false)
    change(true)
    expect(isDarkPage()).toBe(true)
  })
})
