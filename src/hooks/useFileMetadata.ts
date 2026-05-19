import { useEffect } from 'react'
import { getEditableMarkdownHeader } from '../lib/markdown'
import { flatTreeFiles } from '../lib/appUtils'
import type { FileMeta, TreeNode } from '../types/app'

type UseFileMetadataParams = {
  tree: TreeNode | null
  activeTabPath: string | null
  activeTabContent: string | undefined
  setFileIconByPath: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setFileMetaByPath: React.Dispatch<React.SetStateAction<Record<string, FileMeta>>>
}

export function useFileMetadata({
  tree,
  activeTabPath,
  activeTabContent,
  setFileIconByPath,
  setFileMetaByPath,
}: UseFileMetadataParams) {
  useEffect(() => {
    const filePaths = tree ? flatTreeFiles(tree) : []

    if (filePaths.length === 0) {
      setFileIconByPath({})
      setFileMetaByPath({})
      return
    }

    if (!window.holo) {
      return
    }

    let cancelled = false

    const loadFileMetadata = async () => {
      const pairs = await Promise.all(
        filePaths.map(async (filePath) => {
          try {
            const content = await window.holo!.readFile(filePath)
            const header = getEditableMarkdownHeader(content)
            return {
              filePath,
              icon: header.icon.trim(),
              title: header.title.trim(),
              description: header.description.trim(),
              isTemplate: header.isTemplate,
            }
          } catch {
            return {
              filePath,
              icon: '',
              title: '',
              description: '',
              isTemplate: false,
            }
          }
        }),
      )

      if (cancelled) {
        return
      }

      const nextIcons: Record<string, string> = {}
      const nextMeta: Record<string, FileMeta> = {}
      for (const entry of pairs) {
        if (entry.icon) {
          nextIcons[entry.filePath] = entry.icon
        }

        if (entry.title || entry.description || entry.isTemplate) {
          nextMeta[entry.filePath] = {
            title: entry.title,
            description: entry.description,
            isTemplate: entry.isTemplate,
          }
        }
      }

      setFileIconByPath(nextIcons)
      setFileMetaByPath(nextMeta)
    }

    void loadFileMetadata()

    return () => {
      cancelled = true
    }
  }, [tree, setFileIconByPath, setFileMetaByPath])

  useEffect(() => {
    if (!activeTabPath || !activeTabContent) {
      return
    }

    const icon = getEditableMarkdownHeader(activeTabContent).icon.trim()

    setFileIconByPath((previous) => {
      if (!icon && !(activeTabPath in previous)) {
        return previous
      }

      const next = { ...previous }

      if (icon) {
        next[activeTabPath] = icon
      } else {
        delete next[activeTabPath]
      }

      return next
    })

    setFileMetaByPath((previous) => {
      const title = getEditableMarkdownHeader(activeTabContent).title.trim()
      const description = getEditableMarkdownHeader(activeTabContent).description.trim()
      const isTemplate = getEditableMarkdownHeader(activeTabContent).isTemplate

      if (!title && !description && !isTemplate && !(activeTabPath in previous)) {
        return previous
      }

      const next = { ...previous }

      if (title || description || isTemplate) {
        next[activeTabPath] = {
          title,
          description,
          isTemplate,
        }
      } else {
        delete next[activeTabPath]
      }

      return next
    })
  }, [activeTabPath, activeTabContent, setFileIconByPath, setFileMetaByPath])
}
