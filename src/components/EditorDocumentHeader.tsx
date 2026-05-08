import React from 'react'
import EmojiPicker, { Theme } from 'emoji-picker-react'
import type { EditableMarkdownHeader, FilePathStats } from '../types/editor'

export type EditorDocumentHeaderProps = {
  isCompactLayout: boolean
  editableHeader: EditableMarkdownHeader
  isEditorReadOnly: boolean
  showEmojiPicker: boolean
  setShowEmojiPicker: React.Dispatch<React.SetStateAction<boolean>>
  titleInputRef: React.RefObject<HTMLInputElement | null>
  activePathStats?: FilePathStats | null
  formatReadonlyDate: (value?: string | null) => string
  updateEditableHeader: (field: keyof EditableMarkdownHeader, value: string) => void
  updateTags: (tags: string[]) => void
  showTagInput: boolean
  setShowTagInput: React.Dispatch<React.SetStateAction<boolean>>
  tagInput: string
  setTagInput: React.Dispatch<React.SetStateAction<string>>
}

export const EditorDocumentHeader: React.FC<EditorDocumentHeaderProps> = ({
  isCompactLayout,
  editableHeader,
  isEditorReadOnly,
  showEmojiPicker,
  setShowEmojiPicker,
  titleInputRef,
  activePathStats,
  formatReadonlyDate,
  updateEditableHeader,
  updateTags,
  showTagInput,
  setShowTagInput,
  tagInput,
  setTagInput,
}) => {
  return (
    <>
      <div className="mb-3">
        <div className="relative mb-2">
          <button
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-xl transition-colors ${
              editableHeader.icon
                ? 'hover:bg-white/8'
                : 'opacity-0 hover:opacity-100 hover:bg-white/8 focus:opacity-100'
            } group-hover:opacity-100`}
            disabled={isEditorReadOnly}
            onClick={() => setShowEmojiPicker((v) => !v)}
            title="Ajouter une icône"
          >
            {editableHeader.icon ? (
              <span>{editableHeader.icon}</span>
            ) : (
              <i className="fa-regular fa-face-smile text-lg text-white/25" />
            )}
          </button>

          {showEmojiPicker && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowEmojiPicker(false)}
              />
              <div className="absolute left-0 top-12 z-50 rounded-xl border border-white/10 bg-[#1a1b1c] p-2 shadow-2xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-white/50">Choisir une icône</span>
                  {editableHeader.icon && (
                    <button
                      className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/8 hover:text-white/70"
                      onClick={() => { updateEditableHeader('icon', ''); setShowEmojiPicker(false) }}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
                <EmojiPicker
                  width={320}
                  height={380}
                  theme={Theme.DARK}
                  searchDisabled={false}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  onEmojiClick={(emojiData) => {
                    updateEditableHeader('icon', emojiData.emoji)
                    setShowEmojiPicker(false)
                  }}
                />
              </div>
            </>
          )}
        </div>

        <input
          ref={titleInputRef}
          className={`w-full bg-transparent font-bold leading-tight text-white outline-none placeholder:text-white/20 ${isCompactLayout ? 'text-[1.8rem]' : 'text-[2.15rem]'}`}
          value={editableHeader.title}
          readOnly={isEditorReadOnly}
          onChange={(event) => updateEditableHeader('title', event.target.value)}
          placeholder="Sans titre"
        />
      </div>

      <textarea
        className="mb-5 w-full resize-none bg-transparent text-sm leading-7 text-white/55 outline-none placeholder:text-white/20"
        rows={2}
        value={editableHeader.description}
        readOnly={isEditorReadOnly}
        onChange={(event) => updateEditableHeader('description', event.target.value)}
        placeholder="Ajouter une description…"
      />

      <div className="mb-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/8 pb-6 text-xs text-white/30">
        <span className="flex items-center gap-1">
          <i className="fa-regular fa-user text-[10px]" />
          <input
            className="bg-transparent outline-none placeholder:text-white/20 hover:text-white/60 focus:text-white/80"
            value={editableHeader.author}
            readOnly={isEditorReadOnly}
            onChange={(event) => updateEditableHeader('author', event.target.value)}
            placeholder="Auteur"
            size={Math.max(editableHeader.author.length, 6)}
          />
        </span>
        <span className="flex items-center gap-1">
          <i className="fa-regular fa-calendar text-[10px]" />
          {formatReadonlyDate(activePathStats?.createdAt)}
        </span>
        <span className="flex items-center gap-1">
          <i className="fa-regular fa-clock text-[10px]" />
          {formatReadonlyDate(activePathStats?.modifiedAt)}
        </span>
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-1.5">
        {editableHeader.tags.map((tag) => (
          <span
            key={tag}
            className="group flex items-center gap-1 rounded-full border border-[#7B61FF]/30 bg-[#7B61FF]/10 px-2.5 py-0.5 text-xs text-[#9d8bff]"
          >
            {tag}
            <button
              className="ml-0.5 text-[#9d8bff]/50 hover:text-[#9d8bff] transition-colors"
              disabled={isEditorReadOnly}
              onClick={() => updateTags(editableHeader.tags.filter((t) => t !== tag))}
              title="Supprimer ce tag"
            >
              <i className="fa-solid fa-xmark text-[9px]" />
            </button>
          </span>
        ))}
        {showTagInput ? (
          <input
            autoFocus
            className="rounded-full border border-[#7B61FF]/40 bg-[#7B61FF]/10 px-2.5 py-0.5 text-xs text-[#9d8bff] outline-none placeholder:text-[#9d8bff]/30 w-24"
            placeholder="Tag…"
            value={tagInput}
            readOnly={isEditorReadOnly}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                const val = tagInput.trim().replace(/,/g, '')
                if (val && !editableHeader.tags.includes(val)) {
                  updateTags([...editableHeader.tags, val])
                }
                setTagInput('')
                setShowTagInput(false)
              }
              if (e.key === 'Escape') {
                setTagInput('')
                setShowTagInput(false)
              }
            }}
            onBlur={() => {
              const val = tagInput.trim()
              if (val && !editableHeader.tags.includes(val)) {
                updateTags([...editableHeader.tags, val])
              }
              setTagInput('')
              setShowTagInput(false)
            }}
          />
        ) : (
          <button
            className="flex items-center gap-1 rounded-full border border-dashed border-white/15 px-2.5 py-0.5 text-xs text-white/25 hover:border-[#7B61FF]/40 hover:text-[#9d8bff] transition-colors"
            disabled={isEditorReadOnly}
            onClick={() => setShowTagInput(true)}
          >
            <i className="fa-solid fa-plus text-[9px]" />
            Ajouter un tag
          </button>
        )}
      </div>
    </>
  )
}
