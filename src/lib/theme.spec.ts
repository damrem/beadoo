import { isDark, readThemeMode, THEME_KEY, writeThemeMode } from '@/lib/theme'

describe('the colour mode', () => {
  it('follows the system setting in the system mode', () => {
    expect(isDark('system', true)).toBe(true)
    expect(isDark('system', false)).toBe(false)
  })

  it('ignores the system setting when the user chose a mode', () => {
    expect(isDark('dark', false)).toBe(true)
    expect(isDark('light', true)).toBe(false)
  })

  it('remembers the mode that the user chose', () => {
    writeThemeMode('dark')
    expect(readThemeMode()).toBe('dark')
  })

  it('starts in the system mode when the stored mode is unknown', () => {
    window.localStorage.setItem(THEME_KEY, 'sepia')
    expect(readThemeMode()).toBe('system')
  })

  it('starts in the system mode when the browser refuses the storage', () => {
    const refuse = () => {
      throw new Error('denied')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(refuse)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(refuse)
    expect(() => writeThemeMode('dark')).not.toThrow()
    expect(readThemeMode()).toBe('system')
    vi.restoreAllMocks()
  })
})
