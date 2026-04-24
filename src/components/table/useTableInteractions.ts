import { useCallback, useRef } from 'react'
import { ensureTableInteractiveMarkers, refreshEditorTableSummaries, setHeaderColumnType } from './tableEngine'

type TurndownLike = {
  turndown: (html: string) => string
}

type UseTableInteractionsParams = {
  wysiwygEditorRef: React.RefObject<HTMLDivElement | null>
  imageDragDepthRef: React.RefObject<number>
  setIsImageDragOverEditor: React.Dispatch<React.SetStateAction<boolean>>
  getNextTableDndId: () => string
  onEditorDragOver: (event: React.DragEvent<HTMLDivElement>) => void
  handleImageFiles: (
    files: File[],
    insertFn: (markdownImage: string, relativePath: string, previewDataUrl: string) => void,
  ) => Promise<void>
  isImageFile: (file: File) => boolean
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
  setColumnTypePopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; thEl: HTMLElement } | null>>
}

export function useTableInteractions({
  wysiwygEditorRef,
  getNextTableDndId,
  imageDragDepthRef,
  setIsImageDragOverEditor,
  onEditorDragOver,
  handleImageFiles,
  isImageFile,
  turndownService,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
  setColumnTypePopup,
}: UseTableInteractionsParams) {
  const tableDragStateRef = useRef<{ type: 'row' | 'column'; tableId: string; fromIndex: number } | null>(null)

  const ensureTableInteractiveMarkersLocal = useCallback((table: HTMLTableElement) => {
    ensureTableInteractiveMarkers(table, getNextTableDndId)
  }, [getNextTableDndId])

  const refreshTableSummaries = useCallback(() => {
    const editor = wysiwygEditorRef.current
    if (!editor) return
    refreshEditorTableSummaries(editor, getNextTableDndId)
  }, [getNextTableDndId, wysiwygEditorRef])

  const onWysiwygDragStart = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const clearTableDragHighlights = () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      editor.querySelectorAll('.table-drag-source, .table-drag-target').forEach((el) => {
        el.classList.remove('table-drag-source', 'table-drag-target')
      })
    }

    const target = event.target as HTMLElement | null
    if (!target) return

    const rowHandle = target.closest('.table-row-index-badge') as HTMLElement | null
    if (rowHandle) {
      const row = rowHandle.closest('tbody tr') as HTMLTableRowElement | null
      const table = row?.closest('table') as HTMLTableElement | null
      const tbody = table?.querySelector('tbody')
      if (!row || !table || !tbody) return
      ensureTableInteractiveMarkersLocal(table)
      const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[]
      const fromIndex = rows.indexOf(row)
      if (fromIndex < 0) return
      tableDragStateRef.current = {
        type: 'row',
        tableId: table.dataset.tableDndId ?? '',
        fromIndex,
      }
      clearTableDragHighlights()
      row.classList.add('table-drag-source')
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', 'holo-table-row-drag')
      return
    }

    const columnHandle = target.closest('thead th') as HTMLTableCellElement | null
    if (columnHandle) {
      const table = columnHandle.closest('table') as HTMLTableElement | null
      if (!table) return
      ensureTableInteractiveMarkersLocal(table)
      tableDragStateRef.current = {
        type: 'column',
        tableId: table.dataset.tableDndId ?? '',
        fromIndex: columnHandle.cellIndex,
      }
      clearTableDragHighlights()
      columnHandle.classList.add('table-drag-source')
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', 'holo-table-column-drag')
      return
    }
  }, [ensureTableInteractiveMarkersLocal, wysiwygEditorRef])

  const onWysiwygDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const clearTableDragTargets = () => {
        const editor = wysiwygEditorRef.current
        if (!editor) return
        editor.querySelectorAll('.table-drag-target').forEach((el) => el.classList.remove('table-drag-target'))
      }

      const dragState = tableDragStateRef.current
      if (dragState) {
        const target = event.target as HTMLElement | null
        if (dragState.type === 'row') {
          const targetRow = target?.closest('tbody tr') as HTMLTableRowElement | null
          const targetTable = targetRow?.closest('table') as HTMLTableElement | null
          if (targetRow && targetTable?.dataset.tableDndId === dragState.tableId) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            clearTableDragTargets()
            targetRow.classList.add('table-drag-target')
            return
          }
        } else {
          const targetTh = target?.closest('thead th') as HTMLTableCellElement | null
          const targetTable = targetTh?.closest('table') as HTMLTableElement | null
          if (targetTh && targetTable?.dataset.tableDndId === dragState.tableId) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            clearTableDragTargets()
            targetTh.classList.add('table-drag-target')
            return
          }
        }

        clearTableDragTargets()
      }

      onEditorDragOver(event)
    },
    [onEditorDragOver, wysiwygEditorRef],
  )

  const onWysiwygDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const clearTableDragHighlights = () => {
        editor.querySelectorAll('.table-drag-source, .table-drag-target').forEach((el) => {
          el.classList.remove('table-drag-source', 'table-drag-target')
        })
      }

      const dragState = tableDragStateRef.current
      if (dragState) {
        const target = event.target as HTMLElement | null
        let handled = false

        if (dragState.type === 'row') {
          const targetRow = target?.closest('tbody tr') as HTMLTableRowElement | null
          const table = targetRow?.closest('table') as HTMLTableElement | null
          const tbody = table?.querySelector('tbody')
          if (targetRow && table && tbody && table.dataset.tableDndId === dragState.tableId) {
            const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[]
            const fromRow = rows[dragState.fromIndex]
            const toIndex = rows.indexOf(targetRow)

            if (fromRow && toIndex >= 0 && dragState.fromIndex !== toIndex) {
              if (dragState.fromIndex < toIndex) {
                tbody.insertBefore(fromRow, targetRow.nextSibling)
              } else {
                tbody.insertBefore(fromRow, targetRow)
              }
              handled = true
              const focusCell = fromRow.cells[0]
              if (focusCell) {
                const range = document.createRange()
                range.selectNodeContents(focusCell)
                range.collapse(false)
                window.getSelection()?.removeAllRanges()
                window.getSelection()?.addRange(range)
              }
            }
          }
        } else {
          const targetTh = target?.closest('thead th') as HTMLTableCellElement | null
          const table = targetTh?.closest('table') as HTMLTableElement | null
          if (targetTh && table && table.dataset.tableDndId === dragState.tableId) {
            const toIndex = targetTh.cellIndex
            const fromIndex = dragState.fromIndex

            if (fromIndex !== toIndex) {
              Array.from(table.rows).forEach((row) => {
                const cells = Array.from(row.cells)
                const moving = cells[fromIndex]
                const targetCell = cells[toIndex]
                if (!moving || !targetCell) return

                if (fromIndex < toIndex) {
                  row.insertBefore(moving, targetCell.nextSibling)
                } else {
                  row.insertBefore(moving, targetCell)
                }
              })
              handled = true
              const firstDataRow = table.querySelector('tbody tr') as HTMLTableRowElement | null
              const focusCell = firstDataRow?.cells[toIndex]
              if (focusCell) {
                const range = document.createRange()
                range.selectNodeContents(focusCell)
                range.collapse(false)
                window.getSelection()?.removeAllRanges()
                window.getSelection()?.addRange(range)
              }
            }
          }
        }

        tableDragStateRef.current = null
        clearTableDragHighlights()

        if (handled) {
          event.preventDefault()
          event.stopPropagation()
          refreshTableSummaries()
          const md = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(md)
          return
        }
      }

      imageDragDepthRef.current = 0
      setIsImageDragOverEditor(false)
      const imageFiles = Array.from(event.dataTransfer.files).filter(isImageFile)
      if (imageFiles.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      void handleImageFiles(imageFiles, (_md, relativePath, previewDataUrl) => {
        const isExternal = /^https?:\/\//i.test(relativePath)
        const safePath = relativePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        const imgHtml = isExternal
          ? `<img src="${safePath}" alt="" style="max-width:100%;border-radius:4px">`
          : `<img data-src="${safePath}" src="${previewDataUrl}" alt="" style="max-width:100%;border-radius:4px">`
        document.execCommand('insertHTML', false, imgHtml)
        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
      })
    },
    [
      handleImageFiles,
      imageDragDepthRef,
      isImageFile,
      refreshTableSummaries,
      setIsImageDragOverEditor,
      turndownService,
      updateActiveTabBody,
      wysiwygEditorRef,
    ],
  )

  const onWysiwygDragEnd = useCallback(() => {
    const editor = wysiwygEditorRef.current
    if (editor) {
      editor.querySelectorAll('.table-drag-source, .table-drag-target').forEach((el) => {
        el.classList.remove('table-drag-source', 'table-drag-target')
      })
    }
    tableDragStateRef.current = null
  }, [wysiwygEditorRef])

  const insertTableRow = useCallback(() => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()

    if (!editor || !sel?.anchorNode) {
      return
    }

    const anchorElement = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorElement?.closest('td, th') as HTMLTableCellElement | null
    const currentRow = currentCell?.closest('tr') as HTMLTableRowElement | null
    const table = currentRow?.closest('table') as HTMLTableElement | null

    if (!currentRow || !table) {
      return
    }

    const columnCount = Math.max(...Array.from(table.rows).map((row) => row.cells.length), 1)
    const newRow = document.createElement('tr')

    for (let index = 0; index < columnCount; index += 1) {
      const cell = document.createElement('td')
      cell.innerHTML = index === 0 ? '\u200B' : ''
      newRow.appendChild(cell)
    }

    currentRow.parentNode?.insertBefore(newRow, currentRow.nextSibling)

    const firstCell = newRow.cells[0]
    if (firstCell) {
      const range = document.createRange()
      range.selectNodeContents(firstCell)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
    syncWysiwygFromMarkdown(md)
  }, [syncWysiwygFromMarkdown, turndownService, updateActiveTabBody, wysiwygEditorRef])

  const insertTableColumn = useCallback(() => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()

    if (!editor || !sel?.anchorNode) {
      return
    }

    const anchorElement = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorElement?.closest('td, th') as HTMLTableCellElement | null
    const table = currentCell?.closest('table') as HTMLTableElement | null

    if (!currentCell || !table) {
      return
    }

    const columnIndex = currentCell.cellIndex

    Array.from(table.rows).forEach((row, rowIndex) => {
      const referenceCell = row.cells[columnIndex]
      const isHeaderRow = row.parentElement?.tagName === 'THEAD' || rowIndex === 0
      const nextCell = document.createElement(isHeaderRow ? 'th' : 'td')
      nextCell.innerHTML = rowIndex === 0 ? 'Nouvelle col.' : rowIndex === 1 ? '\u200B' : ''
      row.insertBefore(nextCell, referenceCell?.nextSibling ?? null)
    })

    const currentRow = currentCell.closest('tr') as HTMLTableRowElement | null
    const targetRow = table.rows[currentRow?.rowIndex ?? 0]
    const targetCell = targetRow?.cells[columnIndex + 1]
    if (targetCell) {
      const range = document.createRange()
      range.selectNodeContents(targetCell)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
    syncWysiwygFromMarkdown(md)
  }, [syncWysiwygFromMarkdown, turndownService, updateActiveTabBody, wysiwygEditorRef])

  const deleteTableRow = useCallback(() => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()
    if (!editor || !sel?.anchorNode) return

    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentRow = anchorEl?.closest('tr') as HTMLTableRowElement | null
    const table = currentRow?.closest('table') as HTMLTableElement | null
    if (!currentRow || !table) return

    const tbody = table.querySelector('tbody')
    if (tbody && tbody.rows.length <= 1 && currentRow.parentElement === tbody) return

    const prevRow = currentRow.previousElementSibling as HTMLTableRowElement | null
    const nextRow = currentRow.nextElementSibling as HTMLTableRowElement | null
    const focusRow = prevRow ?? nextRow
    currentRow.remove()

    if (focusRow) {
      const cell = focusRow.cells[0]
      if (cell) {
        const range = document.createRange()
        range.selectNodeContents(cell)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }

    updateActiveTabBody(turndownService.turndown(editor.innerHTML))
  }, [turndownService, updateActiveTabBody, wysiwygEditorRef])

  const deleteTableColumn = useCallback(() => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()
    if (!editor || !sel?.anchorNode) return

    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null
    const table = currentCell?.closest('table') as HTMLTableElement | null
    if (!currentCell || !table) return

    const colIndex = currentCell.cellIndex
    if (table.rows[0]?.cells.length <= 1) return

    Array.from(table.rows).forEach((row) => {
      const cell = row.cells[colIndex]
      if (cell) cell.remove()
    })

    Array.from(table.rows).forEach((row) => {
      const focusCell = row.cells[Math.max(0, colIndex - 1)]
      if (focusCell) {
        const range = document.createRange()
        range.selectNodeContents(focusCell)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    })

    updateActiveTabBody(turndownService.turndown(editor.innerHTML))
  }, [turndownService, updateActiveTabBody, wysiwygEditorRef])

  const sortTableByCurrentColumn = useCallback((direction: 'asc' | 'desc') => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()
    if (!editor || !sel?.anchorNode) return

    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null
    const table = currentCell?.closest('table') as HTMLTableElement | null
    if (!currentCell || !table) return

    const tbody = table.querySelector('tbody')
    if (!tbody) return

    const columnIndex = currentCell.cellIndex
    const headerCell = table.querySelectorAll('thead th')[columnIndex] as HTMLTableCellElement | undefined
    const headerText = (headerCell?.textContent ?? '').trim()
    const isNumeric = headerText.startsWith('🔢') || headerText.startsWith('💰')
    const isDate = headerText.startsWith('📅')
    const isCheckbox = headerText.startsWith('☑️')

    const rows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[]

    const parseValue = (row: HTMLTableRowElement) => {
      const cell = row.cells[columnIndex]
      if (!cell) return ''

      if (isCheckbox) {
        const input = cell.querySelector('input[type="checkbox"]') as HTMLInputElement | null
        return input?.checked ? 1 : 0
      }

      const raw = (cell.textContent ?? '').replace(/\u200B/g, '').trim()

      if (isNumeric) {
        const num = Number.parseFloat(raw.replace(/[^\d.,-]/g, '').replace(',', '.'))
        return Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY
      }

      if (isDate) {
        const time = Date.parse(raw)
        return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
      }

      return raw.toLowerCase()
    }

    rows.sort((left, right) => {
      const leftValue = parseValue(left)
      const rightValue = parseValue(right)

      if (leftValue < rightValue) return direction === 'asc' ? -1 : 1
      if (leftValue > rightValue) return direction === 'asc' ? 1 : -1
      return 0
    })

    rows.forEach((row) => tbody.appendChild(row))

    const focusCell = rows[0]?.cells[columnIndex]
    if (focusCell) {
      const range = document.createRange()
      range.selectNodeContents(focusCell)
      range.collapse(false)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    refreshTableSummaries()
    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
  }, [refreshTableSummaries, turndownService, updateActiveTabBody, wysiwygEditorRef])

  const setCurrentColumnType = useCallback((emoji: string) => {
    const editor = wysiwygEditorRef.current
    const sel = window.getSelection()
    if (!editor || !sel?.anchorNode) return

    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null
    const table = currentCell?.closest('table') as HTMLTableElement | null
    if (!currentCell || !table) return

    const columnIndex = currentCell.cellIndex
    const headerCell = table.querySelectorAll('thead th')[columnIndex] as HTMLTableCellElement | undefined
    if (!headerCell) return

    setHeaderColumnType(headerCell, emoji)

    refreshTableSummaries()
    const md = turndownService.turndown(editor.innerHTML)
    updateActiveTabBody(md)
    syncWysiwygFromMarkdown(md)
  }, [refreshTableSummaries, syncWysiwygFromMarkdown, turndownService, updateActiveTabBody, wysiwygEditorRef])

  const openCurrentColumnTypePicker = useCallback(() => {
    const sel = window.getSelection()
    if (!sel?.anchorNode) return

    const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode.parentElement
    const currentCell = anchorEl?.closest('td, th') as HTMLTableCellElement | null
    const table = currentCell?.closest('table') as HTMLTableElement | null
    if (!currentCell || !table) return

    const columnIndex = currentCell.cellIndex
    const headerCell = table.querySelectorAll('thead th')[columnIndex] as HTMLElement | undefined
    if (!headerCell) return

    const rect = headerCell.getBoundingClientRect()
    setColumnTypePopup({ x: rect.left, y: rect.bottom + 4, thEl: headerCell })
  }, [setColumnTypePopup])

  return {
    getNextTableDndId,
    refreshTableSummaries,
    onWysiwygDragStart,
    onWysiwygDragOver,
    onWysiwygDrop,
    onWysiwygDragEnd,
    insertTableRow,
    insertTableColumn,
    deleteTableRow,
    deleteTableColumn,
    sortTableByCurrentColumn,
    setCurrentColumnType,
    openCurrentColumnTypePicker,
  }
}
