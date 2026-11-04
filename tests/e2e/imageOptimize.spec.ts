/**
 * imageOptimize.spec.ts — Allègement des images collées ou déposées
 *
 * Exécuté dans le navigateur (createImageBitmap, OffscreenCanvas).
 */
import { test, expect } from '@playwright/test'

const FIXTURE_URL = '/tests/fixtures/editor.html'

type Result = { inputType: string; inputSize: number; outputType: string; outputSize: number; outputWidth: number; same: boolean }

test.describe('Allègement des images', () => {
  test('une grande capture opaque passe en WebP réduit ; un logo transparent reste en PNG ; une petite image est intacte', async ({ page }) => {
    await page.goto(FIXTURE_URL)
    const results = await page.evaluate(async () => {
      const { optimizeImage } = await import('/src/lib/imageOptimize.ts')
      // Fausse capture : texte et aplats, avec un léger bruit (comme l'anticrénelage).
      const draw = async (width: number, height: number, transparent: boolean) => {
        const canvas = new OffscreenCanvas(width, height)
        const context = canvas.getContext('2d')!
        if (!transparent) {
          context.fillStyle = '#f4f4f6'
          context.fillRect(0, 0, width, height)
        }
        for (let line = 0; line < height / 28; line += 1) {
          context.fillStyle = `hsl(${(line * 37) % 360} 60% 40%)`
          context.font = '20px sans-serif'
          context.fillText(`Ligne ${line} : du texte comme dans une capture d'écran, avec des chiffres ${line * 1234}`, 20, 24 + line * 28)
        }
        const pixels = context.getImageData(0, 0, width, height)
        for (let index = 0; index < pixels.data.length; index += 4) {
          if (pixels.data[index + 3] === 0) continue
          const noise = (Math.random() - 0.5) * 6
          pixels.data[index] += noise
          pixels.data[index + 1] += noise
          pixels.data[index + 2] += noise
        }
        context.putImageData(pixels, 0, 0)
        return canvas.convertToBlob({ type: 'image/png' })
      }
      const measure = async (input: Blob): Promise<Result> => {
        const output = await optimizeImage(input)
        const bitmap = await createImageBitmap(output)
        return { inputType: input.type, inputSize: input.size, outputType: output.type, outputSize: output.size, outputWidth: bitmap.width, same: output === input }
      }
      return {
        capture: await measure(await draw(2880, 1800, false)),
        logo: await measure(await draw(2880, 1800, true)),
        small: await measure(await draw(300, 200, false)),
      }
    }) as Record<'capture' | 'logo' | 'small', Result>
    console.log('[images]', JSON.stringify(results))

    expect(results.capture.inputSize).toBeGreaterThan(500 * 1024)
    expect(results.capture.outputType).toBe('image/webp')
    expect(results.capture.outputWidth).toBe(2000)
    expect(results.capture.outputSize).toBeLessThan(results.capture.inputSize * 0.7)

    expect(results.logo.outputType).toBe('image/png')
    expect(results.logo.same || results.logo.outputWidth === 2000).toBe(true)

    expect(results.small.same).toBe(true)
  })
})
