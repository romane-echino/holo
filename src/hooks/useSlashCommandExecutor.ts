import { useCallback } from 'react'
import type { SlashCommand } from '../types/editor'
import { useConfig } from '../contexts/ConfigContext'
import { useUI } from '../contexts/UIContext'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

type TurndownLike = {
  turndown: (input: string) => string
}

export function useSlashCommandExecutor({
  getBlockTextBeforeCursor,
  deleteCurrentBlockContents,
  turndownService,
  updateActiveTabBody,
  getHoloApi,
  closeSlashMenu,
}: {
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
  deleteCurrentBlockContents: () => void
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
  getHoloApi: () => Window['holo'] | null
  closeSlashMenu: () => void
}) {
  const {
    repoImageStorageMode, azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey,
    s3Endpoint, s3PublicBaseUrl, dropboxAccessToken, dropboxFolderPath,
    gdriveAccessToken, gdriveFolderId,
  } = useConfig()
  const { setLinkDialog, setShowSettings } = useUI()
  const { wysiwygEditorRef, linkSavedRangeRef, aiSavedRangeRef, setAiDialog } = useEditorOverlay()
  const imageConfig = {
    mode: repoImageStorageMode,
    azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey,
    s3Endpoint, s3PublicBaseUrl, dropboxAccessToken, dropboxFolderPath,
    gdriveAccessToken, gdriveFolderId,
  }
  const executeSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const { block: targetBlock } = getBlockTextBeforeCursor()
      deleteCurrentBlockContents()

      const isProperBlock =
        targetBlock instanceof Element
        && ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE'].includes(targetBlock.tagName)

      if (isProperBlock && editor.contains(targetBlock)) {
        const sel = window.getSelection()
        const r = document.createRange()
        r.selectNodeContents(targetBlock)
        r.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(r)
      }

      const applyBlockFormat = (tag: string) => {
        if (isProperBlock) {
          document.execCommand('formatBlock', false, `<${tag}>`)
        } else {
          document.execCommand('insertHTML', false, `<${tag}><br></${tag}>`)
        }
      }

      switch (cmd.id) {
        case 'h1':
          applyBlockFormat('h1')
          break
        case 'h2':
          applyBlockFormat('h2')
          break
        case 'h3':
          applyBlockFormat('h3')
          break
        case 'h4':
          applyBlockFormat('h4')
          break
        case 'bullet':
          document.execCommand('insertUnorderedList')
          break
        case 'ordered':
          document.execCommand('insertOrderedList')
          break
        case 'quote':
          applyBlockFormat('blockquote')
          break
        case 'code': {
          const pre = document.createElement('pre')
          const code = document.createElement('code')
          code.className = 'language-plaintext'
          code.innerHTML = '\u200B'
          pre.appendChild(code)
          const pAfter = document.createElement('p')
          pAfter.innerHTML = '<br>'
          if (isProperBlock && editor.contains(targetBlock as Element)) {
            ;(targetBlock as Element).replaceWith(pre, pAfter)
          } else {
            editor.appendChild(pre)
            editor.appendChild(pAfter)
          }
          const sel2 = window.getSelection()
          const r2 = document.createRange()
          r2.selectNodeContents(code)
          r2.collapse(true)
          sel2?.removeAllRanges()
          sel2?.addRange(r2)
          const md = turndownService.turndown(editor.innerHTML)
          updateActiveTabBody(md)
          break
        }
        case 'table': {
          const html = '<table><thead><tr><th>Col A</th><th>Col B</th></tr></thead><tbody><tr><td>\u200B</td><td></td></tr><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table><p><br></p>'
          document.execCommand('insertHTML', false, html)
          setTimeout(() => {
            const firstCell = editor.querySelector('tbody td') as HTMLTableCellElement | null
            if (firstCell) {
              const sel = window.getSelection()
              const range = document.createRange()
              range.selectNodeContents(firstCell)
              range.collapse(true)
              sel?.removeAllRanges()
              sel?.addRange(range)
            }
          }, 0)
          break
        }
        case 'kanban': {
          const html = '<table><thead><tr><th>📝 À faire</th><th>🚧 En cours</th><th>✅ Terminé</th></tr></thead><tbody><tr><td>Ticket 1</td><td></td><td></td></tr><tr><td>Ticket 2</td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table><p><br></p>'
          document.execCommand('insertHTML', false, html)
          setTimeout(() => {
            const firstCell = editor.querySelector('tbody td') as HTMLTableCellElement | null
            if (firstCell) {
              const sel = window.getSelection()
              const range = document.createRange()
              range.selectNodeContents(firstCell)
              range.collapse(true)
              sel?.removeAllRanges()
              sel?.addRange(range)
            }
          }, 0)
          break
        }
        case 'todo': {
          const html = '<ul class="task-list"><li class="task-item"><input class="task-checkbox" type="checkbox"><span class="task-label">Tâche</span></li></ul><p><br></p>'
          document.execCommand('insertHTML', false, html)
          break
        }
        case 'separator': {
          document.execCommand('insertHTML', false, '<hr class="holo-hr"><p><br></p>')
          break
        }
        case 'link': {
          const sel = window.getSelection()
          const selectedText = sel?.toString() ?? ''
          linkSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
          closeSlashMenu()
          setLinkDialog({ text: selectedText, url: '', pageQuery: '' })
          return
        }
        case 'image': {
          closeSlashMenu()

          if (imageConfig.mode === 'azure' && (!imageConfig.azureBlobContainerUrl.trim() || !imageConfig.azureBlobSasToken.trim())) {
            window.alert('Configuration Azure incomplète (container URL + SAS token).')
            setShowSettings(true)
            return
          }

          if (
            imageConfig.mode === 's3'
            && (!imageConfig.s3Region.trim() || !imageConfig.s3Bucket.trim() || !imageConfig.s3AccessKeyId.trim() || !imageConfig.s3SecretAccessKey.trim())
          ) {
            window.alert('Configuration S3 incomplète (region, bucket, access key, secret key).')
            setShowSettings(true)
            return
          }

          if (imageConfig.mode === 'dropbox' && !imageConfig.dropboxAccessToken.trim()) {
            window.alert('Configuration Dropbox incomplète (access token).')
            setShowSettings(true)
            return
          }

          if (imageConfig.mode === 'gdrive' && !imageConfig.gdriveAccessToken.trim()) {
            window.alert('Configuration Google Drive incomplète (access token).')
            setShowSettings(true)
            return
          }

          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.onchange = async () => {
            const file = input.files?.[0]
            if (!file) return
            const holo = getHoloApi()
            if (!holo) return
            const reader = new FileReader()
            reader.onload = async (e) => {
              const dataUrl = e.target?.result as string
              if (!dataUrl) return
              const base64 = dataUrl.split(',')[1]
              if (!base64) return
              try {
                const result = await holo.saveImage(file.name, base64, {
                  mode: imageConfig.mode,
                  azure:
                    imageConfig.mode === 'azure'
                      ? {
                          containerUrl: imageConfig.azureBlobContainerUrl,
                          sasToken: imageConfig.azureBlobSasToken,
                        }
                      : undefined,
                  s3:
                    imageConfig.mode === 's3'
                      ? {
                          region: imageConfig.s3Region,
                          bucket: imageConfig.s3Bucket,
                          accessKeyId: imageConfig.s3AccessKeyId,
                          secretAccessKey: imageConfig.s3SecretAccessKey,
                          endpoint: imageConfig.s3Endpoint,
                          publicBaseUrl: imageConfig.s3PublicBaseUrl,
                        }
                      : undefined,
                  dropbox:
                    imageConfig.mode === 'dropbox'
                      ? {
                          accessToken: imageConfig.dropboxAccessToken,
                          folderPath: imageConfig.dropboxFolderPath,
                        }
                      : undefined,
                  gdrive:
                    imageConfig.mode === 'gdrive'
                      ? {
                          accessToken: imageConfig.gdriveAccessToken,
                          folderId: imageConfig.gdriveFolderId,
                        }
                      : undefined,
                })
                const ed = wysiwygEditorRef.current
                if (!ed) return
                ed.focus()
                const isExternal = /^https?:\/\//i.test(result.relativePath)
                const safePath = result.relativePath.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                const imageHtml = isExternal
                  ? `<img src="${safePath}" alt="${file.name}"><p><br></p>`
                  : `<img src="${dataUrl}" data-src="${safePath}" alt="${file.name}"><p><br></p>`
                document.execCommand('insertHTML', false, imageHtml)
                const md = turndownService.turndown(ed.innerHTML)
                updateActiveTabBody(md)
              } catch (err) {
                console.error('saveImage error', err)
                window.alert((err as Error).message)
              }
            }
            reader.readAsDataURL(file)
          }
          input.click()
          return
        }
        case 'ai': {
          closeSlashMenu()
          const sel = window.getSelection()
          aiSavedRangeRef.current = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null
          setAiDialog({ mode: 'generate', prompt: '', isLoading: false, selectedText: '' })
          return
        }
        default:
          break
      }

      closeSlashMenu()
      editor.focus()
      const md = turndownService.turndown(editor.innerHTML)
      updateActiveTabBody(md)
    },
    [
      aiSavedRangeRef,
      closeSlashMenu,
      deleteCurrentBlockContents,
      getBlockTextBeforeCursor,
      getHoloApi,
      imageConfig,
      linkSavedRangeRef,
      setAiDialog,
      setLinkDialog,
      setShowSettings,
      turndownService,
      updateActiveTabBody,
      wysiwygEditorRef,
    ],
  )

  return { executeSlashCommand }
}
