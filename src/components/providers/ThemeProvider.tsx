'use client'

import { createContext, useContext, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getModuleFromPath, MODULE_THEME, type ModuleKey, type ModuleTheme } from '@/lib/module-theme'
import type { UiPreferences } from '@/lib/actions/ui-preferences'

// ─── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  moduleKey:      ModuleKey | null
  theme:          ModuleTheme | null
  preferences:    UiPreferences
  setPreferences: (p: UiPreferences) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  moduleKey:      null,
  theme:          null,
  preferences:    { intensity: 'normal', custom_bg: null },
  setPreferences: () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({
  children,
  initialPreferences,
}: {
  children:            React.ReactNode
  initialPreferences?: UiPreferences | null
}) {
  const pathname  = usePathname()
  const moduleKey = getModuleFromPath(pathname)
  const theme     = moduleKey ? MODULE_THEME[moduleKey] : null

  const [preferences, setPreferences] = useState<UiPreferences>(
    initialPreferences ?? { intensity: 'normal', custom_bg: null }
  )

  const hasImage = !!preferences.background_image_url

  const bgClass = useMemo(() => {
    if (hasImage)                              return ''
    if (preferences.custom_bg)                 return ''
    if (!theme)                                return 'bg-slate-50'
    if (preferences.intensity === 'off')       return 'bg-slate-50'
    if (preferences.intensity === 'intense')   return theme.bgIntense
    return theme.bg
  }, [preferences, theme, hasImage])

  const sectionStyle: React.CSSProperties | undefined = useMemo(() => {
    if (hasImage) {
      const posX  = preferences.background_position_x ?? 50
      const posY  = preferences.background_position_y ?? 50
      const scale = Math.max(1, Math.min(3, preferences.background_scale ?? 1))
      // background-size auto-scaling: `cover` * scale% — quando scale=1 mantém
      // o comportamento clássico cover; quando scale>1, faz zoom adicional.
      const sizePct = Math.round(scale * 100)
      return {
        backgroundImage:    `url("${preferences.background_image_url}")`,
        backgroundSize:     `${sizePct}% auto`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat:   'no-repeat',
        backgroundAttachment: 'fixed',
      }
    }
    if (preferences.custom_bg) {
      return { backgroundColor: preferences.custom_bg }
    }
    return undefined
  }, [preferences, hasImage])

  const value = useMemo(
    () => ({ moduleKey, theme, preferences, setPreferences }),
    [moduleKey, theme, preferences]
  )

  return (
    <ThemeContext.Provider value={value}>
      <section
        className={`transition-colors duration-300 ${bgClass}`}
        style={sectionStyle}
      >
        {children}
      </section>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
