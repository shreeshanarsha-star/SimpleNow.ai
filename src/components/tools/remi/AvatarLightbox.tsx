"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Full-size view of the assistant's photo. Closes on backdrop click,
// the close button, or Escape.
export default function AvatarLightbox({
  open,
  onClose,
  src,
  name,
  caption,
}: {
  open: boolean;
  onClose: () => void;
  src: string;
  name: string;
  caption?: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name} photo`}
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
    >
      <figure
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[min(520px,90vw)] bg-surface border border-border rounded-3xl shadow-soft overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/55 text-white text-xl leading-none flex items-center justify-center hover:bg-black/75"
        >
          ×
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} className="w-full max-h-[75vh] object-contain bg-page" />
        <figcaption className="px-5 py-3.5 border-t border-border text-center">
          <div className="font-bold text-ink">{name}</div>
          {caption && <div className="text-xs text-ink-muted mt-0.5">{caption}</div>}
        </figcaption>
      </figure>
    </div>,
    document.body,
  );
}
