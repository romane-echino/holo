export type TableColumnType = 'text' | 'number' | 'date' | 'checkbox'

export const COLUMN_TYPES = [
  { emoji: '', label: 'Texte' },
  { emoji: '🔢', label: 'Nombre' },
  { emoji: '💰', label: 'Monétaire' },
  { emoji: '📅', label: 'Date' },
  { emoji: '☑️', label: 'Checkbox' },
]

export const TYPE_EMOJIS = COLUMN_TYPES.filter((type) => type.emoji).map((type) => type.emoji)

function detectColumnTypeFromHeaderText(text: string): TableColumnType {
  if (text.startsWith('🔢') || text.startsWith('💰')) return 'number'
  if (text.startsWith('📅')) return 'date'
  if (text.startsWith('☑️')) return 'checkbox'
  return 'text'
}

function computeTableSummaryRow(tbody: HTMLTableSectionElement, colTypes: TableColumnType[], doc: Document) {
  const summaryRow = doc.createElement('tr')
  summaryRow.classList.add('table-summary-row')

  colTypes.forEach((type, index) => {
    const td = doc.createElement('td')
    td.classList.add('table-summary-cell')
    td.setAttribute('contenteditable', 'false')
    td.setAttribute('tabindex', '-1')

    if (type === 'number') {
      const cells = Array.from(tbody.querySelectorAll(`tr td:nth-child(${index + 1})`))
      let sum = 0
      cells.forEach((cell) => {
        const val = parseFloat((cell.textContent ?? '').replace(/[^\d.,-]/g, '').replace(',', '.'))
        if (!isNaN(val)) sum += val
      })
      td.textContent = sum.toLocaleString('fr-FR')
      td.classList.add('col-type-number')
    } else if (type === 'checkbox') {
      const checkboxes = Array.from(tbody.querySelectorAll(`tr td:nth-child(${index + 1}) input`)) as HTMLInputElement[]
      const checkedCount = checkboxes.filter((cb) => cb.checked).length
      td.textContent = `${checkedCount} / ${checkboxes.length}`
    } else {
      const rowCount = tbody.querySelectorAll('tr').length
      td.textContent = index === 0 ? `${rowCount} ligne${rowCount > 1 ? 's' : ''}` : ''
    }

    summaryRow.appendChild(td)
  })

  return summaryRow
}

export function ensureTableInteractiveMarkers(
  table: HTMLTableElement,
  getNextTableDndId: () => string,
  doc: Document = document,
) {
  if (!table.dataset.tableDndId) {
    table.dataset.tableDndId = getNextTableDndId()
  }

  const headerCells = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[]
  headerCells.forEach((th, index) => {
    th.setAttribute('draggable', 'true')
    th.dataset.tableDragType = 'column'
    th.dataset.tableDragIndex = String(index)
  })

  const tbody = table.querySelector('tbody')
  if (!tbody) return

  const tbodyRows = Array.from(tbody.querySelectorAll('tr')) as HTMLTableRowElement[]
  tbodyRows.forEach((row, index) => {
    const firstCell = row.querySelector('td, th') as HTMLTableCellElement | null
    if (!firstCell) return

    let badge = firstCell.querySelector('.table-row-index-badge') as HTMLSpanElement | null
    if (!badge) {
      badge = doc.createElement('span')
      badge.className = 'table-row-index-badge'
      badge.setAttribute('contenteditable', 'false')
      firstCell.insertBefore(badge, firstCell.firstChild)
    }

    badge.textContent = `${index + 1}`
    badge.setAttribute('draggable', 'true')
    badge.dataset.tableDragType = 'row'
    badge.dataset.tableDragIndex = String(index)
  })
}

function decorateTableBodyCells(table: HTMLTableElement, colTypes: TableColumnType[]) {
  const tbody = table.querySelector('tbody')
  if (!tbody) return

  Array.from(tbody.querySelectorAll('tr')).forEach((row) => {
    Array.from(row.querySelectorAll('td')).forEach((td, index) => {
      td.classList.remove('col-type-number', 'col-checkbox-cell', 'col-type-date')
      td.removeAttribute('data-checked')

      const type = colTypes[index]
      if (type === 'number') {
        td.classList.add('col-type-number')
      } else if (type === 'checkbox') {
        const raw = td.textContent?.trim().toLowerCase() ?? ''
        const checked = ['x', 'true', 'yes', 'oui', '1', '✓', '✔'].includes(raw)
        td.classList.add('col-checkbox-cell')
        td.dataset.checked = String(checked)
        td.innerHTML = `<input type="checkbox" class="task-checkbox col-checkbox" ${checked ? 'checked' : ''} />`
      } else if (type === 'date') {
        td.classList.add('col-type-date')
      }
    })
  })
}

function ensureTableWrapperAndAddRowButton(table: HTMLTableElement, doc: Document) {
  const parent = table.parentElement
  if (!parent) return

  let wrapper = table.closest('.table-scroll-wrapper') as HTMLDivElement | null
  if (!wrapper) {
    wrapper = doc.createElement('div')
    wrapper.className = 'table-scroll-wrapper'
    parent.insertBefore(wrapper, table)
    wrapper.appendChild(table)
  }

  const nextElement = wrapper.nextElementSibling
  if (!nextElement || !(nextElement instanceof HTMLButtonElement) || !nextElement.classList.contains('table-add-row-btn')) {
    const addRowBtn = doc.createElement('button')
    addRowBtn.className = 'table-add-row-btn'
    addRowBtn.setAttribute('contenteditable', 'false')
    addRowBtn.textContent = '+ Nouveau'
    wrapper.parentNode?.insertBefore(addRowBtn, wrapper.nextSibling)
  }
}

export function enhanceTablesInDocument(doc: Document, getNextTableDndId: () => string) {
  doc.querySelectorAll('table').forEach((tableNode) => {
    const table = tableNode as HTMLTableElement

    const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[]
    const colTypes = headers.map((header) => detectColumnTypeFromHeaderText(header.textContent ?? ''))

    decorateTableBodyCells(table, colTypes)
    ensureTableInteractiveMarkers(table, getNextTableDndId, doc)

    const tbody = table.querySelector('tbody')
    if (tbody) {
      table.querySelector('tfoot')?.remove()
      const tfoot = doc.createElement('tfoot')
      tfoot.appendChild(computeTableSummaryRow(tbody, colTypes, doc))
      table.appendChild(tfoot)
    }

    ensureTableWrapperAndAddRowButton(table, doc)
  })
}

export function refreshEditorTableSummaries(editor: HTMLElement, getNextTableDndId: () => string) {
  editor.querySelectorAll('table').forEach((tableNode) => {
    const table = tableNode as HTMLTableElement
    const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[]
    const colTypes = headers.map((header) => detectColumnTypeFromHeaderText(header.textContent ?? ''))
    const tbody = table.querySelector('tbody')
    if (!tbody) return

    table.querySelector('tfoot')?.remove()
    const tfoot = document.createElement('tfoot')
    tfoot.appendChild(computeTableSummaryRow(tbody, colTypes, document))
    table.appendChild(tfoot)

    ensureTableInteractiveMarkers(table, getNextTableDndId, document)
  })
}

export function setHeaderColumnType(headerCell: HTMLTableCellElement, emoji: string) {
  let text = headerCell.textContent ?? ''

  for (const typeEmoji of TYPE_EMOJIS) {
    if (text.startsWith(`${typeEmoji} `)) {
      text = text.slice(typeEmoji.length + 1)
      break
    }
    if (text.startsWith(typeEmoji)) {
      text = text.slice(typeEmoji.length)
      break
    }
  }

  const cleanText = text.trim() || 'Colonne'
  headerCell.textContent = emoji ? `${emoji} ${cleanText}` : cleanText
}
