"use client";

// Lets a tool's own component (e.g. ShortlistApp, rendered as AppShell's
// {children}) register a "go back to my home view" handler that the
// sibling Topbar can invoke when its title is clicked. Most tool pages
// never call useRegisterToolHome, so Topbar falls back to its current
// plain, non-interactive title -- this is additive, not a redesign.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type ToolHomeHandler = (() => void) | null;

const ToolHomeContext = createContext<{
  handler: ToolHomeHandler;
  register: (fn: ToolHomeHandler) => void;
} | null>(null);

export function ToolHomeProvider({ children }: { children: React.ReactNode }) {
  const [handler, setHandler] = useState<ToolHomeHandler>(null);
  const register = useCallback((fn: ToolHomeHandler) => setHandler(() => fn), []);
  return <ToolHomeContext.Provider value={{ handler, register }}>{children}</ToolHomeContext.Provider>;
}

// Used by Topbar: the current handler, or null if no tool below it registered one.
export function useToolHomeHandler(): ToolHomeHandler {
  const ctx = useContext(ToolHomeContext);
  return ctx?.handler ?? null;
}

// Used by a tool component to register its own "return to home view"
// callback, and unregister it on unmount. Pass a stable (useCallback'd) fn.
export function useRegisterToolHome(fn: () => void) {
  const ctx = useContext(ToolHomeContext);
  const register = ctx?.register;
  useEffect(() => {
    register?.(fn);
    return () => register?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, fn]);
}
