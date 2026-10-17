export const THEME_MODES = ['light', 'dark', 'system'] as const

export type ThemeMode = (typeof THEME_MODES)[number]

export const THEME_KEY = 'beadoo:theme'

export const LEGACY_THEME_KEY = 'beads-page:theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export const isThemeMode = (value: unknown): value is ThemeMode => THEME_MODES.includes(value as ThemeMode)

export const isDark = (mode: ThemeMode, systemDark: boolean): boolean =>
  mode === 'dark' || (mode === 'system' && systemDark)

export function readThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_KEY) ?? window.localStorage.getItem(LEGACY_THEME_KEY)
    return isThemeMode(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_KEY, mode)
  } catch {
    return
  }
}

export const systemQuery = (): MediaQueryList | null =>
  typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null

export function applyThemeMode(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', isDark(mode, systemQuery()?.matches ?? false))
}
