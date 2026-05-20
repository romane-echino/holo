import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'

export interface OpenTab {
  path: string
  name: string
  content: string
  isDirty: boolean
}

export interface EditorContextType {
  // Active Tab & Content
  activeTab: OpenTab | null
  setActiveTab: Dispatch<SetStateAction<OpenTab | null>>
  activeTabPath: string | null
  setActiveTabPath: Dispatch<SetStateAction<string | null>>

  // Editor Mode
  editorMode: 'raw' | 'wysiwyg'
  setEditorMode: Dispatch<SetStateAction<'raw' | 'wysiwyg'>>

  // Popups & Overlays
  selectionPopup: any
  setSelectionPopup: Dispatch<SetStateAction<any>>
  tablePopup: any
  setTablePopup: Dispatch<SetStateAction<any>>
  codeBlockPopup: any
  setCodeBlockPopup: Dispatch<SetStateAction<any>>
  columnTypePopup: any
  setColumnTypePopup: Dispatch<SetStateAction<any>>
  hoveredCodeBlock: any
  setHoveredCodeBlock: Dispatch<SetStateAction<any>>

  // Slash Menu
  slashMenu: any
  setSlashMenu: Dispatch<SetStateAction<any>>
  slashMenuIndex: number
  setSlashMenuIndex: Dispatch<SetStateAction<number>>

  // TOC & Navigation
  showCompactToc: boolean
  setShowCompactToc: Dispatch<SetStateAction<boolean>>
  
  // Editor UI State
  isImageDragOverEditor: boolean
  setIsImageDragOverEditor: Dispatch<SetStateAction<boolean>>
  showEmojiPicker: boolean
  setShowEmojiPicker: Dispatch<SetStateAction<boolean>>
  
  // Readonly Mode
  readOnlyMode: boolean
  setReadOnlyMode: Dispatch<SetStateAction<boolean>>
}

const EditorContext = createContext<EditorContextType | undefined>(undefined)

export function useEditor() {
  const context = useContext(EditorContext)
  if (!context) {
    throw new Error('useEditor must be used within EditorProvider')
  }
  return context
}

export { EditorContext }
