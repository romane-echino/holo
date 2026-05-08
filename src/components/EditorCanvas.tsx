import React from 'react'
import { EditorDocumentHeader } from './EditorDocumentHeader'
import type { EditorDocumentHeaderProps } from './EditorDocumentHeader'
import type { EditorMode } from '../types/editor'
import { htmlToMarkdown } from '../lib/markdown'

type EditorCanvasProps = {
  isCompactLayout: boolean
  effectiveEditorMode: EditorMode
  isEditorReadOnly: boolean
  activeTabBody: string
  rawEditorRef: React.RefObject<HTMLTextAreaElement | null>
  wysiwygEditorRef: React.RefObject<HTMLDivElement | null>
  onRawChange: (value: string) => void
  onRawKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>
  onRawDrop: React.DragEventHandler<HTMLTextAreaElement>
  onEditorDragEnter: React.DragEventHandler<HTMLElement>
  onEditorDragOver: React.DragEventHandler<HTMLElement>
  onEditorDragLeave: React.DragEventHandler<HTMLElement>
  onWysiwygInput: React.FormEventHandler<HTMLDivElement>
  onWysiwygKeyDown: React.KeyboardEventHandler<HTMLDivElement>
  onWysiwygDrop: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragStart: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragEnd: React.DragEventHandler<HTMLDivElement>
  onWysiwygDragOver: React.DragEventHandler<HTMLDivElement>
  openEditorLink: (href: string) => Promise<void>
  updateActiveTabBody: (nextBody: string) => void
  syncWysiwygFromMarkdown: (markdown: string) => void
  markdownToHtml: (markdown: string) => string
  refreshTableSummaries: () => void
  setColumnTypePopup: React.Dispatch<React.SetStateAction<{ x: number; y: number; thEl: HTMLElement } | null>>
  isImageDragOverEditor: boolean
  remoteEditBlock: { isBlocked: boolean; message: string }
  onPullNow: () => void
  codeBlockLeaveTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>
  setHoveredCodeBlock: React.Dispatch<React.SetStateAction<{ x: number; y: number; codeEl: HTMLElement } | null>>
  documentHeaderProps: EditorDocumentHeaderProps
}

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  isCompactLayout,
  effectiveEditorMode,
  isEditorReadOnly,
  activeTabBody,
  rawEditorRef,
  wysiwygEditorRef,
  onRawChange,
  onRawKeyDown,
  onRawDrop,
  onEditorDragEnter,
  onEditorDragOver,
  onEditorDragLeave,
  onWysiwygInput,
  onWysiwygKeyDown,
  onWysiwygDrop,
  onWysiwygDragStart,
  onWysiwygDragEnd,
  onWysiwygDragOver,
  openEditorLink,
  updateActiveTabBody,
  syncWysiwygFromMarkdown,
  markdownToHtml,
  refreshTableSummaries,
  setColumnTypePopup,
  isImageDragOverEditor,
  remoteEditBlock,
  onPullNow,
  codeBlockLeaveTimerRef,
  setHoveredCodeBlock,
  documentHeaderProps,
}) => {
  return (
    <div
      className="flex-1 min-h-0 overflow-auto"
      onMouseMove={(e) => {
        if (codeBlockLeaveTimerRef.current) {
          clearTimeout(codeBlockLeaveTimerRef.current)
          codeBlockLeaveTimerRef.current = null
        }
        const pre = (e.target as HTMLElement).closest?.('pre')
        if (pre) {
          const codeEl = pre.querySelector('code') as HTMLElement | null
          if (codeEl) {
            const rect = pre.getBoundingClientRect()
            setHoveredCodeBlock((prev) =>
              prev?.codeEl === codeEl ? prev : { x: rect.right, y: rect.top, codeEl }
            )
          }
        } else {
          setHoveredCodeBlock(null)
        }
      }}
      onMouseLeave={() => {
        codeBlockLeaveTimerRef.current = setTimeout(() => setHoveredCodeBlock(null), 200)
      }}
    >
      <div className="flex min-h-full">
        <div className={`flex-1 min-w-0 ${isCompactLayout ? 'px-4 pt-6 pb-24 sm:px-6' : 'px-10 pt-12 pb-40 xl:px-14'}`}>
          <div className={`mx-auto ${isCompactLayout ? 'max-w-full' : 'max-w-272'}`}>
            <EditorDocumentHeader {...documentHeaderProps} />

            <div className="relative">
              {effectiveEditorMode === 'raw' ? (
                <textarea
                  ref={rawEditorRef}
                  className="w-full min-h-[400px] resize-none bg-transparent font-mono text-sm leading-7 text-white/85 outline-none placeholder:text-white/25 select-text"
                  value={activeTabBody}
                  readOnly={isEditorReadOnly}
                  onChange={(event) => onRawChange(event.target.value)}
                  onKeyDown={onRawKeyDown}
                  onDrop={onRawDrop}
                  onDragEnter={onEditorDragEnter}
                  onDragOver={onEditorDragOver}
                  onDragLeave={onEditorDragLeave}
                  placeholder="Édite ton fichier ici…"
                />
              ) : (
                <>
                  <div
                    ref={wysiwygEditorRef}
                    className="wysiwyg-editor min-h-[400px] select-text text-sm text-white/90 outline-none [&_h1]:text-4xl [&_h1]:font-bold [&_h1]:mt-10 [&_h1]:mb-4 [&_h1]:text-white [&_h1]:tracking-tight [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-white [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-white [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-white/60 [&_h4]:uppercase [&_h4]:tracking-widest [&_p]:my-3 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1.5 [&_ul.task-list]:list-none [&_ul.task-list]:pl-0 [&_ul.task-list_li]:list-none [&_li.task-item]:flex [&_li.task-item]:items-start [&_li.task-item]:gap-2 [&_li.task-item]:my-1 [&_.task-label]:flex-1 [&_.task-label]:min-w-0 [&_.task-label]:outline-none [&_.task-label]:transition-all [&_.task-label]:duration-150 [&_.task-item-checked_.task-label]:text-white/40 [&_.task-item-checked_.task-label]:line-through [&_input.task-checkbox]:mt-1 [&_input.task-checkbox]:w-4 [&_input.task-checkbox]:h-4 [&_input.task-checkbox]:shrink-0 [&_input.task-checkbox]:cursor-pointer [&_input.task-checkbox]:appearance-none [&_input.task-checkbox]:rounded-full [&_input.task-checkbox]:border [&_input.task-checkbox]:border-white/35 [&_input.task-checkbox]:bg-transparent [&_input.task-checkbox]:shadow-[0_0_0_0_rgba(123,97,255,0.0)] [&_input.task-checkbox]:transition-all [&_input.task-checkbox]:duration-150 [&_input.task-checkbox:checked]:bg-[#7B61FF] [&_input.task-checkbox:checked]:border-[#7B61FF] [&_input.task-checkbox:checked]:shadow-[0_0_0_3px_rgba(123,97,255,0.15)] [&_a]:text-[#9d8bff] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[#7B61FF]/50 [&_blockquote]:pl-4 [&_blockquote]:text-white/60 [&_blockquote]:my-2 [&_pre]:my-2 [&_pre]:font-mono [&_code]:text-[#9d8bff] [&_table]:table-fixed [&_table]:border-collapse [&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_table]:rounded-lg [&_table]:border [&_table]:border-white/10 [&_tbody_tr:hover]:bg-white/5 [&_th]:border-b [&_th]:border-white/15 [&_th]:p-4 [&_th]:bg-gradient-to-r [&_th]:from-[#7B61FF]/15 [&_th]:to-[#9d8bff]/10 [&_th]:text-white [&_th]:font-semibold [&_th]:text-left [&_th]:whitespace-normal [&_th]:break-words [&_th[data-table-drag-type='column']]:cursor-grab [&_td]:border-b [&_td]:border-white/10 [&_td]:p-4 [&_td]:break-words [&_tr]:transition-colors [&_.table-drag-source]:bg-[#7B61FF]/18 [&_.table-drag-source]:ring-1 [&_.table-drag-source]:ring-[#9d8bff]/40 [&_.table-drag-target]:bg-[#7B61FF]/12 [&_.table-drag-target]:ring-1 [&_.table-drag-target]:ring-[#9d8bff]/30 [&_.table-row-index-badge]:mr-2 [&_.table-row-index-badge]:inline-flex [&_.table-row-index-badge]:h-4 [&_.table-row-index-badge]:min-w-4 [&_.table-row-index-badge]:items-center [&_.table-row-index-badge]:justify-center [&_.table-row-index-badge]:rounded [&_.table-row-index-badge]:bg-white/10 [&_.table-row-index-badge]:px-1 [&_.table-row-index-badge]:text-[10px] [&_.table-row-index-badge]:text-white/45 [&_.table-row-index-badge]:font-medium [&_.table-row-index-badge]:cursor-grab [&_.table-scroll-wrapper]:overflow-x-auto [&_.table-scroll-wrapper]:rounded-lg [&_.table-scroll-wrapper]:border [&_.table-scroll-wrapper]:border-white/10 [&_.table-add-row-btn]:block [&_.table-add-row-btn]:w-full [&_.table-add-row-btn]:cursor-pointer [&_.table-add-row-btn]:rounded-b-lg [&_.table-add-row-btn]:border [&_.table-add-row-btn]:border-t-0 [&_.table-add-row-btn]:border-white/10 [&_.table-add-row-btn]:py-1.5 [&_.table-add-row-btn]:text-center [&_.table-add-row-btn]:text-[11px] [&_.table-add-row-btn]:text-white/35 [&_.table-add-row-btn:hover]:bg-white/5 [&_.table-add-row-btn:hover]:text-white/60 [&_img]:max-w-full [&_img]:rounded [&_img]:my-2 [&_hr]:my-10 [&_hr]:border-none [&_hr]:h-px [&_hr]:bg-white/30 empty:before:content-['Écris_ici,_ou_tape_/_pour_les_commandes…'] empty:before:text-white/25 empty:before:pointer-events-none"
                    contentEditable={!isEditorReadOnly}
                    suppressContentEditableWarning
                    spellCheck
                    onInput={onWysiwygInput}
                    onKeyDown={onWysiwygKeyDown}
                    onPaste={(e) => {
                      e.preventDefault()
                      const text = e.clipboardData?.getData('text/plain') ?? ''
                      const sanitized = text.replace(/<[^>]*>/g, '')

                      const anchorEl = window.getSelection()?.anchorNode
                      const anchorElement = anchorEl instanceof Element ? anchorEl : anchorEl?.parentElement
                      const pre = anchorElement?.closest('pre')
                      const editorEl = wysiwygEditorRef.current
                      if (pre && editorEl?.contains(pre)) {
                        document.execCommand('insertText', false, sanitized)
                        const md = htmlToMarkdown(editorEl.innerHTML)
                        updateActiveTabBody(md)
                        setTimeout(() => syncWysiwygFromMarkdown(md), 0)
                        return
                      }

                      const isMarkdown = /^#{1,6}\s|^\*\*|^__|\*[^*]|^[-*+]\s|\d+\.\s|^>\s|^```|\[.+\]\(.+\)/.test(sanitized)
                      if (isMarkdown) {
                        const html = markdownToHtml(sanitized)
                        document.execCommand('insertHTML', false, html)
                        const editor = wysiwygEditorRef.current
                        if (editor) {
                          const md = htmlToMarkdown(editor.innerHTML)
                          updateActiveTabBody(md)
                        }
                      } else {
                        document.execCommand('insertText', false, sanitized)
                      }
                    }}
                    onDrop={onWysiwygDrop}
                    onDragStart={onWysiwygDragStart}
                    onDragEnd={onWysiwygDragEnd}
                    onDragEnter={onEditorDragEnter}
                    onDragOver={onWysiwygDragOver}
                    onDragLeave={onEditorDragLeave}
                    onClick={(e) => {
                      const linkEl = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
                      if (linkEl) {
                        const href = linkEl.getAttribute('href')?.trim()
                        if (href && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault()
                          e.stopPropagation()
                          void openEditorLink(href)
                        }
                        return
                      }

                      if ((e.target as HTMLElement).classList.contains('table-add-row-btn')) {
                        e.preventDefault()
                        const btn = e.target as HTMLElement
                        const wrapper = btn.previousElementSibling as HTMLElement | null
                        const table = wrapper?.querySelector('table') as HTMLTableElement | null
                        if (table) {
                          const tbody = table.querySelector('tbody')
                          if (tbody) {
                            const lastRow = tbody.lastElementChild as HTMLTableRowElement | null
                            const columnCount = lastRow ? lastRow.cells.length : 1
                            const newRow = document.createElement('tr')
                            for (let i = 0; i < columnCount; i++) {
                              const td = document.createElement('td')
                              td.innerHTML = i === 0 ? '\u200B' : ''
                              newRow.appendChild(td)
                            }
                            tbody.appendChild(newRow)
                            const firstCell = newRow.cells[0]
                            if (firstCell) {
                              const range = document.createRange()
                              range.selectNodeContents(firstCell)
                              range.collapse(true)
                              window.getSelection()?.removeAllRanges()
                              window.getSelection()?.addRange(range)
                              firstCell.focus()
                            }
                            const editor = wysiwygEditorRef.current
                            if (editor) {
                              refreshTableSummaries()
                              const md = htmlToMarkdown(editor.innerHTML)
                              updateActiveTabBody(md)
                            }
                          }
                        }
                        return
                      }

                      const target = e.target as HTMLInputElement
                      if (target.type === 'checkbox') {
                        const taskItem = target.closest('.task-item')
                        if (taskItem) {
                          taskItem?.classList.toggle('task-item-checked', target.checked)
                          if (target.checked) {
                            target.setAttribute('checked', '')
                          } else {
                            target.removeAttribute('checked')
                          }
                          setTimeout(() => {
                            const editor = wysiwygEditorRef.current
                            if (editor) {
                              const markdown = htmlToMarkdown(editor.innerHTML)
                              updateActiveTabBody(markdown)
                            }
                          }, 0)
                        }
                        const colCell = target.closest('.col-checkbox-cell') as HTMLElement | null
                        if (colCell) {
                          colCell.dataset.checked = String(target.checked)
                          if (target.checked) target.setAttribute('checked', '')
                          else target.removeAttribute('checked')
                          setTimeout(() => {
                            const editor = wysiwygEditorRef.current
                            if (editor) {
                              const markdown = htmlToMarkdown(editor.innerHTML)
                              updateActiveTabBody(markdown)
                            }
                          }, 0)
                        }
                      }
                      const thEl = (e.target as HTMLElement).closest('th') as HTMLElement | null
                      if (thEl) {
                        const rect = thEl.getBoundingClientRect()
                        setColumnTypePopup({ x: rect.left, y: rect.bottom + 4, thEl })
                      } else {
                        setColumnTypePopup(null)
                      }
                    }}
                  />
                  <div className="mt-5 text-right text-[9px] text-white/15 pointer-events-none select-none">
                    <kbd>/</kbd> commandes · <kbd>#</kbd> titre · <kbd>-</kbd> liste · glisse une image
                  </div>
                  {remoteEditBlock.isBlocked && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md border border-amber-400/40 bg-[#111213]/85 px-4">
                      <div className="max-w-md rounded-lg border border-white/10 bg-[#1a1b1c] p-4 text-center">
                        <p className="text-sm text-amber-200">{remoteEditBlock.message}</p>
                        <button
                          className="mt-3 rounded-md bg-[#7B61FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6950f0]"
                          onClick={onPullNow}
                        >
                          Pull maintenant
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {isImageDragOverEditor && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border border-dashed border-[#7B61FF]/70 bg-[#111213]/75 px-4 text-sm font-medium text-white/90">
                  Déposez une image pour l’insérer
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
