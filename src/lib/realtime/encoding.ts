export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Plus petite modification transformant `before` en `after` : préfixe et
 * suffixe communs, une seule zone remplacée. Une saisie ne touche qu'un bloc
 * à la fois, d'où une seule zone dans l'immense majorité des cas.
 */
export function singleSpliceDiff(before: string, after: string): { index: number; remove: number; insert: string } | null {
  if (before === after) return null
  const maxPrefix = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < maxPrefix && before.charCodeAt(prefix) === after.charCodeAt(prefix)) prefix += 1
  // Ne pas couper une paire de substitution UTF-16 (emoji…)
  if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) prefix -= 1
  let suffix = 0
  const maxSuffix = Math.min(before.length, after.length) - prefix
  while (
    suffix < maxSuffix
    && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)
  ) suffix += 1
  if (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) suffix -= 1
  return {
    index: prefix,
    remove: before.length - prefix - suffix,
    insert: after.slice(prefix, after.length - suffix),
  }
}

function isHighSurrogate(code: number) {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff
}

/**
 * Chiffrement des messages échangés via le relais (AES-GCM 256, IV aléatoire
 * préfixé). Sans clé, les messages passent en clair (relais authentifié).
 * Un message qui ne se déchiffre pas (autre clé, altéré) est ignoré.
 */
export class PayloadCipher {
  private readonly keyPromise: Promise<CryptoKey> | null

  constructor(keyBase64: string | null | undefined) {
    this.keyPromise = keyBase64
      ? crypto.subtle.importKey('raw', base64ToBytes(keyBase64) as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt'])
      : null
  }

  async seal(bytes: Uint8Array): Promise<string> {
    if (!this.keyPromise) return bytesToBase64(bytes)
    const key = await this.keyPromise
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes as BufferSource))
    const sealed = new Uint8Array(iv.length + ciphertext.length)
    sealed.set(iv)
    sealed.set(ciphertext, iv.length)
    return bytesToBase64(sealed)
  }

  async open(payload: string): Promise<Uint8Array | null> {
    try {
      const bytes = base64ToBytes(payload)
      if (!this.keyPromise) return bytes
      const key = await this.keyPromise
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) as BufferSource }, key, bytes.subarray(12) as BufferSource)
      return new Uint8Array(plain)
    } catch {
      return null
    }
  }
}
