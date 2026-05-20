import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'

export function useWysiwygBlockHelpers() {
  const { wysiwygEditorRef } = useEditorOverlay()
  const findCurrentEditorBlockNode = useCallback((selection: Selection, editor: HTMLDivElement): Node | null => {
    const BLOCK_TAGS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE']

    let node: Node | null = selection.anchorNode
    if (!node) return null

    if (node === editor) {
      const offset = Math.max(0, Math.min(selection.anchorOffset, editor.childNodes.length))
      node = editor.childNodes[offset] ?? editor.childNodes[offset - 1] ?? null
      if (!node) return null
    }

    while (node && node !== editor) {
      if (node instanceof Element && BLOCK_TAGS.includes(node.tagName)) {
        return node
      }

      if (node.parentNode === editor) {
        return node
      }

      node = node.parentNode
    }

    return null
  }, [])

  const getBlockTextBeforeCursor = useCallback((): { text: string; block: Element | null } => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return { text: '', block: null }
    const editor = wysiwygEditorRef.current
    if (!editor) return { text: '', block: null }

    const node = findCurrentEditorBlockNode(sel, editor)
    if (!node) return { text: '', block: null }
    const anchorNode = sel.anchorNode

    const blockRange = document.createRange()
    blockRange.setStart(node, 0)
    if (anchorNode && node.contains(anchorNode)) {
      blockRange.setEnd(anchorNode, sel.anchorOffset)
    } else if (sel.anchorNode === editor) {
      blockRange.setEnd(editor, sel.anchorOffset)
    } else {
      blockRange.selectNodeContents(node)
    }

    return { text: blockRange.toString(), block: node instanceof Element ? node : null }
  }, [findCurrentEditorBlockNode, wysiwygEditorRef])

  const deleteCurrentBlockContents = useCallback(() => {
    const sel = window.getSelection()
    if (!sel?.rangeCount) return
    const editor = wysiwygEditorRef.current
    if (!editor) return

    const node = findCurrentEditorBlockNode(sel, editor)
    if (!node) return
    const anchorNode = sel.anchorNode

    const range = document.createRange()
    range.setStart(node, 0)

    if (anchorNode && node.contains(anchorNode)) {
      range.setEnd(anchorNode, sel.anchorOffset)
    } else if (sel.anchorNode === editor) {
      range.setEnd(editor, sel.anchorOffset)
    } else {
      range.selectNodeContents(node)
    }
    range.deleteContents()
  }, [findCurrentEditorBlockNode, wysiwygEditorRef])

  return {
    getBlockTextBeforeCursor,
    deleteCurrentBlockContents,
  }
}
