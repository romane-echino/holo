import { useEffect, useRef } from 'react'

export function useStartupNavigation({
  openFile,
  openRecentFolder,
}: {
  openFile: (path: string) => Promise<void>
  openRecentFolder: (path: string) => Promise<void>
}) {
  const doneRef = useRef(false)

  useEffect(() => {
    if (doneRef.current) return

    const params = new URLSearchParams(window.location.search)
    const rootPathParam = params.get('rootPath')?.trim()
    const filePathParam = params.get('filePath')?.trim()
    const startupErrorParam = params.get('startupError')?.trim()

    doneRef.current = true

    if (startupErrorParam) {
      window.alert(startupErrorParam)
    }

    if (!rootPathParam) return

    void (async () => {
      try {
        await openRecentFolder(rootPathParam)
        if (filePathParam) {
          await openFile(filePathParam)
        }
      } catch (error) {
        console.error('Failed startup navigation:', error)
      }
    })()
  }, [openFile, openRecentFolder])
}
