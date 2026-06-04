import { getRelativeLinkPath } from './appUtils'

export function normalizeLinkedPath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  if (normalized === '/') return normalized
  return normalized.replace(/\/+$/, '') || '/'
}

function parseMarkdownDestinationInfo(rawDestination: string) {
  const trimmed = rawDestination.trim()
  const wrapped = trimmed.match(/^<([^>]+)>$/)
  if (wrapped) {
    return {
      destination: wrapped[1].trim(),
      token: wrapped[0],
    }
  }

  let destination = ''
  let token = ''
  for (let index = 0; index < rawDestination.length; index += 1) {
    const character = rawDestination[index]
    if (!character) break
    if (character === '"' || character === '\'') break
    if (/\s/.test(character)) break
    token += character
    destination += character
  }

  return { destination: destination.trim(), token: token.trim() }
}

export function resolveMarkdownTargetPath(destination: string, currentFilePath: string, rootPath?: string): string | null {
  const trimmed = destination.trim()
  if (!trimmed || trimmed.startsWith('#') || /^(https?:|mailto:|holo:)/i.test(trimmed)) return null

  const clean = trimmed.split('#')[0]?.split('?')[0]?.trim() ?? ''
  if (!clean) return null

  if (clean.startsWith('/')) {
    if (!rootPath) return null
    return normalizeLinkedPath(`${rootPath.replace(/\\/g, '/').replace(/\/$/, '')}/${clean.replace(/^\/+/, '')}`)
  }

  const currentParts = currentFilePath.replace(/\\/g, '/').split('/').slice(0, -1).filter(Boolean)
  const targetParts = clean.replace(/\\/g, '/').split('/').filter(Boolean)
  const resolvedParts = [...currentParts]

  for (const part of targetParts) {
    if (part === '.') continue
    if (part === '..') {
      resolvedParts.pop()
      continue
    }
    resolvedParts.push(part)
  }

  return normalizeLinkedPath(`${currentFilePath.startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`)
}

function formatMarkdownDestination(destination: string): string {
  return /\s/.test(destination) ? `<${destination}>` : destination
}

export function remapTrackedPath(pathValue: string, from: string, to: string): string {
  const normalizedPath = normalizeLinkedPath(pathValue)
  const normalizedFrom = normalizeLinkedPath(from)
  const normalizedTo = normalizeLinkedPath(to)

  if (normalizedPath === normalizedFrom) return normalizedTo
  if (normalizedPath.startsWith(`${normalizedFrom}/`)) return `${normalizedTo}${normalizedPath.slice(normalizedFrom.length)}`
  return normalizedPath
}

export function pathReferencesMovedTarget(pathValue: string, sourcePath: string): boolean {
  const normalizedPath = normalizeLinkedPath(pathValue)
  const normalizedSource = normalizeLinkedPath(sourcePath)
  return normalizedPath === normalizedSource || normalizedPath.startsWith(`${normalizedSource}/`)
}

export function extractMarkdownLinkedPaths(markdown: string, currentFilePath: string, rootPath?: string): string[] {
  const linkedPaths = new Set<string>()

  markdown.replace(/!?\[[^\]]*\]\(([^)]+)\)/g, (_fullMatch, rawDestination) => {
    const { destination } = parseMarkdownDestinationInfo(rawDestination)
    if (!destination) return _fullMatch
    const resolvedTarget = resolveMarkdownTargetPath(destination, currentFilePath, rootPath)
    if (resolvedTarget) linkedPaths.add(resolvedTarget)
    return _fullMatch
  })

  return Array.from(linkedPaths)
}

export function rewriteMarkdownLinksForMovedPath(markdown: string, currentFilePath: string, sourcePath: string, nextPath: string, rootPath?: string) {
  const normalizedSource = normalizeLinkedPath(sourcePath)
  const normalizedNext = normalizeLinkedPath(nextPath)
  let changed = false

  const nextMarkdown = markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (fullMatch, open, rawDestination, close) => {
    const { destination, token } = parseMarkdownDestinationInfo(rawDestination)
    if (!destination || !token) return fullMatch

    const resolvedTarget = resolveMarkdownTargetPath(destination, currentFilePath, rootPath)
    if (!resolvedTarget) return fullMatch
    if (resolvedTarget !== normalizedSource && !resolvedTarget.startsWith(`${normalizedSource}/`)) {
      return fullMatch
    }

    const remappedTarget = remapTrackedPath(resolvedTarget, normalizedSource, normalizedNext)
    const relativeDestination = getRelativeLinkPath(currentFilePath, remappedTarget, rootPath ?? null)
    const formatted = formatMarkdownDestination(relativeDestination)
    const nextRawDestination = rawDestination.replace(token, formatted)
    if (nextRawDestination === rawDestination) return fullMatch

    changed = true
    return `${open}${nextRawDestination}${close}`
  })

  return { markdown: nextMarkdown, changed }
}

export function rewriteMarkdownLinksForRelocatedSource(markdown: string, previousFilePath: string, nextFilePath: string, rootPath?: string) {
  let changed = false

  const nextMarkdown = markdown.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (fullMatch, open, rawDestination, close) => {
    const { destination, token } = parseMarkdownDestinationInfo(rawDestination)
    if (!destination || !token || destination.startsWith('/')) return fullMatch

    const resolvedTarget = resolveMarkdownTargetPath(destination, previousFilePath, rootPath)
    if (!resolvedTarget) return fullMatch

    const relativeDestination = getRelativeLinkPath(nextFilePath, resolvedTarget, rootPath ?? null)
    const formatted = formatMarkdownDestination(relativeDestination)
    const nextRawDestination = rawDestination.replace(token, formatted)
    if (nextRawDestination === rawDestination) return fullMatch

    changed = true
    return `${open}${nextRawDestination}${close}`
  })

  return { markdown: nextMarkdown, changed }
}