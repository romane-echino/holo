import { useHoloTheme } from '../hooks/useHoloTheme'

export function ThemeToggleButton() {
  const { theme, toggleTheme } = useHoloTheme()

  return (
    <button
      onClick={toggleTheme}
      className="rounded-holo-md border border-holo-border-soft bg-holo-glass px-3 py-2 text-sm text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text active:scale-[0.98]"
      title={theme === 'dark' ? 'Passer en light mode' : 'Passer en dark mode'}
      aria-label={theme === 'dark' ? 'Passer en light mode' : 'Passer en dark mode'}
    >
      {theme === 'dark' ? '☀︎' : '☾'}
    </button>
  )
}
