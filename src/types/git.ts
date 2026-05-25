export type GitState = {
  isRepo: boolean
  hasRemote: boolean
  branch: string | null
  localChanges: number
  incoming: number
  outgoing: number
  conflictedFiles: string[]
  lastFetchAt: string | null
  error: string | null
}

export type RemoteEditBlock = {
  isBlocked: boolean
  message: string
}