export type Theme = 'light' | 'dark' | 'system'

const KEY = 'pm-theme'

export function getStoredTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? 'system'
}

export function setStoredTheme(t: Theme): void {
  localStorage.setItem(KEY, t)
}

export function resolveTheme(t: Theme): 'light' | 'dark' {
  if (t !== 'system') return t
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(resolved: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}
