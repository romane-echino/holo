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
/** Qualité d'une coupure entre deux caractères : fin de texte, ligne, espace, ponctuation, lettre. */
function boundaryScore(left: string | undefined, right: string | undefined): number {
  if (left === undefined || right === undefined) return 6
  if (left === '\n' || right === '\n') return 4
  if (/\s/.test(left) || /\s/.test(right)) return 2
  if (/[^\p{L}\p{N}]/u.test(left) || /[^\p{L}\p{N}]/u.test(right)) return 1
  return 0
}

/**
 * Une insertion ou une suppression peut souvent se placer à plusieurs endroits
 * équivalents (supprimer « 47q al » ou « ␣al47q » dans « al47q al60q » donne le
 * même texte). Le choix compte en édition partagée : une saisie simultanée
 * d'un collègue s'accroche aux caractères voisins. On la place donc en limite
 * de mots, comme l'utilisateur l'a faite, plutôt qu'à cheval sur deux mots.
 */
function alignToWordBoundaries(text: string, splice: TextSplice, minIndex: number, maxEnd: number): TextSplice {
  const isInsert = splice.remove === 0 && splice.insert.length > 0
  const isDelete = splice.insert === '' && splice.remove > 0
  if (!isInsert && !isDelete) return splice
  let segment = isInsert ? splice.insert : text.slice(splice.index, splice.index + splice.remove)
  const length = segment.length
  // Caractères autour d'une position candidate (pour une suppression, le segment est dans le texte).
  const before = (index: number) => text[index - 1]
  const after = (index: number) => text[isInsert ? index : index + length]
  const score = (index: number, value: string) => boundaryScore(before(index), value[0]) + boundaryScore(value[length - 1], after(index))
  let bestIndex = splice.index
  let bestSegment = segment
  let bestScore = score(splice.index, segment)
  // Vers la gauche : le dernier caractère du segment égale celui qui le précède.
  let index = splice.index
  while (index - 1 >= minIndex && text[index - 1] === segment[length - 1]) {
    segment = segment[length - 1] + segment.slice(0, -1)
    index -= 1
    const candidate = score(index, segment)
    if (candidate > bestScore) { bestScore = candidate; bestIndex = index; bestSegment = segment }
  }
  // Vers la droite : le premier caractère du segment égale celui qui le suit.
  segment = isInsert ? splice.insert : text.slice(splice.index, splice.index + splice.remove)
  index = splice.index
  while ((isInsert ? index : index + length) < maxEnd && after(index) === segment[0]) {
    segment = segment.slice(1) + segment[0]
    index += 1
    const candidate = score(index, segment)
    if (candidate > bestScore) { bestScore = candidate; bestIndex = index; bestSegment = segment }
  }
  // Ne pas couper une paire de substitution UTF-16 (emoji…).
  if (isHighSurrogate(text.charCodeAt(bestIndex - 1)) || isLowSurrogate(bestSegment.charCodeAt(0))) return splice
  return isInsert ? { index: bestIndex, remove: 0, insert: bestSegment } : { index: bestIndex, remove: length, insert: '' }
}

export function multiSpliceDiff(before: string, after: string): TextSplice[] {
  let previousEnd = 0
  const raw = rawMultiSpliceDiff(before, after)
  return raw.map((rawSplice, position) => {
    const nextStart = raw[position + 1]?.index ?? before.length
    const splice = alignToWordBoundaries(before, rawSplice, previousEnd, nextStart)
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

/** Plus longue sous-chaîne commune (programmation dynamique), sans couper une paire UTF-16. */
function longestCommonSubstring(left: string, right: string): { leftStart: number; rightStart: number; length: number } {
  let best = { leftStart: 0, rightStart: 0, length: 0 }
  let previous = new Uint16Array(right.length + 1)
  let current = new Uint16Array(right.length + 1)
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left.charCodeAt(i - 1) === right.charCodeAt(j - 1) ? previous[j - 1] + 1 : 0
      if (current[j] > best.length) best = { leftStart: i - current[j], rightStart: j - current[j], length: current[j] }
    }
    ;[previous, current] = [current, previous]
    current.fill(0)
  }
  // Ne pas commencer ni finir au milieu d'une paire de substitution (emoji…).
  if (best.length > 0 && isLowSurrogate(left.charCodeAt(best.leftStart))) best = { leftStart: best.leftStart + 1, rightStart: best.rightStart + 1, length: best.length - 1 }
  if (best.length > 0 && isHighSurrogate(left.charCodeAt(best.leftStart + best.length - 1))) best = { ...best, length: best.length - 1 }
  return best
}

const MIN_COMMON_RUN = 4
const MAX_FINE_DIFF_CELLS = 250_000

/**
 * Différence au caractère près à l'intérieur d'une zone : une modification au
 * début et une à la fin d'un même texte donnent deux zones, et non le
 * remplacement de tout le texte (qui écraserait la saisie simultanée d'un
 * collègue au milieu, puis la dupliquerait).
 */
function fineSplices(before: string, after: string, offset: number): TextSplice[] {
  if (before === after) return []
  if (before.length * after.length > MAX_FINE_DIFF_CELLS) {
    // Texte long : on réduit d'abord à la zone qui diffère (début et fin communs).
    const splice = singleSpliceDiff(before, after)!
    const removed = before.slice(splice.index, splice.index + splice.remove)
    if (removed.length * splice.insert.length > MAX_FINE_DIFF_CELLS || (removed === before && splice.insert === after)) {
      return [{ ...splice, index: offset + splice.index }]
    }
    return fineSplices(removed, splice.insert, offset + splice.index)
  }
  // Plus longue partie commune sur tout le texte (et non après avoir retiré
  // début et fin communs, qui peuvent « voler » des caractères et couper un mot).
  const common = longestCommonSubstring(before, after)
  if (common.length < MIN_COMMON_RUN) {
    const splice = singleSpliceDiff(before, after)!
    return [{ ...splice, index: offset + splice.index }]
  }
  return [
    ...fineSplices(before.slice(0, common.leftStart), after.slice(0, common.rightStart), offset),
    ...fineSplices(before.slice(common.leftStart + common.length), after.slice(common.rightStart + common.length), offset + common.leftStart + common.length),
  ]
}

function rawMultiSpliceDiff(before: string, after: string): TextSplice[] {
  const outer = singleSpliceDiff(before, after)
  if (!outer) return []
  const linesBefore = splitLines(before.slice(outer.index, outer.index + outer.remove))
  const linesAfter = splitLines(outer.insert)
  if (linesBefore.length < 2 || linesAfter.length < 2) return fineSplices(before, after, 0)
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
    splices.push(...fineSplices(gapBefore, gapAfter, outer.index + offsetsBefore[lineBefore]))
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

/**
 * Espaces insécables → espaces : l'éditeur affiche un espace tapé en fin de
 * texte comme insécable, la version reçue a un espace normal. Pour replacer
 * le curseur, les deux doivent compter comme le même caractère.
 */
export function sameSpaces(text: string): string {
  return text.replace(/\u00a0/g, ' ')
}
