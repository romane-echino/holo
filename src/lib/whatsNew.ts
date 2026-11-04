import type { ChangelogEntry } from '../types/shared'

function parts(version: string): number[] {
  return version.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
}

/** Comparaison de versions X.Y.Z (négatif si a < b). */
export function compareVersions(a: string, b: string): number {
  const [left, right] = [parts(a), parts(b)]
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * Entrées du changelog à présenter après une mise à jour : les versions
 * installées depuis la dernière vue (exclue) jusqu'à l'actuelle (incluse),
 * de la plus récente à la plus ancienne. Rien à la première installation.
 */
export function entriesSince(entries: ChangelogEntry[], lastSeen: string | null, current: string): ChangelogEntry[] {
  if (!lastSeen || compareVersions(current, lastSeen) <= 0) return []
  return entries
    .filter((entry) => compareVersions(entry.version, lastSeen) > 0 && compareVersions(entry.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}
