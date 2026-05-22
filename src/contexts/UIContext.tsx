import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { NameDialog, GitDialog, CloneDialog, LinkDialogState } from '../types/shared'

export interface UIContextType {
  // Modals & Dialogs
  showSettings: boolean
  setShowSettings: Dispatch<SetStateAction<boolean>>
  showUnsavedChangesModal: boolean
  setShowUnsavedChangesModal: Dispatch<SetStateAction<boolean>>
  showAuthorModal: boolean
  setShowAuthorModal: Dispatch<SetStateAction<boolean>>
  authorModalMode: 'startup' | 'edit'
  setAuthorModalMode: Dispatch<SetStateAction<'startup' | 'edit'>>
  authorModalValue: string
  setAuthorModalValue: Dispatch<SetStateAction<string>>
  showUserMenu: boolean
  setShowUserMenu: Dispatch<SetStateAction<boolean>>
  
  // Name Dialog
  nameDialog: NameDialog | null
  setNameDialog: Dispatch<SetStateAction<NameDialog | null>>
  
  // Git Dialog
  gitDialog: GitDialog | null
  setGitDialog: Dispatch<SetStateAction<GitDialog | null>>
  cloneDialog: CloneDialog | null
  setCloneDialog: Dispatch<SetStateAction<CloneDialog | null>>
  showGitAuthHelp: boolean
  setShowGitAuthHelp: Dispatch<SetStateAction<boolean>>
  
  // Link Dialog
  linkDialog: LinkDialogState | null
  setLinkDialog: Dispatch<SetStateAction<LinkDialogState | null>>
  
  // Tag Input
  tagInput: string
  setTagInput: Dispatch<SetStateAction<string>>
  showTagInput: boolean
  setShowTagInput: Dispatch<SetStateAction<boolean>>
  
  // Status & Feedback
  saveStatus: 'idle' | 'saving' | 'synced' | 'local'
  setSaveStatus: Dispatch<SetStateAction<'idle' | 'saving' | 'synced' | 'local'>>
  copyLinkStatus: 'idle' | 'copied'
  setCopyLinkStatus: Dispatch<SetStateAction<'idle' | 'copied'>>
  
  // Settings & Config
  seenChangelogVersion: string
  setSeenChangelogVersion: Dispatch<SetStateAction<string>>
  globalConfigReady: boolean
  setGlobalConfigReady: Dispatch<SetStateAction<boolean>>
  
  // UI State
  pendingFileSwitchPath: string | null
  setPendingFileSwitchPath: Dispatch<SetStateAction<string | null>>
  
  // Folder Icon Picker
  showFolderIconPicker: string | null
  setShowFolderIconPicker: Dispatch<SetStateAction<string | null>>
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function useUI() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within UIProvider')
  }
  return context
}

export { UIContext }
