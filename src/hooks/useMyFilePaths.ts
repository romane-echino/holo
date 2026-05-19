import { useEffect, useState } from 'react'
import { getEditableMarkdownHeader } from '../lib/markdown'

type UseMyFilePathsParams = {
  allFilePaths: string[]
  appAuthor: string
  getHoloApi: () => Window['holo'] | null
}

export function useMyFilePaths({ allFilePaths, appAuthor, getHoloApi }: UseMyFilePathsParams) {
  const [myFilePaths, setMyFilePaths] = useState<string[]>([])

  useEffect(() => {
    const authorNeedle = appAuthor.trim().toLowerCase()

    if (!authorNeedle || allFilePaths.length === 0) {
      setMyFilePaths([])
      return
    }

    const holo = getHoloApi()
    if (!holo) {
      setMyFilePaths([])
      return
    }

    let cancelled = false

    const scan = async () => {
      const mine: string[] = []

      for (const filePath of allFilePaths) {
        try {
          const content = await holo.readFile(filePath)
          const header = getEditableMarkdownHeader(content)
          if (header.author.trim().toLowerCase() === authorNeedle) {
            mine.push(filePath)
          }
        } catch {
          // ignore unreadable files
        }
      }

      if (!cancelled) {
        setMyFilePaths(mine)
      }
    }

    void scan()

    return () => {
      cancelled = true
    }
  }, [allFilePaths, appAuthor, getHoloApi])

  return { myFilePaths }
}
