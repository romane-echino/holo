/**
 * Allège une image collée ou déposée avant de l'ajouter au dépôt : une capture
 * Retina fait souvent 2 à 5 Mo en PNG, et chaque version reste à vie dans
 * l'historique git.
 *
 * - seulement au-delà de 500 Ko, et seulement PNG, JPEG, BMP, TIFF (un GIF
 *   peut être animé ; SVG et WebP sont déjà légers) ;
 * - plus de 2 000 pixels de large : réduite à 2 000 (net sur un écran Retina) ;
 * - sans transparence : WebP de bonne qualité ; avec : PNG (logos, icônes) ;
 * - gardée telle quelle si le résultat n'est pas au moins 30 % plus léger.
 */
const MIN_BYTES = 500 * 1024
const MAX_WIDTH = 2000
const WEBP_QUALITY = 0.9
const MAX_RATIO = 0.7

function hasTransparency(pixels: Uint8ClampedArray): boolean {
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return true
  return false
}

export async function optimizeImage(image: Blob): Promise<Blob> {
  if (image.size < MIN_BYTES || !/^image\/(png|jpeg|bmp|tiff)$/i.test(image.type)) return image
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(image)
  } catch {
    return image
  }
  try {
    const scale = Math.min(1, MAX_WIDTH / bitmap.width)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) return image
    context.drawImage(bitmap, 0, 0, width, height)
    const transparent = image.type.toLowerCase() === 'image/png' && hasTransparency(context.getImageData(0, 0, width, height).data)
    const output = await canvas.convertToBlob(transparent ? { type: 'image/png' } : { type: 'image/webp', quality: WEBP_QUALITY })
    return output.size <= image.size * MAX_RATIO ? output : image
  } catch {
    return image
  } finally {
    bitmap.close()
  }
}
