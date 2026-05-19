import { useCallback, useRef, useState } from 'react'
import type { ConfirmDialogState } from '../types/shared'

export function useConfirmationDialog() {
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const confirmDialogResolverRef = useRef<((value: boolean) => void) | null>(null)

  const requestConfirmation = useCallback((dialog: ConfirmDialogState): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmDialogResolverRef.current = resolve
      setConfirmDialog(dialog)
    })
  }, [])

  const resolveConfirmationDialog = useCallback((value: boolean) => {
    const resolver = confirmDialogResolverRef.current
    confirmDialogResolverRef.current = null
    setConfirmDialog(null)
    resolver?.(value)
  }, [])

  return {
    confirmDialog,
    requestConfirmation,
    resolveConfirmationDialog,
  }
}
