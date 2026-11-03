/**
 * Alignement de deux versions d'une séquence (blocs d'un document, lignes ou
 * colonnes d'un tableau) après une modification reçue d'un collègue.
 *
 * Pour chaque élément de `nextKeys`, donne l'indice de l'élément correspondant
 * de `previousKeys`, ou -1 pour un élément nouveau :
 * - les éléments identiques (même clé) sont appariés selon la plus longue
 *   sous-séquence commune : un élément inséré ou supprimé ailleurs ne décale rien ;
 * - entre deux appariements, les éléments restants sont appariés dans l'ordre
 *   s'ils sont compatibles (même type…) : c'est le même élément, modifié.
 */
export type SequenceAlignment = {
  /** Indice dans la version précédente de chaque élément de la nouvelle version, ou -1 */
  matches: number[]
  /** Élément identique (et non simplement modifié) */
  exact: boolean[]
}

/** Au-delà, pas de recherche de sous-séquence commune (coût quadratique). */
const MAX_LCS_CELLS = 250_000

export function alignSequences(
  previousKeys: readonly string[],
  nextKeys: readonly string[],
  compatible: (previousIndex: number, nextIndex: number) => boolean = () => true,
): SequenceAlignment {
  const matches = new Array<number>(nextKeys.length).fill(-1)
  const exact = new Array<boolean>(nextKeys.length).fill(false)
  const pair = (previousIndex: number, nextIndex: number, same: boolean) => {
    matches[nextIndex] = previousIndex
    exact[nextIndex] = same
  }

  // Préfixe et suffixe communs : le cas courant (une seule zone modifiée).
  let start = 0
  while (start < previousKeys.length && start < nextKeys.length && previousKeys[start] === nextKeys[start]) {
    pair(start, start, true)
    start += 1
  }
  let previousEnd = previousKeys.length
  let nextEnd = nextKeys.length
  while (previousEnd > start && nextEnd > start && previousKeys[previousEnd - 1] === nextKeys[nextEnd - 1]) {
    previousEnd -= 1
    nextEnd -= 1
    pair(previousEnd, nextEnd, true)
  }

  // Plus longue sous-séquence commune de la zone centrale.
  const rows = previousEnd - start
  const columns = nextEnd - start
  const anchors: Array<[number, number]> = []
  if (rows > 0 && columns > 0 && rows * columns <= MAX_LCS_CELLS) {
    const width = columns + 1
    const table = new Uint32Array((rows + 1) * width)
    for (let i = rows - 1; i >= 0; i -= 1) {
      for (let j = columns - 1; j >= 0; j -= 1) {
        table[i * width + j] = previousKeys[start + i] === nextKeys[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < rows && j < columns) {
      if (previousKeys[start + i] === nextKeys[start + j]) {
        anchors.push([start + i, start + j])
        i += 1
        j += 1
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
        i += 1
      } else {
        j += 1
      }
    }
  }
  for (const [previousIndex, nextIndex] of anchors) pair(previousIndex, nextIndex, true)

  // Entre deux appariements : éléments modifiés, appariés dans l'ordre.
  const bounds: Array<[number, number]> = [[start - 1, start - 1], ...anchors, [previousEnd, nextEnd]]
  for (let gap = 0; gap < bounds.length - 1; gap += 1) {
    let previousIndex = bounds[gap][0] + 1
    const previousLimit = bounds[gap + 1][0]
    for (let nextIndex = bounds[gap][1] + 1; nextIndex < bounds[gap + 1][1]; nextIndex += 1) {
      let candidate = previousIndex
      while (candidate < previousLimit && !compatible(candidate, nextIndex)) candidate += 1
      if (candidate >= previousLimit) continue
      pair(candidate, nextIndex, false)
      previousIndex = candidate + 1
    }
  }

  return { matches, exact }
}
