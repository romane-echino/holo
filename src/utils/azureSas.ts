// Helpers pour le « lien SAS » Azure Blob unique.
//
// Azure fournit une URL complète qui contient à la fois le container et le token,
// par ex. : https://compte.blob.core.windows.net/container?sp=racw&sv=...&sig=...
// En interne, Holo continue de manipuler deux valeurs séparées (containerUrl + sasToken)
// pour rester compatible avec l'existant. Ces helpers font le pont entre l'UI (un seul
// champ) et le stockage (deux valeurs), sans perte lors d'allers-retours.

/** Découpe un lien SAS en { containerUrl, sasToken } sur le premier « ? ». */
export function parseAzureSasUrl(rawSasUrl: string): { containerUrl: string; sasToken: string } {
  const raw = String(rawSasUrl ?? '').trim()
  const queryIndex = raw.indexOf('?')

  if (queryIndex < 0) {
    return { containerUrl: raw, sasToken: '' }
  }

  return {
    containerUrl: raw.slice(0, queryIndex),
    sasToken: raw.slice(queryIndex + 1).replace(/^\?+/, ''),
  }
}

/** Reconstruit le lien SAS unique à partir des deux valeurs stockées. */
export function buildAzureSasUrl(containerUrl: string, sasToken: string): string {
  const url = String(containerUrl ?? '').trim()
  const token = String(sasToken ?? '').trim().replace(/^\?+/, '')

  if (!token) {
    return url
  }

  return `${url}?${token}`
}
