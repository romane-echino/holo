import type { CSSProperties } from 'react'
import { cn } from '../utils/global'
import { getInlineColorPreview } from '../lib/inlineColor'

interface InlineColorCodeProps {
  value: string
  className?: string
}

export function InlineColorCode({ value, className }: InlineColorCodeProps) {
  const previewColor = getInlineColorPreview(value)
  const style = previewColor
    ? ({ '--inline-color-preview': previewColor } as CSSProperties)
    : undefined

  return (
    <code
      className={cn(previewColor && 'inline-color-code', className)}
      data-inline-color={previewColor ?? undefined}
      style={style}
    >
      {value}
    </code>
  )
}