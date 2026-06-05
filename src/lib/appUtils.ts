import type { NodeType, TreeNode } from '../types/app'

const MARKDOWN_LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(?: |x|X)\]\s+)?/
const TEMPLATE_VARIABLE_RE = /\$[A-Z][A-Z0-9_]*/g

function isMarkdownListItemLine(line: string): boolean {
  return MARKDOWN_LIST_ITEM_PATTERN.test(line)
}

function getMarkdownListOutdentSize(line: string): number {
  if (line.startsWith('\t')) return 1
  if (line.startsWith('  ')) return 2
  if (line.startsWith(' ')) return 1
  return 0
}

export function applyMarkdownListTabBehavior(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  outdent: boolean,
): {
  handled: boolean
  nextText: string
  nextSelectionStart: number
  nextSelectionEnd: number
} {
  const safeStart = Math.max(0, Math.min(selectionStart, text.length))
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, text.length))
  const blockStart = text.lastIndexOf('\n', Math.max(0, safeStart - 1)) + 1
  const normalizedEnd = safeEnd > blockStart && text[safeEnd - 1] === '\n' ? safeEnd - 1 : safeEnd
  const nextLineBreakIndex = text.indexOf('\n', normalizedEnd)
  const blockEnd = nextLineBreakIndex === -1 ? text.length : nextLineBreakIndex
  const selectedBlock = text.slice(blockStart, blockEnd)
  const lines = selectedBlock.split('\n')
  const handledLines = lines.map((line) => isMarkdownListItemLine(line))

  if (!handledLines.some(Boolean)) {
    return {
      handled: false,
      nextText: text,
      nextSelectionStart: safeStart,
      nextSelectionEnd: safeEnd,
    }
  }

  const removals: number[] = []
  const nextLines = lines.map((line, index) => {
    if (!handledLines[index]) {
      removals[index] = 0
      return line
    }

    if (!outdent) {
      removals[index] = 0
      return `  ${line}`
    }

    const removal = getMarkdownListOutdentSize(line)
    removals[index] = removal
    return removal > 0 ? line.slice(removal) : line
  })

  const nextBlock = nextLines.join('\n')
  const nextText = `${text.slice(0, blockStart)}${nextBlock}${text.slice(blockEnd)}`
  const deltas = handledLines.map((handled, index) => {
    if (!handled) return 0
    return outdent ? -removals[index] : 2
  })

  const adjustBoundary = (boundary: number) => {
    const relative = boundary - blockStart
    let adjusted = relative
    let lineOffset = 0

    for (let index = 0; index < lines.length; index += 1) {
      if (handledLines[index] && relative >= lineOffset) {
        adjusted += deltas[index]
      }
      lineOffset += lines[index].length + 1
    }

    return Math.max(blockStart, Math.min(blockStart + adjusted, blockStart + nextBlock.length))
  }

  return {
    handled: true,
    nextText,
    nextSelectionStart: adjustBoundary(safeStart),
    nextSelectionEnd: adjustBoundary(safeEnd),
  }
}

export function extractTemplateVariables(content: string): string[] {
  const matches = content.match(TEMPLATE_VARIABLE_RE)
  return matches ? [...new Set(matches)] : []
}

export function applyTemplateVariables(content: string, vars: Record<string, string>): string {
  return content.replace(TEMPLATE_VARIABLE_RE, (match) => vars[match] ?? match)
}

export function normalizeVersionLabel(value: string): string {
  return value.trim().replace(/^v/i, '')
}

export function getParentPath(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index <= 0) {
    return targetPath
  }

  return normalized.slice(0, index)
}

export function getBaseName(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')

  if (index < 0) {
    return normalized
  }

  return normalized.slice(index + 1)
}

export function normalizeMarkdownFilename(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'untitled.md'

  if (/\.md$/i.test(trimmed)) {
    return trimmed.replace(/\.md$/i, '.md')
  }

  const lastSlashIndex = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  const lastDotIndex = trimmed.lastIndexOf('.')
  const hasExtension = lastDotIndex > lastSlashIndex

  if (!hasExtension) {
    return `${trimmed}.md`
  }

  return `${trimmed.slice(0, lastDotIndex)}.md`
}

export function getDirectoryTarget(rootPath: string | null, selectedPath: string | null, selectedType: NodeType | null) {
  if (!rootPath) {
    return null
  }

  if (!selectedPath || !selectedType) {
    return rootPath
  }

  if (selectedType === 'directory') {
    return selectedPath
  }

  return getParentPath(selectedPath)
}

export function isSameOrChildPath(parentPath: string, candidatePath: string): boolean {
  const normalizedParent = parentPath.replace(/\\/g, '/').replace(/\/$/, '')
  const normalizedCandidate = candidatePath.replace(/\\/g, '/').replace(/\/$/, '')

  return (
    normalizedCandidate === normalizedParent
    || normalizedCandidate.startsWith(`${normalizedParent}/`)
  )
}

export function getCommitTargetPath(rootPath: string | null, targetPath: string): string {
  const normalizedTarget = targetPath.replace(/\\/g, '/')

  if (!rootPath) {
    return normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`
  }

  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/$/, '')

  if (normalizedTarget === normalizedRoot) {
    return '/'
  }

  if (normalizedTarget.startsWith(`${normalizedRoot}/`)) {
    return normalizedTarget.slice(normalizedRoot.length)
  }

  return normalizedTarget.startsWith('/') ? normalizedTarget : `/${normalizedTarget}`
}

export function buildAutoCommitMessage(
  author: string,
  action: string,
  rootPath: string | null,
  targetPath: string,
  details?: string,
): string {
  const normalizedAuthor = (author.trim() || 'USER').replace(/\s+/g, '_').toUpperCase()
  const normalizedAction = action.trim().toUpperCase()
  const commitTargetPath = getCommitTargetPath(rootPath, targetPath)

  if (details && details.trim()) {
    return `${normalizedAuthor}::${normalizedAction}::${commitTargetPath} ${details.trim()}`
  }

  return `${normalizedAuthor}::${normalizedAction}::${commitTargetPath}`
}

export function getRepoConfigPath(rootPath: string): string {
  if (rootPath.endsWith('/') || rootPath.endsWith('\\')) {
    return `${rootPath}.holo.json`
  }

  const separator = rootPath.includes('\\') ? '\\' : '/'
  return `${rootPath}${separator}.holo.json`
}

export function getRepoRelativeFolderPath(rootPath: string, folderPath: string): string {
  const normalizedRoot = rootPath.replace(/[/\\]+$/, '')
  const normalizedFolder = folderPath.replace(/[/\\]+$/, '')
  if (normalizedFolder === normalizedRoot) {
    return '.'
  }
  const rel = getCommitTargetPath(rootPath, folderPath).replace(/^[/\\]/, '')
  return rel || '.'
}

export function resolveRepoRelativePath(rootPath: string, relPath: string): string {
  if (!relPath || relPath === '.') return rootPath
  const base = rootPath.replace(/[/\\]+$/, '')
  return base + '/' + relPath.replace(/\\/g, '/')
}

export function buildHoloFileLink(rootPath: string | null, filePath: string): string {
  if (!rootPath) {
    return ''
  }

  const repoName = getBaseName(rootPath)
  const repoRelativePath = getCommitTargetPath(rootPath, filePath).replace(/^\//, '')

  if (!repoName || !repoRelativePath) {
    return ''
  }

  const encodedRepoName = encodeURIComponent(repoName)
  const encodedPath = repoRelativePath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')

  return `holo://${encodedRepoName}/${encodedPath}`
}

export function buildShareableHoloLink(rootPath: string | null, filePath: string, gatewayBaseUrl: string): string {
  const holoLink = buildHoloFileLink(rootPath, filePath)

  if (!holoLink) {
    return ''
  }

  const base = gatewayBaseUrl.trim().replace(/\/+$/, '')

  if (!base) {
    return holoLink
  }

  try {
    const parsed = new URL(base)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return holoLink
    }
  } catch {
    return holoLink
  }

  return `${base}/open?h=${encodeURIComponent(holoLink)}`
}

export function getRelativeLinkPath(fromFilePath: string | null, targetFilePath: string, rootPath: string | null): string {
  if (!fromFilePath) {
    const repoRelative = getCommitTargetPath(rootPath, targetFilePath).replace(/^\//, '')
    return repoRelative || getBaseName(targetFilePath)
  }

  const fromDirParts = getParentPath(fromFilePath).replace(/\\/g, '/').split('/').filter(Boolean)
  const targetParts = targetFilePath.replace(/\\/g, '/').split('/').filter(Boolean)

  let commonIndex = 0
  while (
    commonIndex < fromDirParts.length
    && commonIndex < targetParts.length
    && fromDirParts[commonIndex] === targetParts[commonIndex]
  ) {
    commonIndex += 1
  }

  const upSegments = new Array(fromDirParts.length - commonIndex).fill('..')
  const downSegments = targetParts.slice(commonIndex)
  const relativePath = [...upSegments, ...downSegments].join('/')

  return relativePath || getBaseName(targetFilePath)
}

export function flatTreeFiles(node: TreeNode): string[] {
  if (node.type === 'file') return [node.path]
  return (node.children ?? []).flatMap(flatTreeFiles)
}