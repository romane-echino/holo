const HEX_COLOR_REGEX = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i
const RGB_COLOR_REGEX = /^rgba?\(\s*[+-]?\d*\.?\d+%?\s*,\s*[+-]?\d*\.?\d+%?\s*,\s*[+-]?\d*\.?\d+%?(?:\s*,\s*(?:[+-]?\d*\.?\d+%?))?\s*\)$/i
const HSL_COLOR_REGEX = /^hsla?\(\s*[+-]?\d*\.?\d+(?:deg|grad|rad|turn)?\s*,\s*[+-]?\d*\.?\d+%\s*,\s*[+-]?\d*\.?\d+%(?:\s*,\s*(?:[+-]?\d*\.?\d+%?))?\s*\)$/i

export function getInlineColorPreview(value: string): string | null {
  const normalized = value.trim()
  if (!normalized) return null
  if (HEX_COLOR_REGEX.test(normalized)) return normalized
  if (RGB_COLOR_REGEX.test(normalized)) return normalized
  if (HSL_COLOR_REGEX.test(normalized)) return normalized
  return null
}