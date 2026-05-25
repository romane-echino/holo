type FontSizePopoverProps = {
  editorFontSize: number
  onEditorFontSizeChange?: (value: number) => void
}

export function FontSizePopover({
  editorFontSize,
  onEditorFontSizeChange,
}: FontSizePopoverProps) {
  const progress = ((editorFontSize - 50) / 100) * 100

  return (
    <div className="absolute right-0 top-10 z-50 w-64 overflow-hidden rounded-holo-2xl border border-holo-border-soft bg-holo-bg/95 p-4 shadow-[0_18px_70px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-holo-text">Taille du texte</div>
          <div className="mt-1 text-xs text-holo-text-faint">
            Ajuste le confort de lecture.
          </div>
        </div>

        <div className="rounded-holo-lg border border-holo-border-soft bg-holo-primary-surface px-2.5 py-1 text-sm font-semibold text-holo-primary-soft">
          {editorFontSize}%
        </div>
      </div>

      <div className="relative py-2">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-holo-glass"
         />

        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-holo-primary shadow-[0_0_24px_rgba(123,97,255,.35)]"
          style={{ width: `${progress}%` }}
        />

        <input
          type="range"
          min={50}
          max={150}
          step={10}
          value={editorFontSize}
          onChange={(e) => onEditorFontSizeChange?.(Number(e.target.value))}
          className="
            relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-thumb]:size-4
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border
            [&::-webkit-slider-thumb]:border-white/40
            [&::-webkit-slider-thumb]:bg-holo-primary
            [&::-webkit-slider-thumb]:shadow-[0_0_0_5px_rgba(123,97,255,.14),0_6px_18px_rgba(0,0,0,.35)]
            [&::-webkit-slider-thumb]:transition
            [&::-webkit-slider-thumb]:hover:scale-110
            [&::-moz-range-thumb]:size-4
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border
            [&::-moz-range-thumb]:border-white/40
            [&::-moz-range-thumb]:bg-holo-primary
          "
          style={{transform: 'translateY(2px)'}}
        />
      </div>

      <div className="mt-2 flex justify-between text-[10px] text-holo-text-faint">
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[80, 100, 120].map((size) => (
          <button
            key={size}
            onClick={() => onEditorFontSizeChange?.(size)}
            className={[
              'rounded-holo-md border px-2 py-1.5 text-xs transition active:scale-[0.98]',
              editorFontSize === size
                ? 'border-holo-primary/30 bg-holo-primary-surface text-holo-primary-soft'
                : 'border-holo-border-soft bg-holo-glass text-holo-text-muted hover:bg-holo-glass-hover hover:text-holo-text',
            ].join(' ')}
          >
            {size}%
          </button>
        ))}
      </div>
    </div>
  )
}