export type ClipboardPayload = {
  html: string
  markdown: string
}

export function setClipboardEventData(
  clipboardData: DataTransfer | null | undefined,
  payload: ClipboardPayload,
) {
  if (!clipboardData) return
  clipboardData.setData('text/plain', payload.markdown)
  clipboardData.setData('text/html', payload.html)
}