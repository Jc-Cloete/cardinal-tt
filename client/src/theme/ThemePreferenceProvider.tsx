import {Theme} from '@radix-ui/themes'
import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'

type ThemeMode = 'dark' | 'light'

type ThemePreferenceContextValue = {
  mode: ThemeMode
  isDark: boolean
  toggle: () => void
  setMode: (mode: ThemeMode) => void
}

const STORAGE_KEY = 'cardinal-tt.theme-mode'
const DEFAULT_MODE: ThemeMode = 'dark'

const ThemePreferenceContext = createContext<ThemePreferenceContextValue | null>(null)

const readStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_MODE
  }

  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : DEFAULT_MODE
}

type ThemePreferenceProviderProps = {
  children: ReactNode
}

export const ThemePreferenceProvider = ({children}: ThemePreferenceProviderProps) => {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredTheme())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const value = useMemo<ThemePreferenceContextValue>(
    () => ({
      mode,
      isDark: mode === 'dark',
      toggle: () => setMode((prev) => (prev === 'dark' ? 'light' : 'dark')),
      setMode,
    }),
    [mode],
  )

  return (
    <ThemePreferenceContext.Provider value={value}>
      <Theme
        appearance={mode}
        accentColor="cyan"
        grayColor="slate"
        radius="medium"
        scaling="100%"
      >
        {children}
      </Theme>
    </ThemePreferenceContext.Provider>
  )
}

export const useThemePreference = (): ThemePreferenceContextValue => {
  const context = useContext(ThemePreferenceContext)
  if (!context) {
    throw new Error('useThemePreference must be used within ThemePreferenceProvider')
  }

  return context
}
