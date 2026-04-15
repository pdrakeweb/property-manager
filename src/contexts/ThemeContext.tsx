import { createContext, useContext, useState, useEffect } from 'react'
import type { Theme } from '../lib/theme'
import { getStoredTheme, setStoredTheme, resolveTheme, applyTheme } from '../lib/theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  resolved: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  setTheme: () => {},
  resolved: 'light',
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolveTheme(getStoredTheme()))

  useEffect(() => {
    const r = resolveTheme(theme)
    setResolved(r)
    applyTheme(r)
  }, [theme])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      if (theme === 'system') {
        const r = resolveTheme('system')
        setResolved(r)
        applyTheme(r)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  function setTheme(t: Theme) {
    setStoredTheme(t)
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
