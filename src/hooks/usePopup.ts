import { useState } from 'react'

export function usePopup() {
  const [open, setOpen] = useState(false)
  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
  }
}
