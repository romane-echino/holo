import { useCallback } from 'react'
import * as prettier from 'prettier/standalone'
import * as prettierPluginBabel from 'prettier/plugins/babel'
import * as prettierPluginEstree from 'prettier/plugins/estree'
import * as prettierPluginTypescript from 'prettier/plugins/typescript'
import * as prettierPluginPostcss from 'prettier/plugins/postcss'
import * as prettierPluginHtml from 'prettier/plugins/html'
import * as prettierPluginMarkdown from 'prettier/plugins/markdown'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type TurndownLike = {
  turndown: (input: string) => string
}

type UseCodeBlockFormatterParams = {
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
}

export function useCodeBlockFormatter({
  turndownService,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
}: UseCodeBlockFormatterParams) {
  const { wysiwygEditorRef } = useEditorOverlay()

  const formatCodeBlock = useCallback(
    async (codeEl: HTMLElement) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const currentLang =
        Array.from(codeEl.classList)
          .find((className) => className.startsWith('language-'))
          ?.replace('language-', '') ?? 'plaintext'

      const parserByLang: Record<string, 'babel' | 'typescript' | 'json' | 'css' | 'html' | 'markdown'> = {
        javascript: 'babel',
        typescript: 'typescript',
        json: 'json',
        css: 'css',
        html: 'html',
        markdown: 'markdown',
      }

      const parser = parserByLang[currentLang]

      if (!parser) {
        window.alert(`Formatage non disponible pour le langage: ${currentLang}`)
        return
      }

      const raw = (codeEl.textContent ?? '').replace(/\u200B/g, '')

      try {
        const formatted = await prettier.format(raw, {
          parser,
          plugins: [
            prettierPluginBabel,
            prettierPluginEstree,
            prettierPluginTypescript,
            prettierPluginPostcss,
            prettierPluginHtml,
            prettierPluginMarkdown,
          ],
          tabWidth: 2,
          printWidth: 100,
          semi: true,
          singleQuote: false,
        })

        codeEl.textContent = formatted.replace(/\n$/, '')

        const md = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(md)
        syncWysiwygFromMarkdown(md)
      } catch (error) {
        window.alert(`Échec du formatage: ${(error as Error).message}`)
      }
    },
    [syncWysiwygFromMarkdown, turndownService, updateActiveTabBody, wysiwygEditorRef],
  )

  return { formatCodeBlock }
}
