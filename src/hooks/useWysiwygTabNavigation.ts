import { useCallback, type KeyboardEvent } from 'react'

type TurndownLike = {
  turndown: (input: string) => string
}

type UseWysiwygTabNavigationParams = {
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
}

export function useWysiwygTabNavigation({
  turndownService,
  updateActiveTabBody,
}: UseWysiwygTabNavigationParams) {
  const handleWysiwygTabNavigation = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement): boolean => {
      if (event.key !== 'Tab') {
        return false
      }

      const selection = window.getSelection()
      const anchor = selection?.anchorNode ?? null
      const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement ?? null
      const currentListItem = anchorElement?.closest('li') as HTMLLIElement | null

      if (currentListItem && editor.contains(currentListItem)) {
        event.preventDefault()
        document.execCommand(event.shiftKey ? 'outdent' : 'indent', false)
        const markdown = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(markdown)
        return true
      }

      const currentCell = anchorElement?.closest('td, th') as HTMLTableCellElement | null
      const table = currentCell?.closest('table') as HTMLTableElement | null

      if (!(currentCell && table)) {
        return false
      }

      event.preventDefault()

      const allCells = Array.from(table.querySelectorAll('td, th')) as HTMLTableCellElement[]
      const currentIndex = allCells.indexOf(currentCell)

      if (!event.shiftKey) {
        const nextCell = allCells[currentIndex + 1]
        if (nextCell) {
          const range = document.createRange()
          range.selectNodeContents(nextCell)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
        } else {
          const lastRow = table.querySelector('tbody tr:last-child') as HTMLTableRowElement | null
          if (lastRow) {
            const colCount = Math.max(...Array.from(table.rows).map((row) => row.cells.length), 1)
            const newRow = document.createElement('tr')
            for (let i = 0; i < colCount; i += 1) {
              const cell = document.createElement('td')
              cell.innerHTML = i === 0 ? '\u200B' : ''
              newRow.appendChild(cell)
            }
            lastRow.parentNode?.insertBefore(newRow, lastRow.nextSibling)
            const firstCell = newRow.cells[0]
            if (firstCell) {
              const range = document.createRange()
              range.selectNodeContents(firstCell)
              range.collapse(true)
              selection?.removeAllRanges()
              selection?.addRange(range)
            }
            const markdown = turndownService.turndown(editor.innerHTML)
            updateActiveTabBody(markdown)
          }
        }
      } else {
        const previousCell = allCells[currentIndex - 1]
        if (previousCell) {
          const range = document.createRange()
          range.selectNodeContents(previousCell)
          range.collapse(false)
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
      }

      return true
    },
    [turndownService, updateActiveTabBody],
  )

  return { handleWysiwygTabNavigation }
}
