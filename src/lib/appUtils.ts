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

/**
 * Transforme un nom saisi par l'utilisateur en nom de fichier Markdown.
 * Les points font partie du nom ("Echino.Bundle 09.2026.01" reste intact) :
 * on ajoute simplement `.md` si l'extension n'est pas déjà présente.
 */
export function normalizeMarkdownFilename(name: string): string {
  // Windows refuse les noms terminés par un point ou un espace
  const trimmed = name.trim().replace(/[.\s]+$/, '')
  if (!trimmed) return 'untitled.md'

  if (/\.md$/i.test(trimmed)) {
    return trimmed.replace(/\.md$/i, '.md')
  }

  return `${trimmed}.md`
}

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
// eslint-disable-next-line no-control-regex
const FORBIDDEN_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/

/**
 * Valide un nom de fichier / dossier pour qu'il soit utilisable sur
 * Windows, macOS et Linux (les dépôts sont partagés entre OS via git).
 * Retourne un message d'erreur lisible, ou null si le nom est valide.
 */
export function getEntryNameError(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Le nom ne peut pas être vide.'
  if (trimmed === '.' || trimmed === '..') return 'Ce nom est réservé.'
  const forbidden = trimmed.match(FORBIDDEN_NAME_CHARS)
  if (forbidden) {
    const char = forbidden[0]
    const label = char.charCodeAt(0) < 0x20 ? 'caractère de contrôle' : `« ${char} »`
    return `Le nom ne doit pas contenir ${label} (caractères interdits : < > : " / \\ | ? *).`
  }
  if (WINDOWS_RESERVED_NAMES.test(trimmed)) return `« ${trimmed} » est un nom réservé par Windows.`
  if (trimmed.length > 200) return 'Le nom est trop long (200 caractères maximum).'
  return null
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

export function buildHoloFileLink(rootPath: string | null, filePath: string, remoteUrl?: string | null): string {
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

  // L'URL du dépôt (sans identifiants) permet au destinataire de retrouver
  // l'espace même si son dossier porte un autre nom, ou de le cloner.
  const remoteQuery = remoteUrl ? `?remote=${encodeURIComponent(stripUrlCredentials(remoteUrl))}` : ''
  return `holo://${encodedRepoName}/${encodedPath}${remoteQuery}`
}

function stripUrlCredentials(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    parsed.username = ''
    parsed.password = ''
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return rawUrl
  }
}

export function buildShareableHoloLink(rootPath: string | null, filePath: string, gatewayBaseUrl: string, remoteUrl?: string | null): string {
  const holoLink = buildHoloFileLink(rootPath, filePath, remoteUrl)

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