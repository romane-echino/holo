import { useCallback } from 'react'
import type { ImageStorageMode } from './useRepoImageSettings'

type UseImageUploadHandlerParams = {
  getHoloApi: () => Window['holo'] | null
  ensureImageProviderReady: () => boolean
  imageConfig: {
    mode: ImageStorageMode
    azureBlobContainerUrl: string
    azureBlobSasToken: string
    s3Region: string
    s3Bucket: string
    s3AccessKeyId: string
    s3SecretAccessKey: string
    s3Endpoint: string
    s3PublicBaseUrl: string
    dropboxAccessToken: string
    dropboxFolderPath: string
    gdriveAccessToken: string
    gdriveFolderId: string
  }
}

export function useImageUploadHandler({
  getHoloApi,
  ensureImageProviderReady,
  imageConfig,
}: UseImageUploadHandlerParams) {
  const handleImageFiles = useCallback(
    async (
      files: File[],
      insertFn: (mdImage: string, relativePath: string, previewDataUrl: string) => void,
    ) => {
      const holo = getHoloApi()
      if (!holo) return

      if (!ensureImageProviderReady()) {
        return
      }

      for (const file of files) {
        const reader = new FileReader()
        reader.onload = async (event) => {
          const dataUrl = event.target?.result as string
          if (typeof dataUrl !== 'string') return
          const base64 = dataUrl.split(',')[1]
          if (!base64) return
          try {
            const result = await holo.saveImage(file.name, base64, {
              mode: imageConfig.mode,
              azure:
                imageConfig.mode === 'azure'
                  ? {
                      containerUrl: imageConfig.azureBlobContainerUrl,
                      sasToken: imageConfig.azureBlobSasToken,
                    }
                  : undefined,
              s3:
                imageConfig.mode === 's3'
                  ? {
                      region: imageConfig.s3Region,
                      bucket: imageConfig.s3Bucket,
                      accessKeyId: imageConfig.s3AccessKeyId,
                      secretAccessKey: imageConfig.s3SecretAccessKey,
                      endpoint: imageConfig.s3Endpoint,
                      publicBaseUrl: imageConfig.s3PublicBaseUrl,
                    }
                  : undefined,
              dropbox:
                imageConfig.mode === 'dropbox'
                  ? {
                      accessToken: imageConfig.dropboxAccessToken,
                      folderPath: imageConfig.dropboxFolderPath,
                    }
                  : undefined,
              gdrive:
                imageConfig.mode === 'gdrive'
                  ? {
                      accessToken: imageConfig.gdriveAccessToken,
                      folderId: imageConfig.gdriveFolderId,
                    }
                  : undefined,
            })
            insertFn(`![${file.name}](${result.relativePath})`, result.relativePath, dataUrl)
          } catch (error) {
            console.error('saveImage error', error)
          }
        }
        reader.readAsDataURL(file)
      }
    },
    [ensureImageProviderReady, getHoloApi, imageConfig],
  )

  return { handleImageFiles }
}
