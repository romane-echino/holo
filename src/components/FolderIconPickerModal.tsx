import EmojiPicker from 'emoji-picker-react'
import { Theme } from 'emoji-picker-react'

interface FolderIconPickerModalProps {
  folderPath: string
  folderIconByPath: Record<string, string>
  onSaveFolderIconConfig: (path: string, emoji: string) => Promise<void>
  onClose: () => void
}

export function FolderIconPickerModal({
  folderPath,
  folderIconByPath,
  onSaveFolderIconConfig,
  onClose,
}: FolderIconPickerModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1a1b1c] shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-white/8 px-6 py-4">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <i className="fa-regular fa-face-smile text-[#7B61FF]" />
            Changer l'icône du dossier
          </h2>
          <button
            className="text-white/40 hover:text-white transition-colors"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-white/50">Choisir une icône</span>
            {folderIconByPath[folderPath] && (
              <button
                className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/8 hover:text-white/70"
                onClick={() => {
                  void onSaveFolderIconConfig(folderPath, '')
                  onClose()
                }}
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-[#141515] p-2">
            <EmojiPicker
              width={380}
              height={380}
              theme={Theme.DARK}
              searchDisabled={false}
              skinTonesDisabled
              previewConfig={{ showPreview: false }}
              onEmojiClick={(emojiData) => {
                void onSaveFolderIconConfig(folderPath, emojiData.emoji)
                onClose()
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
