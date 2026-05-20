import { useCallback } from 'react'
import { useEditorOverlay } from '../contexts/EditorOverlayContext'
import { useWysiwygKeyGuards } from './useWysiwygKeyGuards'
import { useWysiwygTabNavigation } from './useWysiwygTabNavigation'
import { useWysiwygStructuralKeys } from './useWysiwygStructuralKeys'
import { useSlashMenuKeyboard } from './useSlashMenuKeyboard'
import { useIsEditorReadOnly } from './useIsEditorReadOnly'
import type { SlashCommand } from '../types/editor'

type TurndownLike = { turndown: (input: string) => string }

export function useWysiwygKeyDown({
  executeSlashCommand,
  getBlockTextBeforeCursor,
  deleteCurrentBlockContents,
  turndownService,
  updateActiveTabBody,
}: {
  executeSlashCommand: (command: SlashCommand) => void
  getBlockTextBeforeCursor: () => { text: string; block: Element | null }
  deleteCurrentBlockContents: () => void
  turndownService: TurndownLike
  updateActiveTabBody: (nextBody: string) => void
}) {
  const isEditorReadOnly = useIsEditorReadOnly()
  const { wysiwygEditorRef } = useEditorOverlay()
  const { handleWysiwygKeyGuards } = useWysiwygKeyGuards({ isEditorReadOnly })
  const { handleWysiwygTabNavigation } = useWysiwygTabNavigation({ turndownService, updateActiveTabBody })
  const { handleWysiwygStructuralKeys } = useWysiwygStructuralKeys({
    deleteCurrentBlockContents,
    getBlockTextBeforeCursor,
    turndownService,
    updateActiveTabBody,
  })
  const { handleSlashMenuKeyboard } = useSlashMenuKeyboard({ executeSlashCommand, getBlockTextBeforeCursor })

  const onWysiwygKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const editor = wysiwygEditorRef.current
      if (!editor) return
      if (handleWysiwygKeyGuards(event, editor)) return
      if (handleSlashMenuKeyboard(event, editor)) return
      if (handleWysiwygTabNavigation(event, editor)) return
      if (handleWysiwygStructuralKeys(event, editor)) return
    },
    [handleSlashMenuKeyboard, handleWysiwygKeyGuards, handleWysiwygStructuralKeys, handleWysiwygTabNavigation, wysiwygEditorRef],
  )

  return { onWysiwygKeyDown }
}
