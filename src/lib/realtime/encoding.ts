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
