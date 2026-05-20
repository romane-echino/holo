import { useCallback } from 'react'
import { getEditableMarkdownHeader, splitMarkdownFrontMatter } from '../lib/markdown'

type OpenTabLike = {
  path: string
  name: string
  content: string
  isDirty: boolean
}

type UseExportPdfParams = {
  activeTab: OpenTabLike | null
  getHoloApi: () => Window['holo'] | null
  markdownToHtml: (markdown: string) => string
}

export function useExportPdf({ activeTab, getHoloApi, markdownToHtml }: UseExportPdfParams) {
  const exportActiveFileToPdf = useCallback(async () => {
    if (!activeTab) {
      window.alert('Aucun fichier actif à exporter.')
      return
    }

    const holo = getHoloApi()

    if (!holo) {
      return
    }

    try {
      const header = getEditableMarkdownHeader(activeTab.content)
      const title = (header.title.trim() || activeTab.name.replace(/\.md$/i, '') || 'Document').trim()
      const bodyHtml = markdownToHtml(splitMarkdownFrontMatter(activeTab.content).body)

      const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #1a1a1a; line-height: 1.55; }
    h1, h2, h3, h4 { margin: 1.2em 0 0.5em; line-height: 1.25; }
    p, ul, ol, blockquote, pre, table { margin: 0.55em 0; }
    code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    pre { background: #f4f4f5; padding: 10px 12px; border-radius: 6px; overflow-x: auto; }
    blockquote { border-left: 3px solid #8b5cf6; padding-left: 12px; color: #444; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d4d4d8; padding: 8px; text-align: left; vertical-align: top; }
    img { max-width: 100%; height: auto; }
    a { color: #5b46d9; text-decoration: underline; }
  </style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`

      const result = await holo.exportPdf({
        html,
        suggestedName: `${title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'document'}.pdf`,
      })

      if (!result.ok) {
        if (!result.canceled) {
          window.alert(result.error || 'Export PDF annulé.')
        }
        return
      }

      window.alert(`PDF exporté :\n${result.filePath}`)
    } catch (error) {
      window.alert((error as Error).message)
    }
  }, [activeTab, getHoloApi, markdownToHtml])

  return { exportActiveFileToPdf }
}
