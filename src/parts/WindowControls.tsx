import React from "react";
import { Minus, Square, X } from 'lucide-react'

interface WindowControlsProps {
  side: "left" | "right";
}

const WindowControls: React.FC<WindowControlsProps> = ({ side }) => {
  const isMacOS = navigator.platform.toUpperCase().includes("MAC");

  if (side === "left" && !isMacOS) return null;
  if (side === "right" && isMacOS) return null;

  const minimize = () => window.holo?.minimizeWindow()
  const maximize = () => window.holo?.toggleMaximizeWindow()
  const close = () => window.holo?.closeWindow()

  if (isMacOS) {
    return (
      <div className="holo-no-drag flex items-center gap-2 hidden sm:flex">
        <button
          onClick={close}
          title="Close"
          aria-label="Close"
          className="size-3 rounded-full bg-[#FF5F57] shadow-[0_0_0_1px_rgba(0,0,0,.18)] transition-all duration-150 hover:scale-110 hover:brightness-110"
        />
        <button
          onClick={minimize}
          title="Minimize"
          aria-label="Minimize"
          className="size-3 rounded-full bg-[#FFBD2E] shadow-[0_0_0_1px_rgba(0,0,0,.18)] transition-all duration-150 hover:scale-110 hover:brightness-110"
        />
        <button
          onClick={maximize}
          title="Maximize"
          aria-label="Maximize"
          className="size-3 rounded-full bg-[#28C840] shadow-[0_0_0_1px_rgba(0,0,0,.18)] transition-all duration-150 hover:scale-110 hover:brightness-110"
        />
      </div>
    );
  }

  return (
    <div className="holo-no-drag flex items-center gap-1 text-holo-text-faint hidden sm:flex">
      <button
        onClick={minimize}
        title="Minimize"
        aria-label="Minimize"
        className="flex size-8 items-center justify-center rounded-holo-md transition-all duration-150 hover:bg-holo-glass-hover hover:text-holo-text"
      >
        <Minus size={12} />
      </button>

      <button
        onClick={maximize}
        title="Maximize"
        aria-label="Maximize"
        className="flex size-8 items-center justify-center rounded-holo-md transition-all duration-150 hover:bg-holo-glass-hover hover:text-holo-text"
      >
        <Square size={11} />
      </button>

      <button
        onClick={close}
        title="Close"
        aria-label="Close"
        className="flex size-8 items-center justify-center rounded-holo-md transition-all duration-150 hover:bg-holo-danger/85 hover:text-white"
      >
        <X size={13} />
      </button>
    </div>
  );
};

export default WindowControls;