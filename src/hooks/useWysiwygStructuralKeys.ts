import { useCallback, type KeyboardEvent } from 'react'

type TurndownLike = {
  turndown: (input: string) => string
}

type UseWysiwygStructuralKeysParams = {
  deleteCurrentBlockContents: () => void
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
}

export function useWysiwygStructuralKeys({
  deleteCurrentBlockContents,
  getBlockTextBeforeCursor,
  turndownService,
  updateActiveTabBody,
}: UseWysiwygStructuralKeysParams) {
  const handleWysiwygStructuralKeys = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, editor: HTMLDivElement): boolean => {
      const syncMarkdown = () => {
        const markdown = turndownService.turndown(editor.innerHTML)
        updateActiveTabBody(markdown)
      }

      if (event.key === 'Enter') {
        const selection = window.getSelection()
        const anchor = selection?.anchorNode ?? null

        const anchorElement = anchor instanceof Element ? anchor : anchor?.parentElement
        const pre = editor.contains(anchorElement ?? null) ? anchorElement?.closest('pre') ?? null : null
        if (pre) {
          event.preventDefault()
          if (event.shiftKey) {
            document.execCommand('insertText', false, '\n')
          } else {
            const paragraph = document.createElement('p')
            paragraph.innerHTML = '<br>'
            pre.parentNode?.insertBefore(paragraph, pre.nextSibling)
            const range = document.createRange()
            range.selectNodeContents(paragraph)
            range.collapse(true)
            selection?.removeAllRanges()
            selection?.addRange(range)
            syncMarkdown()
          }
          return true
        }

        const blockquote =
          anchor instanceof Element ? anchor.closest('blockquote') : anchor?.parentElement?.closest('blockquote')
        if (blockquote) {
          event.preventDefault()
          const paragraph = document.createElement('p')
          paragraph.innerHTML = '<br>'
          blockquote.parentNode?.insertBefore(paragraph, blockquote.nextSibling)
          const range = document.createRange()
          range.selectNodeContents(paragraph)
          range.collapse(true)
          selection?.removeAllRanges()
          selection?.addRange(range)
          syncMarkdown()
          return true
        }

        const currentListItem = anchor instanceof Element ? anchor.closest('li') : anchor?.parentElement?.closest('li')
        const currentCheckbox = currentListItem?.querySelector('input[type="checkbox"]')

        if (currentListItem && currentCheckbox) {
          event.preventDefault()

          if (event.shiftKey) {
            document.execCommand('insertLineBreak')
            syncMarkdown()
            return true
          }

          const currentList = currentListItem.parentElement
          const currentLabel = currentListItem.querySelector('.task-label')
          const currentText = currentLabel?.textContent?.replace(/\u200B/g, '').trim() ?? ''

          if (!currentText) {
            const paragraph = document.createElement('p')
            paragraph.innerHTML = '<br>'

            if (currentList?.parentNode) {
              currentList.parentNode.insertBefore(paragraph, currentList.nextSibling)
            }

            currentListItem.remove()

            if (currentList && currentList.children.length === 0) {
              currentList.remove()
            }

            const range = document.createRange()
            range.selectNodeContents(paragraph)
            range.collapse(true)
            selection?.removeAllRanges()
            selection?.addRange(range)

            syncMarkdown()
            return true
          }

          const nextListItem = document.createElement('li')
          nextListItem.className = 'task-item'
          nextListItem.innerHTML = '<input class="task-checkbox" type="checkbox"><span class="task-label"><br></span>'

          if (currentListItem.nextSibling) {
            currentListItem.parentNode?.insertBefore(nextListItem, currentListItem.nextSibling)
          } else {
            currentListItem.parentNode?.appendChild(nextListItem)
          }

          const label = nextListItem.querySelector('.task-label')
          const range = document.createRange()
          if (label) {
            range.selectNodeContents(label)
            range.collapse(true)
          } else {
            range.selectNodeContents(nextListItem)
            range.collapse(false)
          }
          selection?.removeAllRanges()
          selection?.addRange(range)

          syncMarkdown()
          return true
        }
      }

      if (event.key === 'Backspace') {
        const selection = window.getSelection()
        const anchor = selection?.anchorNode ?? null
        const currentListItem = anchor instanceof Element ? anchor.closest('li') : anchor?.parentElement?.closest('li')
        const currentCheckbox = currentListItem?.querySelector('input[type="checkbox"]')

        if (currentListItem && currentCheckbox) {
          const currentLabel = currentListItem.querySelector('.task-label')
          const currentText = currentLabel?.textContent?.replace(/\u200B/g, '').trim() ?? ''

          if (!currentText) {
            event.preventDefault()

            const currentList = currentListItem.parentElement
            const previousListItem = currentListItem.previousElementSibling as HTMLElement | null
            const nextListItem = currentListItem.nextElementSibling as HTMLElement | null

            currentListItem.remove()

            let focusTarget = previousListItem?.querySelector('.task-label') as HTMLElement | null
            if (!focusTarget) {
              focusTarget = nextListItem?.querySelector('.task-label') as HTMLElement | null
            }

            if (currentList && currentList.children.length === 0) {
              const paragraph = document.createElement('p')
              paragraph.innerHTML = '<br>'
              currentList.parentNode?.insertBefore(paragraph, currentList.nextSibling)
              currentList.remove()
              focusTarget = paragraph
            }

            if (focusTarget) {
              const range = document.createRange()
              range.selectNodeContents(focusTarget)
              range.collapse(false)
              selection?.removeAllRanges()
              selection?.addRange(range)
            }

            syncMarkdown()
            return true
          }
        }
      }

      if (event.key === ' ') {
        const { text, block } = getBlockTextBeforeCursor()
        if (!block) {
          return false
        }

        const patterns: Array<[RegExp, () => void]> = [
          [/^#{4}$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('formatBlock', false, '<h4>')
          }],
          [/^#{3}$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('formatBlock', false, '<h3>')
          }],
          [/^#{2}$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('formatBlock', false, '<h2>')
          }],
          [/^#$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('formatBlock', false, '<h1>')
          }],
          [/^-$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('insertUnorderedList')
          }],
          [/^\*$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('insertUnorderedList')
          }],
          [/^1\.$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('insertOrderedList')
          }],
          [/^>$/, () => {
            deleteCurrentBlockContents()
            document.execCommand('formatBlock', false, '<blockquote>')
          }],
        ]

        for (const [regex, action] of patterns) {
          if (regex.test(text)) {
            event.preventDefault()
            action()
            syncMarkdown()
            return true
          }
        }
      }

      return false
    },
    [deleteCurrentBlockContents, getBlockTextBeforeCursor, turndownService, updateActiveTabBody],
  )

  return { handleWysiwygStructuralKeys }
}
