/**
 * CodeBlock.tsx — Bloc de code éditable
 *
 * Design Holo :
 * - bloc intégré au document, moins "IDE lourd"
 * - header compact avec langage + actions
 * - fond calme, bordure douce, focus premium
 * - CodeMirror transparent + typographie mono cohérente
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import CodeMirror, { EditorView, keymap, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark'
import { EditorState, type Extension } from '@codemirror/state'
import { StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { rust } from '@codemirror/lang-rust'
import { java } from '@codemirror/lang-java'
import { go } from '@codemirror/lang-go'
import { cpp } from '@codemirror/lang-cpp'
import { Braces, Check, ChevronDown, Copy, Terminal } from 'lucide-react'
import { cn } from '../../../utils/global'
import type { CodeNode } from '../lib/types'
import type { InlineEditorHandle, InitialCursor } from '../InlineEditor'

interface CodeBlockProps {
  node: CodeNode
  onChange: (node: CodeNode) => void
  onEnterAtEnd?: () => void
  onBackspaceAtStart?: () => void
}

const LANGUAGES = [
  'plaintext',
  'javascript',
  'typescript',
  'python',
  'sql',
  'bash',
  'html',
  'css',
  'json',
  'markdown',
  'rust',
  'java',
  'go',
  'csharp',
  'cpp',
] as const

const LANGUAGE_LABELS: Record<string, string> = {
  plaintext: 'Plain text',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  sql: 'SQL',
  bash: 'Bash',
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  markdown: 'Markdown',
  rust: 'Rust',
  java: 'Java',
  go: 'Go',
  csharp: 'C#',
  cpp: 'C++',
}

const CODE_BLOCK_THEME = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent !important',
    },
    '.cm-editor': {
      backgroundColor: 'transparent !important',
      color: 'var(--color-holo-text-soft)',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      fontSize: '0.875rem',
      lineHeight: '1.55rem',
      minHeight: '100%',
    },
    '.cm-editor.cm-focused': {
      outline: 'none',
    },
    '.cm-scroller': {
      backgroundColor: 'transparent !important',
      overflow: 'auto',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
      lineHeight: '1.55rem',
      minHeight: '112px',
    },
    '.cm-content': {
      minHeight: '112px',
      padding: '16px 0',
      caretColor: 'var(--color-holo-text)',
      fontSize: '0.875rem',
      lineHeight: '1.55rem',
      fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    },
    '.cm-line': {
      minHeight: '24px',
      padding: '0 18px',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      borderRight: '1px solid var(--color-holo-border-soft)',
      color: 'var(--color-holo-text-faint)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 10px 0 14px',
      minWidth: '34px',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255,255,255,0.024)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255,255,255,0.024)',
      color: 'var(--color-holo-text-muted)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(123, 97, 255, 0.28) !important',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--color-holo-text)',
    },
    '.cm-selectionLayer .cm-selectionBackground': {
      borderRadius: '6px',
    },
    '.cm-placeholder': {
      color: 'var(--color-holo-text-faint)',
      paddingLeft: '18px',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--color-holo-bg)',
      border: '1px solid var(--color-holo-border-soft)',
      borderRadius: '12px',
      boxShadow: '0 18px 70px rgba(0,0,0,.42)',
    },
  },
  { dark: true },
)

function getLanguageExtensions(language: string): Extension[] {
  switch (language) {
    case 'javascript':
    case 'typescript':
      return [javascript({ typescript: language === 'typescript' })]
    case 'python':
      return [python()]
    case 'sql':
      return [sql()]
    case 'bash':
      return [StreamLanguage.define(shell)]
    case 'html':
      return [html()]
    case 'css':
      return [css()]
    case 'json':
      return [json()]
    case 'markdown':
      return [markdown()]
    case 'rust':
      return [rust()]
    case 'java':
      return [java()]
    case 'go':
      return [go()]
    case 'cpp':
    case 'csharp':
      return [cpp()]
    default:
      return []
  }
}

function normalizeLanguage(language?: string | null) {
  if (!language) return 'plaintext'
  const lower = language.toLowerCase()

  if (lower === 'js') return 'javascript'
  if (lower === 'ts') return 'typescript'
  if (lower === 'py') return 'python'
  if (lower === 'sh' || lower === 'shell') return 'bash'
  if (lower === 'md') return 'markdown'
  if (lower === 'c++') return 'cpp'
  if (lower === 'cs') return 'csharp'

  return LANGUAGES.includes(lower as (typeof LANGUAGES)[number]) ? lower : 'plaintext'
}

function getCodeValue(node: CodeNode) {
  return node.value ?? ''
}

function getCodeLanguage(node: CodeNode) {
  return normalizeLanguage(node.lang)
}

export const CodeBlock = forwardRef<InlineEditorHandle, CodeBlockProps>(
  function CodeBlock({ node, onChange, onEnterAtEnd, onBackspaceAtStart }, ref) {
    const editorRef = useRef<ReactCodeMirrorRef>(null)
    const [copied, setCopied] = useState(false)
    const [languageOpen, setLanguageOpen] = useState(false)
    const [focused, setFocused] = useState(false)

    const value = getCodeValue(node)
    const language = getCodeLanguage(node)

    const extensions = useMemo(() => {
      return [
        CODE_BLOCK_THEME,
        syntaxHighlighting(oneDarkHighlightStyle),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onEnterAtEnd?.()
              return true
            },
          },
          {
            key: 'Escape',
            run: (view) => {
              view.contentDOM.blur()
              return true
            },
          },
          {
            key: 'Backspace',
            run: (view) => {
              const docIsEmpty = view.state.doc.length === 0
              const selectionAtStart = view.state.selection.main.from === 0 && view.state.selection.main.to === 0

              if (docIsEmpty && selectionAtStart) {
                onBackspaceAtStart?.()
                return true
              }

              return false
            },
          },
        ]),
        ...getLanguageExtensions(language),
      ]
    }, [language, onBackspaceAtStart, onEnterAtEnd])

    useImperativeHandle(ref, () => ({
      focus(cursor?: InitialCursor) {
        const view = editorRef.current?.view
        if (!view) return

        view.focus()

        if (cursor?.type === 'arrow' && cursor.edge === 'bottom') {
          const end = view.state.doc.length
          view.dispatch({ selection: { anchor: end } })
          return
        }

        view.dispatch({ selection: { anchor: 0 } })
      },
      clear() {
        const view = editorRef.current?.view
        if (!view) return

        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '' },
        })
      },
      clearSlash() {
        return []
      },
      flush() {
        commitValue(editorRef.current?.view?.state.doc.toString() ?? value)
      },
      getContent() {
        return []
      },
    }))

    useEffect(() => {
      if (!languageOpen) return

      const handlePointerDown = (event: MouseEvent) => {
        const target = event.target as HTMLElement
        if (!target.closest('[data-code-language-menu]')) {
          setLanguageOpen(false)
        }
      }

      document.addEventListener('mousedown', handlePointerDown)
      return () => document.removeEventListener('mousedown', handlePointerDown)
    }, [languageOpen])

    const commitValue = useCallback(
      (nextValue: string) => {
        onChange({
          ...node,
          value: nextValue,
          lang: language === 'plaintext' ? null : language,
        })
      },
      [language, node, onChange],
    )

    const changeLanguage = (nextLanguage: string) => {
      const normalized = normalizeLanguage(nextLanguage)
      setLanguageOpen(false)

      onChange({
        ...node,
        lang: normalized === 'plaintext' ? null : normalized,
      })

      requestAnimationFrame(() => editorRef.current?.view?.focus())
    }

    const copyCode = async () => {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1300)
    }

    return (
      <div
        className={cn(
          'group/code relative my-6 overflow-hidden rounded-holo-2xl border bg-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,.025)] transition',
          focused
            ? 'border-holo-primary/28 shadow-[0_14px_48px_rgba(0,0,0,.18),0_0_0_4px_rgba(123,97,255,.055),inset_0_1px_0_rgba(255,255,255,.035)]'
            : 'border-holo-border-soft hover:border-holo-primary/16 hover:bg-white/[0.024]',
        )}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />

        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-holo-border-soft/80 bg-white/[0.022] px-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-holo-md bg-holo-primary-surface text-holo-primary-soft">
              {language === 'bash' ? <Terminal size={14} /> : <Braces size={14} />}
            </div>

            <div data-code-language-menu className="relative">
              <button
                type="button"
                onClick={() => setLanguageOpen((open) => !open)}
                className="inline-flex max-w-[13rem] items-center gap-1.5 rounded-holo-md px-2 py-1.5 text-xs font-medium text-holo-text-muted transition hover:bg-holo-glass-hover hover:text-holo-text"
              >
                <span className="truncate">{LANGUAGE_LABELS[language] ?? language}</span>
                <ChevronDown size={12} className={cn('transition', languageOpen && 'rotate-180')} />
              </button>

              {languageOpen && (
                <div className="absolute left-0 top-9 z-40 max-h-72 w-48 overflow-y-auto rounded-holo-xl border border-holo-border-soft bg-holo-bg/95 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.42)] backdrop-blur-2xl">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-holo-text-faint">
                    Langage
                  </div>

                  {LANGUAGES.map((item) => {
                    const active = language === item

                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => changeLanguage(item)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-holo-md px-2.5 py-2 text-left text-sm transition',
                          active
                            ? 'bg-holo-primary-surface text-holo-primary-soft'
                            : 'text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
                        )}
                      >
                        <span>{LANGUAGE_LABELS[item] ?? item}</span>
                        {active && <Check size={13} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={copyCode}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-holo-md px-2.5 py-1.5 text-xs transition active:scale-[0.98]',
              copied
                ? 'bg-holo-primary-surface text-holo-primary-soft'
                : 'text-holo-text-faint hover:bg-holo-glass-hover hover:text-holo-text',
            )}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copié' : 'Copier'}
          </button>
        </header>

        <div className="relative">
          <CodeMirror
            ref={editorRef}
            value={value}
            height="auto"
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              highlightActiveLine: true,
              highlightActiveLineGutter: true,
              bracketMatching: true,
              autocompletion: true,
              closeBrackets: true,
              searchKeymap: true,
              lintKeymap: true,
            }}
            extensions={extensions}
            onChange={(nextValue) => {
              onChange({
                ...node,
                value: nextValue,
                lang: language === 'plaintext' ? null : language,
              })
            }}
            onBlur={() => {
              setFocused(false)
              commitValue(editorRef.current?.view?.state.doc.toString() ?? value)
            }}
            onFocus={() => setFocused(true)}
            placeholder="Écris ton code ici…"
          />
        </div>
      </div>
    )
  },
)
