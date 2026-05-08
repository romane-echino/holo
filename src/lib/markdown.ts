/**
 * markdown.ts — Holo Markdown engine
 *
 * Single point of truth for:
 *  - Front-matter parsing / serialization
 *  - HTML ↔ Markdown conversion (turndown singleton + marked)
 *  - WYSIWYG HTML post-processing (tasks, highlights, code, tables)
 */

import { marked } from 'marked'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import hljs from 'highlight.js'
import { enhanceTablesInDocument } from '../components/table/tableEngine'
import type { EditableMarkdownHeader } from '../types/editor'

// ─────────────────────────────────────────────
// Front-matter helpers
// ─────────────────────────────────────────────

export function splitMarkdownFrontMatter(markdown: string) {
  const lines = markdown.split(/\r?\n/)

  if (lines[0] !== '---') {
    return { hasFrontMatter: false, frontMatterLines: [] as string[], body: markdown }
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === '---')

  if (endIndex <= 0) {
    return { hasFrontMatter: false, frontMatterLines: [] as string[], body: markdown }
  }

  return {
    hasFrontMatter: true,
    frontMatterLines: lines.slice(1, endIndex),
    body: lines.slice(endIndex + 1).join('\n'),
  }
}

export function escapeFrontMatterValue(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ')
  return `"${normalized.replace(/"/g, '\\"')}"`
}

export function readFrontMatterValue(line: string): string {
  const [, raw = ''] = line.split(/:(.*)/)
  const trimmed = raw.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function readFrontMatterBooleanValue(line: string): boolean {
  const value = readFrontMatterValue(line).trim().toLowerCase()
  return value === 'true' || value === '1' || value === 'yes' || value === 'oui'
}

export function getEditableMarkdownHeader(markdown: string): EditableMarkdownHeader {
  const { frontMatterLines } = splitMarkdownFrontMatter(markdown)
  const header: EditableMarkdownHeader = {
    title: '',
    description: '',
    author: '',
    icon: '',
    tags: [],
    isTemplate: false,
  }

  for (const line of frontMatterLines) {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:/)
    if (!match) continue
    const key = match[1].toLowerCase()

    if (key === 'title' || key === 'description' || key === 'author' || key === 'icon') {
      header[key] = readFrontMatterValue(line)
    }
    if (key === 'tags') {
      const raw = line.replace(/^tags\s*:/i, '').trim()
      const inner = raw.startsWith('[') && raw.endsWith(']') ? raw.slice(1, -1) : raw
      header.tags = inner
        .split(',')
        .map((t) => t.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    }
    if (key === 'template' || key === 'istemplate') {
      header.isTemplate = readFrontMatterBooleanValue(line)
    }
  }

  return header
}

export function updateMarkdownHeaderField(
  markdown: string,
  field: keyof EditableMarkdownHeader,
  nextValue: string,
): string {
  const { frontMatterLines, body } = splitMarkdownFrontMatter(markdown)
  const nextLines = [...frontMatterLines]
  const keyMatcher = new RegExp(`^${field}\\s*:`, 'i')
  const existingIndexes = nextLines
    .map((line, index) => (keyMatcher.test(line) ? index : -1))
    .filter((index) => index >= 0)

  for (let index = existingIndexes.length - 1; index >= 1; index -= 1) {
    nextLines.splice(existingIndexes[index], 1)
  }

  const firstExistingIndex = existingIndexes.length > 0 ? existingIndexes[0] : -1
  const cleanedValue = nextValue

  if (!cleanedValue) {
    if (firstExistingIndex >= 0) nextLines.splice(firstExistingIndex, 1)
  } else {
    const nextLine = `${field}: ${escapeFrontMatterValue(cleanedValue)}`
    if (firstExistingIndex >= 0) {
      nextLines[firstExistingIndex] = nextLine
    } else {
      nextLines.push(nextLine)
    }
  }

  if (nextLines.length === 0) return body
  return ['---', ...nextLines, '---', body].join('\n')
}

export function updateTagsInMarkdown(markdown: string, tags: string[]): string {
  const { frontMatterLines, body } = splitMarkdownFrontMatter(markdown)
  const nextLines = frontMatterLines.filter((l) => !/^tags\s*:/i.test(l))
  if (tags.length > 0) {
    const serialized = '[' + tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ') + ']'
    nextLines.push(`tags: ${serialized}`)
  }
  if (nextLines.length === 0) return body
  return ['---', ...nextLines, '---', body].join('\n')
}

export function updateMarkdownBooleanHeaderField(
  markdown: string,
  field: string,
  nextValue: boolean,
): string {
  const { frontMatterLines, body } = splitMarkdownFrontMatter(markdown)
  const fieldMatcher = new RegExp(`^${field}\\s*:`, 'i')
  const nextLines = frontMatterLines.filter((line) => !fieldMatcher.test(line))
  if (nextValue) nextLines.push(`${field}: true`)
  if (nextLines.length === 0) return body
  return ['---', ...nextLines, '---', body].join('\n')
}

export function updateMarkdownBody(markdown: string, nextBody: string): string {
  const { frontMatterLines } = splitMarkdownFrontMatter(markdown)
  if (frontMatterLines.length === 0) return nextBody
  return ['---', ...frontMatterLines, '---', nextBody].join('\n')
}

// ─────────────────────────────────────────────
// Turndown singleton (HTML → Markdown)
// ─────────────────────────────────────────────

function buildTurndownService(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  })
  service.use(gfm)

  service.addRule('localImage', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as HTMLImageElement
      let src = img.getAttribute('src') ?? ''
      const dataSrc = img.getAttribute('data-src')
      const alt = img.getAttribute('alt') ?? ''
      if (dataSrc) src = dataSrc
      return `![${alt}](${src})`
    },
  })

  service.addRule('taskListItem', {
    filter: (node) =>
      node.nodeName === 'LI' && (node as HTMLElement).classList.contains('task-item'),
    replacement: (_content, node) => {
      const li = node as HTMLElement
      const checkbox = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null
      const label = li.querySelector('.task-label')
      const text = (label?.textContent ?? '').replace(/\u200B/g, '').trim()
      const checked = checkbox?.hasAttribute('checked') ?? false
      return `\n- [${checked ? 'x' : ' '}] ${text}`
    },
  })

  service.addRule('codeBlock', {
    filter: (node) => node.nodeName === 'PRE' && Boolean((node as HTMLElement).querySelector('code')),
    replacement: (_content, node) => {
      const code = (node as HTMLElement).querySelector('code')
      const lang = Array.from(code?.classList ?? [])
        .find((c) => c.startsWith('language-'))
        ?.replace('language-', '') ?? ''
      const actualLang = lang === 'plaintext' ? '' : lang
      const text = (code?.textContent ?? '').replace(/\u200B/g, '').trim()
      return `\n\n\`\`\`${actualLang}\n${text}\n\`\`\`\n\n`
    },
  })

  service.addRule('tableCheckboxCell', {
    filter: (node) =>
      node.nodeName === 'TD' && (node as HTMLElement).classList.contains('col-checkbox-cell'),
    replacement: (_content, node) =>
      (node as HTMLElement).dataset.checked === 'true' ? 'x' : '',
  })

  // Strip generated table UI rows before serializing
  const origTurndown = service.turndown.bind(service)
  service.turndown = (html: string | Node) => {
    if (typeof html === 'string') {
      const div = document.createElement('div')
      div.innerHTML = html
      div
        .querySelectorAll('.table-summary-row, tfoot, .table-add-row-btn, .table-row-index-badge')
        .forEach((el) => el.remove())
      div.querySelectorAll('.table-scroll-wrapper').forEach((wrapper) => {
        while (wrapper.firstChild) wrapper.parentNode?.insertBefore(wrapper.firstChild, wrapper)
        wrapper.parentNode?.removeChild(wrapper)
      })
      return origTurndown(div.innerHTML)
    }
    return origTurndown(html as HTMLElement)
  }

  return service
}

/** Singleton — import and use directly, no prop-drilling needed. */
export const turndownService = buildTurndownService()

/** Convenience: HTML string → Markdown string */
export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html)
}

// ─────────────────────────────────────────────
// marked → HTML post-processor (Markdown → HTML)
// ─────────────────────────────────────────────

/**
 * Convert Markdown body to editor-ready HTML.
 * @param getTableDndId - callback supplying a unique drag-n-drop id per table.
 */
export function parseMarkdownToHtml(
  markdown: string,
  getTableDndId: () => string,
): string {
  const parsed = marked.parse(markdown)
  const html = typeof parsed === 'string' ? parsed : ''

  const doc = new DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('img').forEach((img) => {
    const rawSrc = img.getAttribute('src')?.trim()
    if (!rawSrc) return
    if (/^(https?:|data:)/i.test(rawSrc)) return

    let imagePath = rawSrc.replace(/^\/+/, '')
    if (!imagePath.startsWith('images/')) imagePath = 'images/' + imagePath
    img.setAttribute('data-src', imagePath)
    img.setAttribute(
      'src',
      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3C/svg%3E',
    )
  })

  doc.querySelectorAll('li > input[type="checkbox"]').forEach((checkbox) => {
    const input = checkbox as HTMLInputElement
    input.removeAttribute('disabled')
    input.classList.add('task-checkbox')

    const parentLi = input.closest('li')
    if (parentLi) {
      parentLi.classList.add('task-item')
      const parentUl = parentLi.closest('ul')
      if (parentUl) parentUl.classList.add('task-list')

      if (!parentLi.querySelector('.task-label')) {
        const label = doc.createElement('span')
        label.classList.add('task-label')
        while (input.nextSibling) label.appendChild(input.nextSibling)
        if (!label.textContent?.trim()) label.textContent = 'Tâche'
        parentLi.appendChild(label)
      }

      if (input.checked) parentLi.classList.add('task-item-checked')
    }
  })

  doc.querySelectorAll('a').forEach((anchor) => {
    if (!anchor.getAttribute('title')) {
      anchor.setAttribute('title', 'Ctrl+clic pour ouvrir le lien')
    }
  })

  doc.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block as HTMLElement)
    const lines = block.innerHTML.split('\n')
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    block.innerHTML = lines
      .map((line) => `<span class="code-line">${line || '\u200B'}</span>`)
      .join('\n')
  })

  enhanceTablesInDocument(doc, getTableDndId)

  return doc.body.innerHTML
}
