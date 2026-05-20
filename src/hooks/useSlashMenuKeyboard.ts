import { useCallback, useEffect, type KeyboardEvent } from 'react'
import { SLASH_COMMANDS, matchesSlashQuery } from '../lib/editorSlash'
import type { SlashCommand } from '../types/editor'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useSlashMenuKeyboard({
  executeSlashCommand,
  getBlockTextBeforeCursor,
}: {
  executeSlashCommand: (command: SlashCommand) => void
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
}) {
  const { slashMenu, slashMenuIndex, setSlashMenu, setSlashMenuIndex, slashMenuListRef } = useEditorOverlay()

  useEffect(() => {
    if (!slashMenu) return
    const listEl = slashMenuListRef.current
    if (!listEl) return
    const activeItem = listEl.querySelector<HTMLButtonElement>(`[data-slash-index="${slashMenuIndex}"]`)
    activeItem?.scrollIntoView({ block: 'nearest' })
  }, [slashMenu, slashMenuIndex, slashMenuListRef])

  const handleSlashMenuKeyboard = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement): boolean => {
      if (slashMenu) {
        const filtered = SLASH_COMMANDS.filter((command) => matchesSlashQuery(command, slashMenu.query))

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashMenuIndex((index) => Math.min(index + 1, filtered.length - 1))
          return true
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashMenuIndex((index) => Math.max(index - 1, 0))
          return true
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          const target = filtered[slashMenuIndex]
          if (target) executeSlashCommand(target)
          return true
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashMenu(null)
          setSlashMenuIndex(0)
          document.execCommand('delete', false)
          return true
        }

        if (event.key === ' ') {
          setSlashMenu(null)
          setSlashMenuIndex(0)
          return true
        }

        if (event.key === 'Backspace') {
          const { text } = getBlockTextBeforeCursor()
          if (text === '/') {
            setSlashMenu(null)
            setSlashMenuIndex(0)
          }
          return true
        }

        return true
      }

      if (event.key === '/') {
        const { text } = getBlockTextBeforeCursor()
        if (text.trim() === '') {
          const selection = window.getSelection()
          if (selection?.rangeCount) {
            const range = selection.getRangeAt(0)
            const temporarySpan = document.createElement('span')
            temporarySpan.textContent = '|'
            range.insertNode(temporarySpan)
            const rect = temporarySpan.getBoundingClientRect()
            temporarySpan.parentNode?.removeChild(temporarySpan)
            const editorRect = editor.getBoundingClientRect()
            const isInBottomHalf = rect.top > editorRect.top + editorRect.height / 2
            const menuHeightEstimate = 260
            const menuWidthEstimate = 260

            let x = rect.left
            let y = isInBottomHalf ? rect.top - menuHeightEstimate - 6 : rect.top + rect.height + 6

            const minX = 8
            const maxX = Math.max(minX, window.innerWidth - menuWidthEstimate - 8)
            x = Math.max(minX, Math.min(x, maxX))

            const minY = Math.max(8, editorRect.top + 8)
            const maxY = Math.min(window.innerHeight - 8, editorRect.bottom - 8)
            y = Math.max(minY, Math.min(y, maxY))

            setSlashMenu({ x, y, query: '' })
            setSlashMenuIndex(0)
          }
        }
        return true
      }

      return false
    },
    [executeSlashCommand, getBlockTextBeforeCursor, setSlashMenu, setSlashMenuIndex, slashMenu, slashMenuIndex],
  )

  return { handleSlashMenuKeyboard }
}
