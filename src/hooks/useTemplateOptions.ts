import { useMemo } from 'react'
import { getBaseName } from '../lib/appUtils'
import type { FileMeta } from '../types/app'

export function useTemplateOptions(fileMetaByPath: Record<string, FileMeta>) {
  return useMemo(
    () => Object.entries(fileMetaByPath)
      .filter(([, meta]) => meta.isTemplate)
      .map(([path, meta]) => ({
        path,
        label: meta.title.trim() || getBaseName(path).replace(/\.md$/i, ''),
        description: meta.description.trim(),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })),
    [fileMetaByPath],
  )
}
