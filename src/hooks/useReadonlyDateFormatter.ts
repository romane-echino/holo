import { useCallback } from 'react'

export function useReadonlyDateFormatter() {
  const formatReadonlyDate = useCallback((value?: string | null) => {
    if (!value) {
      return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return date.toLocaleString()
  }, [])

  return {
    formatReadonlyDate,
  }
}
