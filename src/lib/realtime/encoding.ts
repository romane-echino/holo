import { alignSequences } from '../alignSequences'

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

export type TextSplice = { index: number; remove: number; insert: string }

function lineOffsets(lines: string[]): number[] {
  const offsets = [0]
  for (const line of lines) offsets.push(offsets[offsets.length - 1] + line.length)
  return offsets
}

/** Lignes, chacune avec son retour à la ligne final. */
function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

/**
 * Différences entre deux textes, en zones séparées (indices dans `before`,
 * croissants). Deux modifications éloignées donnent deux zones : le texte qui
 * les sépare n'est pas réécrit. C'est essentiel en édition partagée : ce texte
 * a pu être modifié entre-temps par un collègue, et le remplacer en bloc
 * dupliquerait ou effacerait sa saisie.
 */
export function multiSpliceDiff(before: string, after: string): TextSplice[] {
  let previousEnd = 0
  return rawMultiSpliceDiff(before, after).map((splice) => {
    const anchored = anchorBlockSplice(before, splice)
    const result = anchored.index >= previousEnd ? anchored : splice
    previousEnd = result.index + result.remove
    return result
  })
}

/**
 * Un bloc entier supprimé ou inséré est rattaché à la fin du bloc précédent :
 * « \n\nBloc » plutôt que « Bloc\n\n » (les deux sont équivalents). Si un
 * collègue tape au même moment dans le bloc supprimé, ses caractères restent
 * alors collés à la fin du bloc précédent, au lieu d'être collés au début du
 * bloc suivant, ce qui peut casser sa structure (ligne d'en-tête d'un tableau
 * qui devient du texte).
 */
function anchorBlockSplice(before: string, splice: TextSplice): TextSplice {
  const removed = before.slice(splice.index, splice.index + splice.remove)
  const pureInsert = splice.remove === 0 && splice.insert.endsWith('\n\n')
  const pureRemove = splice.insert === '' && removed.endsWith('\n\n')
  if (!pureInsert && !pureRemove) return splice
  if (splice.index < 2 || before.slice(splice.index - 2, splice.index) !== '\n\n') return splice
  // Le bloc précédent doit se terminer juste avant le séparateur (pas une ligne vide de plus).
  if (splice.index >= 3 && before[splice.index - 3] === '\n') return splice
  return pureInsert
    ? { index: splice.index - 2, remove: 0, insert: `\n\n${splice.insert.slice(0, -2)}` }
    : { index: splice.index - 2, remove: splice.remove, insert: '' }
}

function rawMultiSpliceDiff(before: string, after: string): TextSplice[] {
  const outer = singleSpliceDiff(before, after)
  if (!outer) return []
  const linesBefore = splitLines(before.slice(outer.index, outer.index + outer.remove))
  const linesAfter = splitLines(outer.insert)
  if (linesBefore.length < 2 || linesAfter.length < 2) return [outer]
  // Lignes identiques des deux côtés : points d'ancrage ; seules les zones
  // entre deux ancres sont modifiées.
  const { matches, exact } = alignSequences(linesBefore, linesAfter, () => false)
  const offsetsBefore = lineOffsets(linesBefore)
  const offsetsAfter = lineOffsets(linesAfter)
  const anchors: Array<[number, number]> = []
  matches.forEach((match, index) => {
    if (match !== -1 && exact[index]) anchors.push([match, index])
  })
  anchors.push([linesBefore.length, linesAfter.length])
  const splices: TextSplice[] = []
  let lineBefore = 0
  let lineAfter = 0
  for (const [anchorBefore, anchorAfter] of anchors) {
    const gapBefore = before.slice(outer.index + offsetsBefore[lineBefore], outer.index + offsetsBefore[anchorBefore])
    const gapAfter = outer.insert.slice(offsetsAfter[lineAfter], offsetsAfter[anchorAfter])
    const splice = singleSpliceDiff(gapBefore, gapAfter)
    if (splice) splices.push({ ...splice, index: outer.index + offsetsBefore[lineBefore] + splice.index })
    lineBefore = anchorBefore + 1
    lineAfter = anchorAfter + 1
  }
  return splices
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

/**
 * Applique à `theirs` les modifications faites entre `base` et `ours`, au
 * caractère près. Sert à rattraper une saisie faite pendant qu'on rejoignait
 * une session : `base` est le texte au début de la jonction, `ours` le texte
 * de l'éditeur à la fin, `theirs` le texte de la session rejointe.
 */
export function rebaseText(base: string, ours: string, theirs: string): string {
  const local = multiSpliceDiff(base, ours)
  if (local.length === 0) return theirs
  const remote = multiSpliceDiff(base, theirs)
  // Position dans `theirs` d'un indice de `base`.
  const map = (index: number) => {
    let shift = 0
    for (const splice of remote) {
      if (splice.index + splice.remove <= index) shift += splice.insert.length - splice.remove
      else if (splice.index < index) return splice.index + shift + splice.insert.length
      else break
    }
    return index + shift
  }
  let result = theirs
  for (const splice of [...local].reverse()) {
    // Même modification déjà présente au même endroit de l'autre côté (ou
    // contenue dans une saisie plus longue) : elle ne compte qu'une fois.
    const alreadyThere = remote.some((other) => other.index === splice.index
      && other.remove === splice.remove
      && (splice.insert === '' ? other.insert === '' : other.insert.includes(splice.insert)))
    if (alreadyThere) continue
    const start = map(splice.index)
    const end = Math.max(start, map(splice.index + splice.remove))
    result = result.slice(0, start) + splice.insert + result.slice(end)
  }
  return result
}
