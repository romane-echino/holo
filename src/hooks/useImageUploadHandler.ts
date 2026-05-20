import { useCallback } from 'react'
import { useConfig } from '../contexts/ConfigContext'

export function useImageUploadHandler({
  getHoloApi,
  ensureImageProviderReady,
}: {
  getHoloApi: () => Window['holo'] | null
  ensureImageProviderReady: () => boolean
}) {
  const {
    repoImageStorageMode, azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey,
    s3Endpoint, s3PublicBaseUrl, dropboxAccessToken, dropboxFolderPath,
    gdriveAccessToken, gdriveFolderId,
  } = useConfig()
  const imageConfig = {
    mode: repoImageStorageMode,
    azureBlobContainerUrl, azureBlobSasToken,
    s3Region, s3Bucket, s3AccessKeyId, s3SecretAccessKey,
    s3Endpoint, s3PublicBaseUrl, dropboxAccessToken, dropboxFolderPath,
    gdriveAccessToken, gdriveFolderId,
  }
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
