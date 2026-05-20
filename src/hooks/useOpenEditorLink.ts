import { useCallback } from 'react'
import { getParentPath, resolveRepoRelativePath } from '../lib/appUtils'

type UseOpenEditorLinkParams = {
  activeTabPath: string | null
  getHoloApi: () => Window['holo'] | null
  openFile: (filePath: string) => Promise<void>
  rootPath: string | null
}

export function useOpenEditorLink({
  activeTabPath,
  getHoloApi,
  openFile,
  rootPath,
}: UseOpenEditorLinkParams) {
  const openEditorLink = useCallback(
    async (href: string) => {
      const trimmedHref = href.trim()
      if (!trimmedHref) {
        return
      }

      const holo = getHoloApi()

      if (/^(https?:|mailto:|holo:)/i.test(trimmedHref)) {
        if (holo) {
          await holo.openExternalUrl(trimmedHref)
        }
        return
      }

      const cleanHref = trimmedHref.split('#')[0]?.split('?')[0]?.trim() ?? ''
      if (!cleanHref) {
        return
      }

      let targetPath: string | null = null

      if (cleanHref.startsWith('/')) {
        if (rootPath) {
          targetPath = resolveRepoRelativePath(rootPath, cleanHref.replace(/^\/+/, ''))
        }
      } else if (activeTabPath) {
        const normalizedBaseDir = getParentPath(activeTabPath).replace(/\\/g, '/')
        const baseParts = normalizedBaseDir.split('/').filter(Boolean)
        const hrefParts = cleanHref.replace(/\\/g, '/').split('/').filter(Boolean)
        const resolvedParts = [...baseParts]

        for (const part of hrefParts) {
          if (part === '.') {
            continue
          }

          if (part === '..') {
            if (resolvedParts.length > 0) {
              resolvedParts.pop()
            }
            continue
          }

          resolvedParts.push(part)
        }

        targetPath = `${activeTabPath.replace(/\\/g, '/').startsWith('/') ? '/' : ''}${resolvedParts.join('/')}`
      }

      if (targetPath?.toLowerCase().endsWith('.md')) {
        await openFile(targetPath)
        return
      }

      if (holo) {
        await holo.openExternalUrl(trimmedHref)
      }
    },
    [activeTabPath, getHoloApi, openFile, rootPath],
  )

  return { openEditorLink }
}
