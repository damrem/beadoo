import { useEffect, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { applyThemeMode, isThemeMode, readThemeMode, systemQuery, THEME_MODES, writeThemeMode } from '@/lib/theme'
import type { ThemeMode } from '@/lib/theme'

const THEME_TITLES: Record<ThemeMode, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
  system: 'System mode',
}

const THEME_ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon }

export function ThemeSwitch() {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode)

  useEffect(() => {
    applyThemeMode(mode)
    writeThemeMode(mode)
    if (mode !== 'system') return
    const query = systemQuery()
    const follow = () => applyThemeMode('system')
    query?.addEventListener('change', follow)
    return () => query?.removeEventListener('change', follow)
  }, [mode])

  return (
    <ToggleGroup
      aria-label="Colour mode"
      variant="outline"
      size="sm"
      spacing={0}
      value={[mode]}
      onValueChange={(values: unknown[]) => {
        const next = values[0]
        if (isThemeMode(next)) setMode(next)
      }}
    >
      {THEME_MODES.map((entry) => {
        const Icon = THEME_ICONS[entry]
        return (
          <ToggleGroupItem key={entry} value={entry} aria-label={THEME_TITLES[entry]} title={THEME_TITLES[entry]}>
            <Icon />
          </ToggleGroupItem>
        )
      })}
    </ToggleGroup>
  )
}
