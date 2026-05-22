import { useEffect, useState } from 'react'

export type HoloTheme = 'dark' | 'light'

export function useHoloTheme(defaultTheme: HoloTheme = 'dark') {
  const [theme, setTheme] = useState<HoloTheme>(() => {
    return (localStorage.getItem('holo-theme') as HoloTheme | null) ?? defaultTheme
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('holo-theme', theme)
  }, [theme])

  return {
    theme,
    setTheme,
    toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  }
}
