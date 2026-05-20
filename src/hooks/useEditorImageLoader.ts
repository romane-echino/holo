import { useEffect } from 'react'

export function useEditorImageLoader({
  desktopApiAvailable,
  wysiwygEditorRef,
  editorMode,
  activeTabPath,
  getHoloApi,
}: {
  desktopApiAvailable: boolean
  wysiwygEditorRef: React.RefObject<HTMLDivElement | null>
  editorMode: 'raw' | 'wysiwyg'
  activeTabPath: string | null
  getHoloApi: () => Window['holo'] | null
}) {
  useEffect(() => {
    if (!desktopApiAvailable) return

    const loadImagesInEditor = async () => {
      const editor = wysiwygEditorRef.current
      if (!editor) return

      const images = editor.querySelectorAll('img[data-src]')
      for (const img of images) {
        if (img.getAttribute('data-loaded') === 'true') continue

        const relativePath = img.getAttribute('data-src')
        if (!relativePath) continue

        try {
          const holo = getHoloApi()
          if (!holo) continue

          const result = await holo.loadImage(relativePath)
          if (result.ok) {
            img.setAttribute('src', result.dataUrl)
            img.setAttribute('data-loaded', 'true')
          }
        } catch (error) {
          console.error(`Failed to load image ${relativePath}:`, error)
        }
      }
    }

    loadImagesInEditor()
  }, [editorMode, activeTabPath, desktopApiAvailable, getHoloApi])
}
