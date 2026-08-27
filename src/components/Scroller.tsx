"use client";

import { forwardRef, useEffect, useRef, useState } from "react";

import Icon from "@/components/Icon";

// Shared animated-arrow scroll containers, used everywhere a native OS
// scrollbar would otherwise show. Native scrollbars are hidden via inline
// CSS on the scroll track; a small pulsing chevron button appears at
// whichever edge still has content to reveal, and clicking it does a
// smooth scrollBy -- so there's always a visible, animated way to move,
// including for desktop mouse users who'd otherwise have no affordance
// once the native scrollbar is hidden. Wheel/trackpad/touch scrolling
// still works normally; the arrows are a supplement, not a replacement.

export function HScroller({
  children,
  className = "",
  trackClassName = "",
}: {
  children: React.ReactNode;
  className?: string;
  trackClassName?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(280, el.clientWidth * 0.7), behavior: "smooth" });
  };

  // Tailwind's compiled stylesheet orders position utilities as
  // static/fixed/absolute/relative/sticky regardless of class-attribute
  // order, so unconditionally prefixing "relative" here would silently
  // beat a caller's "absolute"/"fixed"/"sticky" (equal specificity, later
  // in the sheet wins) -- the wrapper would stay in normal flow instead of
  // overlaying, growing the layout instead of floating over it. Only
  // default to relative when the caller hasn't already set a position.
  const hasPosition = /\b(absolute|fixed|sticky|static)\b/.test(className);

  return (
    <div className={`${hasPosition ? "" : "relative"} ${className}`}>
      <div
        ref={trackRef}
        onScroll={updateArrows}
        className={`overflow-x-auto ${trackClassName}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {children}
      </div>
      {canLeft && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Scroll left"
          className="absolute left-0 top-0 bottom-0 flex items-center px-1 bg-gradient-to-r from-surface via-surface/90 to-transparent"
        >
          <span className="w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted animate-pulse">
            <Icon name="chevronLeft" className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
      {canRight && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Scroll right"
          className="absolute right-0 top-0 bottom-0 flex items-center px-1 bg-gradient-to-l from-surface via-surface/90 to-transparent"
        >
          <span className="w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted animate-pulse">
            <Icon name="chevronRight" className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
    </div>
  );
}

// Vertical counterpart -- for any fixed/max-height panel (drawers, dropdown
// lists, JD text blocks, notification lists) that used a native
// overflow-y-auto scrollbar. Same hidden-scrollbar + pulsing chevron
// pattern, top/bottom instead of left/right.
export const VScroller = forwardRef<HTMLDivElement, {
  children: React.ReactNode;
  className?: string;
  trackClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}>(function VScroller({ children, className = "", trackClassName = "", onClick }, forwardedRef) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (node: HTMLDivElement | null) => {
    trackRef.current = node;
    if (typeof forwardedRef === "function") forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);

  const updateArrows = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanUp(el.scrollTop > 4);
    setCanDown(el.scrollTop < el.scrollHeight - el.clientHeight - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ top: dir * Math.min(160, el.clientHeight * 0.6), behavior: "smooth" });
  };

  // Same Tailwind cascade-order hazard as HScroller above -- don't force
  // "relative" when the caller already supplied a position utility (e.g.
  // "absolute ... bottom-[...]" to float this panel over other content).
  const hasPosition = /\b(absolute|fixed|sticky|static)\b/.test(className);

  return (
    <div className={`${hasPosition ? "" : "relative"} ${className}`} onClick={onClick}>
      <div
        ref={setRefs}
        onScroll={updateArrows}
        className={`overflow-y-auto ${trackClassName}`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {children}
      </div>
      {canUp && (
        <button
          onClick={() => scrollBy(-1)}
          aria-label="Scroll up"
          className="absolute left-0 right-0 top-0 flex justify-center pt-0.5 bg-gradient-to-b from-surface via-surface/90 to-transparent"
        >
          <span className="w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted animate-pulse">
            <Icon name="chevronUp" className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
      {canDown && (
        <button
          onClick={() => scrollBy(1)}
          aria-label="Scroll down"
          className="absolute left-0 right-0 bottom-0 flex justify-center pb-0.5 bg-gradient-to-t from-surface via-surface/90 to-transparent"
        >
          <span className="w-6 h-6 rounded-full border border-border bg-surface flex items-center justify-center text-ink-muted animate-pulse">
            <Icon name="chevronDown" className="w-3.5 h-3.5" />
          </span>
        </button>
      )}
    </div>
  );
});
