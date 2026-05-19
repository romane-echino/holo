import type { GitState, RemoteEditBlock } from '../types/git'

export const DEFAULT_GIT_STATE: GitState = {
  isRepo: false,
  branch: null,
  localChanges: 0,
  incoming: 0,
  outgoing: 0,
  conflictedFiles: [],
  lastFetchAt: null,
  error: null,
}

export function normalizeGitState(input: Partial<GitState> | null | undefined): GitState {
  return {
    ...DEFAULT_GIT_STATE,
    ...(input ?? {}),
    conflictedFiles: Array.isArray(input?.conflictedFiles) ? input.conflictedFiles : [],
  }
}

export function getFriendlyGitErrorMessage(rawMessage: string): string {
  const message = rawMessage.toLowerCase()

  if (
    /authentication failed|could not read username|permission denied \(publickey\)|could not read from remote repository|repository not found/.test(
      message,
    )
  ) {
    return 'Échec de connexion Git distante. Holo ne stocke pas tes identifiants : Git utilise ta configuration système (SSH ou gestionnaire d’identifiants). Vérifie cette configuration puis réessaie Synchroniser.'
  }

  if (/could not resolve host|name or service not known|network is unreachable|timed out/.test(message)) {
    return 'Impossible de joindre le dépôt distant (réseau/DNS). Vérifie la connexion Internet puis réessaie.'
  }

  return rawMessage
}

export function isLikelyGitAuthError(rawMessage: string | null | undefined): boolean {
  if (!rawMessage) return false
  const message = rawMessage.toLowerCase()
  return /authentication failed|could not read username|permission denied \(publickey\)|could not read from remote repository|repository not found|credentials|identifiants|ssh/.test(message)
}

export function getRemoteEditBlockFromGitState(nextGitState: GitState): RemoteEditBlock {
  if (nextGitState.error) {
    return { isBlocked: false, message: '' }
  }

  if ((nextGitState.conflictedFiles?.length ?? 0) > 0) {
    return {
      isBlocked: true,
      message: 'Conflits Git détectés. Résous-les depuis le panneau Git (garder local / prendre serveur) pour reprendre l’édition.',
    }
  }

  if (nextGitState.incoming > 0) {
    return {
      isBlocked: true,
      message: 'Une version plus récente existe sur le dépôt distant. Fais un pull pour reprendre l’édition.',
    }
  }

  return { isBlocked: false, message: '' }
}