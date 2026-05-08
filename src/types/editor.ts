export type EditorMode = 'raw' | 'wysiwyg'

export type WysiwygCommand =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikeThrough'
  | 'insertUnorderedList'
  | 'insertOrderedList'
  | 'formatBlock'
  | 'createLink'
  | 'insertHTML'

export type EditableMarkdownHeader = {
  title: string
  description: string
  author: string
  icon: string
  tags: string[]
  isTemplate: boolean
}

export type FilePathStats = {
  modifiedAt: string
  createdAt: string
}

export type SlashCommand = {
  id: string
  icon: string
  label: string
  hint: string
  keywords?: string[]
  requiresApiKey?: boolean
}
