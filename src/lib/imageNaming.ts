/** Nommage des images collées ou déposées dans un document. */
import { optimizeImage } from './imageOptimize'

export function extensionFromMimeType(mimeType: string | undefined) {
  switch ((mimeType ?? '').toLowerCase()) {
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    case 'image/jpeg':
      return '.jpg'
    case 'image/svg+xml':
      return '.svg'
    case 'image/bmp':
      return '.bmp'
    case 'image/avif':
      return '.avif'
    default:
      return '.png'
  }
}

/**
 * Nom (et texte alternatif) d'une image collée ou déposée. Un nom parlant est
 * gardé. Un nom générique (presse-papiers, capture d'écran) devient le nom du
 * document et la date, sans légende : « fiche-employe-2026-11-04-1a2b3c4d.png »
 * plutôt que « image-1a2b3c4d.png » légendée « image ».
 */
export function imageNaming(fileName: string, mimeType: string, documentPath: string | undefined, now = new Date()): { name: string; alt: string } {
  const generic = !fileName || /^(image|clipboard|pasted image|screenshot|screen shot|capture d.écran)\b/i.test(fileName.normalize('NFC'))
  if (!generic) return { name: fileName, alt: fileName.replace(/\.[^.]+$/, '') }
  const extension = /\.[a-z0-9]+$/i.exec(fileName)?.[0] ?? extensionFromMimeType(mimeType)
  const documentName = (documentPath ?? '').split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? ''
  const slug = documentName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image'
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return { name: `${slug}-${date}${extension}`, alt: '' }
}

/**
 * Image prête à enregistrer : allégée (voir optimizeImage), en base64, avec
 * son nom et son texte alternatif ; l'extension suit le format final.
 */
export async function prepareImage(file: File, documentPath: string | undefined): Promise<{ base64: string; name: string; alt: string }> {
  const image = await optimizeImage(file)
  const naming = imageNaming(file.name, image.type, documentPath)
  const name = image === file ? naming.name : `${naming.name.replace(/\.[^.]+$/, '')}${extensionFromMimeType(image.type)}`
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(image)
  })
  return { base64: dataUrl.split(',')[1], name, alt: naming.alt }
}

