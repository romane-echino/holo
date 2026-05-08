// Shared types extracted from App.tsx for use in components
export type NameDialog =
  | {
      mode: 'create-file' | 'create-directory'
      value: string
      targetDirectoryPath: string
      selectedTemplatePath?: string | null
      templateVariables?: Record<string, string>
    }
  | {
      mode: 'rename'
      value: string
      targetPath: string
    }

export type GitDialog =
  | {
      mode: 'commit'
      value: string
    }
  | {
      mode: 'merge'
      value: string
    }

export type CloneDialog = {
  repoUrl: string
  destinationPath: string
  username: string
  password: string
  isSubmitting: boolean
}

export type ConfirmDialogState = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  intent?: 'primary' | 'danger'
}

export type ChangelogEntry = {
  version: string
  releasedAt: string
  items: string[]
}

export type LinkDialogState = {
  text: string
  url: string
  pageQuery?: string
}

export type TemplateOption = {
  path: string
  label: string
  description?: string
}
