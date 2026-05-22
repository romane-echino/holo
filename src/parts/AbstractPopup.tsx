import type { ReactNode } from "react";

type AbstractPopupSize = "sm" | "md" | "lg" | "xl" | "fullscreen";

interface AbstractPopupProps {
  open: boolean;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: AbstractPopupSize;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
}

const sizeClass: Record<AbstractPopupSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  fullscreen: "max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]",
};

export function AbstractPopup({
  open,
  title,
  description,
  children,
  footer,
  size = "md",
  onClose,
  closeOnBackdrop = true,
}: AbstractPopupProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close popup backdrop"
        className="absolute inset-0 bg-holo-bg/70 backdrop-blur-xl"
        onClick={closeOnBackdrop ? onClose : undefined}
      />

      <section
        role="dialog"
        aria-modal="true"
        className={[
          "relative z-10 flex w-full flex-col overflow-hidden rounded-holo-2xl border border-holo-border-soft",
          "bg-[#0B0F16]/92 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl",
          "ring-1 ring-white/[0.04]",
          sizeClass[size],
        ].join(" ")}
      >
        <header className="flex items-start justify-between gap-4 border-b border-holo-border-soft px-6 py-5">
          <div>
            {title && (
              <h2 className="text-lg font-semibold tracking-[-0.02em] text-holo-text">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm leading-6 text-holo-text-muted">
                {description}
              </p>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="rounded-holo-md px-2 py-1 text-holo-text-faint transition hover:bg-holo-glass-hover hover:text-holo-text"
              aria-label="Close popup"
            >
              ✕
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-holo-border-soft px-6 py-4">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}