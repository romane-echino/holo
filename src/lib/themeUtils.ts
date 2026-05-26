// ─── Thème (dark / light / system) ───────────────────────────────────────────

export function applyTheme(theme: 'dark' | 'light' | 'system') {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
  document.documentElement.dataset.theme = resolved
}

// ─── Accent (violet / blue / cyan) ───────────────────────────────────────────

type AccentKey = 'violet' | 'blue' | 'cyan'

const ACCENTS: Record<AccentKey, {
  primary: string
  soft: string
  muted: string
  surface: string
  selectionBg: string
  fieldShadow: string
  windowGlow: string
}> = {
  violet: {
    primary: '#7B61FF',
    soft: '#927CFF',
    muted: '#B9ACFF',
    surface: 'rgb(123 97 255 / 0.14)',
    selectionBg: 'rgb(123 97 255 / 0.34)',
    fieldShadow: '0 0 0 4px rgb(123 97 255 / 0.10)',
    windowGlow: '0 0 42px rgb(123 97 255 / 0.16)',
  },
  blue: {
    primary: '#3B82F6',
    soft: '#60A5FA',
    muted: '#93C5FD',
    surface: 'rgb(59 130 246 / 0.14)',
    selectionBg: 'rgb(59 130 246 / 0.34)',
    fieldShadow: '0 0 0 4px rgb(59 130 246 / 0.10)',
    windowGlow: '0 0 42px rgb(59 130 246 / 0.16)',
  },
  cyan: {
    primary: '#06B6D4',
    soft: '#22D3EE',
    muted: '#67E8F9',
    surface: 'rgb(6 182 212 / 0.14)',
    selectionBg: 'rgb(6 182 212 / 0.34)',
    fieldShadow: '0 0 0 4px rgb(6 182 212 / 0.10)',
    windowGlow: '0 0 42px rgb(6 182 212 / 0.16)',
  },
}

export function applyAccent(accent: AccentKey) {
  const c = ACCENTS[accent]
  const root = document.documentElement
  root.style.setProperty('--color-holo-primary', c.primary)
  root.style.setProperty('--color-holo-primary-soft', c.soft)
  root.style.setProperty('--color-holo-primary-muted', c.muted)
  root.style.setProperty('--color-holo-primary-surface', c.surface)
  root.style.setProperty('--holo-selection-bg', c.selectionBg)
  root.style.setProperty('--holo-field-shadow-focus', c.fieldShadow)
  root.style.setProperty('--shadow-holo-glow', c.windowGlow)
}

// Réinitialise l'accent à violet (supprime les overrides inline)
export function resetAccent() {
  const root = document.documentElement
  const vars = [
    '--color-holo-primary', '--color-holo-primary-soft', '--color-holo-primary-muted',
    '--color-holo-primary-surface', '--holo-selection-bg', '--holo-field-shadow-focus',
    '--shadow-holo-glow',
  ]
  for (const v of vars) root.style.removeProperty(v)
}
