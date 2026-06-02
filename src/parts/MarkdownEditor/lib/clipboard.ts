export type ClipboardPayload = {
  plainText: string
  html: string
  markdown: string
}

export function setClipboardEventData(
  clipboardData: DataTransfer | null | undefined,
  payload: ClipboardPayload,
) {
  if (!clipboardData) return
  clipboardData.setData('text/plain', payload.plainText)
  clipboardData.setData('text/html', payload.html)
  clipboardData.setData('text/markdown', payload.markdown)
  clipboardData.setData('text/x-markdown', payload.markdown)
}

export async function writeClipboardPayload(payload: ClipboardPayload) {
  if (window.holo?.writeClipboardPayload) {
    try {
      await window.holo.writeClipboardPayload(payload)
      return
    } catch {
      await window.holo?.writeClipboardText?.(payload.plainText)
    }
  }

  if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
    if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard.write === 'function') {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([payload.plainText], { type: 'text/plain' }),
            'text/html': new Blob([payload.html], { type: 'text/html' }),
            'text/markdown': new Blob([payload.markdown], { type: 'text/markdown' }),
            'text/x-markdown': new Blob([payload.markdown], { type: 'text/x-markdown' }),
          }),
        ])
        return
      } catch {
        // Fallback plain text plus bas.
      }
    }

    if (typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(payload.plainText)
        return
      } catch {
        // Fallback Electron plus bas.
      }
    }
  }

  await window.holo?.writeClipboardText?.(payload.plainText)
}