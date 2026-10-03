"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { search as s, fillSearch as fill } from "@/lib/nrs/i18n/en/search";
import {
  highlightParts,
  normalizeQuery,
  SEARCH_MAX,
  type SearchGroup,
  type SearchGroupKey,
  type SearchItem,
  type SearchResponse,
} from "@/lib/nrs/search";

// NR Synergy global search. Rendered by the layout above the section nav on
// every page. Ctrl/Cmd+K (or "/" outside a text field) focuses it; results
// come from GET /api/nr-synergy/search, which runs on the caller's RLS client.

const RECENT_KEY = "nrs.search.recent";
const RECENT_MAX = 5;
const DEBOUNCE_MS = 200;

const GROUP_ICON: Record<SearchGroupKey, string> = {
  actions: "zap",
  pages: "grid",
  people: "users",
  documents: "book",
  projects: "chart",
  tickets: "headset",
  posts: "megaphone",
  values: "award",
  links: "externalLink",
};

type Status = "idle" | "loading" | "ready" | "error";

type Option =
  | { kind: "recent"; id: string; query: string }
  | { kind: "result"; id: string; group: SearchGroupKey; item: SearchItem };

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // storage blocked (private mode etc.): recents just don't persist
  }
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? (
          <mark key={i} className="bg-brand-wash text-brand-dark rounded-[3px] px-[1px] font-semibold">
            {p.text}
          </mark>
        ) : (
          <Fragment key={i}>{p.text}</Fragment>
        )
      )}
    </>
  );
}

export default function GlobalSearch({ helpHref }: { helpHref: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const uid = useId().replace(/:/g, "");
  const inputId = `${uid}-input`;
  const listId = `${uid}-list`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [retryTick, setRetryTick] = useState(0);
  const [keys, setKeys] = useState("Ctrl K");
  const [narrow, setNarrow] = useState(false);

  const term = normalizeQuery(query);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setRecent(readRecent());
    if (typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)) {
      setKeys("⌘K");
    }
  }, []);

  // Global shortcuts: Ctrl/Cmd+K anywhere, "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      } else if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close when the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Debounced, abortable fetch.
  useEffect(() => {
    abortRef.current?.abort();
    if (!term) {
      setStatus("idle");
      setGroups([]);
      return;
    }
    setStatus("loading");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/nr-synergy/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as SearchResponse;
        if (ctrl.signal.aborted) return;
        setGroups(Array.isArray(body.groups) ? body.groups : []);
        setStatus("ready");
      } catch (err) {
        if (ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setGroups([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [term, retryTick]);

  const showRecent = !query.trim() && recent.length > 0;

  const options: Option[] = useMemo(() => {
    if (showRecent) return recent.map((r, i) => ({ kind: "recent" as const, id: `${uid}-r${i}`, query: r }));
    if (status !== "ready") return [];
    const out: Option[] = [];
    for (const g of groups) {
      g.items.forEach((item, i) => out.push({ kind: "result", id: `${uid}-${g.key}-${i}`, group: g.key, item }));
    }
    return out;
  }, [showRecent, recent, status, groups, uid]);

  // Reset the highlighted row whenever the option list changes.
  useEffect(() => {
    setActive(-1);
  }, [options]);

  // Keep the highlighted row in view.
  useEffect(() => {
    if (active < 0) return;
    const el = document.getElementById(options[active]?.id ?? "");
    el?.scrollIntoView({ block: "nearest" });
  }, [active, options]);

  const remember = useCallback((q: string) => {
    const n = normalizeQuery(q);
    if (!n) return;
    setRecent((prev) => {
      const next = [n, ...prev.filter((p) => p.toLowerCase() !== n.toLowerCase())].slice(0, RECENT_MAX);
      writeRecent(next);
      return next;
    });
  }, []);

  const clearRecent = () => {
    setRecent([]);
    writeRecent([]);
    inputRef.current?.focus();
  };

  const choose = (opt: Option) => {
    if (opt.kind === "recent") {
      setQuery(opt.query);
      setOpen(true);
      inputRef.current?.focus();
      return;
    }
    remember(query);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (opt.item.external) {
      window.open(opt.item.href, "_blank", "noopener,noreferrer");
    } else {
      router.push(opt.item.href);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((a) => (a + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      const opt = options[active >= 0 ? active : 0];
      if (open && opt && (active >= 0 || opt.kind === "result")) {
        e.preventDefault();
        choose(opt);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (open) setOpen(false);
      else if (query) setQuery("");
      else inputRef.current?.blur();
    } else if (e.key === "Home" && e.ctrlKey && options.length) {
      setActive(0);
    } else if (e.key === "End" && e.ctrlKey && options.length) {
      setActive(options.length - 1);
    }
  };

  const total = options.filter((o) => o.kind === "result").length;
  const hasBody = showRecent || !!query.trim();
  const panelOpen = open && hasBody;
  const activeId = panelOpen && active >= 0 ? options[active]?.id : undefined;

  let announce = "";
  if (panelOpen && term) {
    if (status === "loading") announce = s.loading;
    else if (status === "error") announce = s.error;
    else if (status === "ready") announce = total === 1 ? s.resultCountOne : fill(s.resultCount, { count: total });
  }

  const indexOf = new Map(options.map((o, i) => [o.id, i]));
  const optionClass = (on: boolean) =>
    `group flex items-center gap-3 rounded-xl px-2.5 py-2 cursor-pointer select-none transition-colors ${
      on ? "bg-brand-wash" : "hover:bg-page"
    }`;

  return (
    <div ref={rootRef} className="relative z-30 w-full">
      <label htmlFor={inputId} className="sr-only">
        {s.label}
      </label>
      <div className="flex items-center gap-2.5 bg-gradient-to-b from-[var(--search-bg-1)] to-[var(--search-bg-2)] border border-brand/[0.18] rounded-full pl-4 sm:pl-5 pr-2 py-1.5 sm:py-2 shadow-soft focus-within:border-brand/50 focus-within:ring-4 focus-within:ring-brand/10 transition-[border-color,box-shadow]">
        <Icon name="search" className="w-[17px] h-[17px] text-brand flex-shrink-0" />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          maxLength={SEARCH_MAX}
          value={query}
          placeholder={narrow ? s.placeholderShort : s.placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-[14px] py-1.5 text-ink placeholder:text-ink-muted text-ellipsis"
        />
        {query && (
          <button
            type="button"
            aria-label={s.clear}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="w-7 h-7 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-page flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        )}
        <kbd
          aria-hidden="true"
          title={fill(s.shortcutHint, { keys })}
          className="hidden sm:inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted font-sans flex-shrink-0 mr-1"
        >
          {keys}
        </kbd>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      {panelOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-surface/95 backdrop-blur-2xl border border-border shadow-2xl overflow-hidden">
          <div
            id={listId}
            role="listbox"
            aria-label={s.resultsLabel}
            className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain p-2"
          >
            {showRecent && (
              <div role="group" aria-labelledby={`${uid}-recent-h`}>
                <div className="flex items-center justify-between px-2.5 pt-1 pb-1.5">
                  <span id={`${uid}-recent-h`} className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                    {s.recent}
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={clearRecent}
                    className="text-[11px] font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                  >
                    {s.clearRecent}
                  </button>
                </div>
                {options.map((opt, i) => {
                  if (opt.kind !== "recent") return null;
                  return (
                    <div
                      key={opt.id}
                      id={opt.id}
                      role="option"
                      aria-selected={active === i}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(opt)}
                      className={optionClass(active === i)}
                    >
                      <Icon name="clock" className="w-4 h-4 text-ink-muted flex-shrink-0" />
                      <span className="text-[13px] text-ink-2 truncate">{opt.query}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {!showRecent && !term && (
              <p className="px-3 py-3 text-[12.5px] text-ink-muted">{s.minChars}</p>
            )}

            {!showRecent && term && status === "loading" && (
              <div aria-hidden="true" className="flex flex-col gap-1 p-1">
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                    <div className="w-8 h-8 rounded-lg bg-page flex-shrink-0" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="h-3 rounded bg-page" style={{ width: `${60 - k * 8}%` }} />
                      <div className="h-2.5 rounded bg-page/70" style={{ width: `${40 - k * 5}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!showRecent && term && status === "error" && (
              <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
                <span className="w-9 h-9 rounded-full bg-critical-wash text-critical flex items-center justify-center">
                  <Icon name="x" className="w-4 h-4" />
                </span>
                <p className="text-[13px] text-ink">{s.error}</p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setRetryTick((n) => n + 1)}
                  className="text-[12.5px] font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
                >
                  {s.retry}
                </button>
              </div>
            )}

            {!showRecent && term && status === "ready" && total === 0 && (
              <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
                <span className="w-10 h-10 rounded-full bg-brand-wash text-brand flex items-center justify-center mb-1">
                  <Icon name="search" className="w-[18px] h-[18px]" />
                </span>
                <p className="text-[13.5px] font-semibold text-ink break-words max-w-full">
                  {fill(s.noResultsTitle, { query: term })}
                </p>
                <p className="text-[12.5px] text-ink-muted">
                  {s.noResultsBody}{" "}
                  {helpHref && (
                    <Link
                      href={helpHref}
                      onClick={() => {
                        remember(query);
                        setOpen(false);
                      }}
                      className="font-semibold text-brand hover:underline"
                    >
                      {s.raiseTicket} →
                    </Link>
                  )}
                </p>
              </div>
            )}

            {!showRecent &&
              status === "ready" &&
              groups.map((g) => (
                <div key={g.key} role="group" aria-labelledby={`${uid}-${g.key}-h`} className="pb-1">
                  <div
                    id={`${uid}-${g.key}-h`}
                    className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted"
                  >
                    <Icon name={GROUP_ICON[g.key]} className="w-3 h-3" />
                    {g.label}
                  </div>
                  {g.items.map((item, n) => {
                    const i = indexOf.get(`${uid}-${g.key}-${n}`) ?? -1;
                    const opt = options[i];
                    if (!opt || opt.kind !== "result") return null;
                    const on = active === i;
                    return (
                      <div
                        key={opt.id}
                        id={opt.id}
                        role="option"
                        aria-selected={on}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(opt)}
                        className={optionClass(on)}
                      >
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                            on ? "bg-surface text-brand" : "bg-page text-ink-2 group-hover:text-brand"
                          }`}
                        >
                          <Icon name={item.icon || GROUP_ICON[g.key]} className="w-4 h-4" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold text-ink truncate">
                            <Highlight text={item.title} query={term ?? ""} />
                          </span>
                          {item.subtitle && (
                            <span className="block text-[11.5px] text-ink-muted truncate">
                              <Highlight text={item.subtitle} query={term ?? ""} />
                            </span>
                          )}
                        </span>
                        {item.external ? (
                          <>
                            <Icon name="externalLink" className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />
                            <span className="sr-only">{s.opensNewTab}</span>
                          </>
                        ) : (
                          <Icon
                            name="chevronRight"
                            className={`w-3.5 h-3.5 flex-shrink-0 transition-opacity ${on ? "text-brand opacity-100" : "opacity-0"}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>

          <div
            aria-hidden="true"
            className="hidden sm:flex items-center gap-4 border-t border-border/70 bg-page/60 px-4 py-2 text-[10.5px] text-ink-muted"
          >
            <span>
              <kbd className="font-sans font-semibold">↑</kbd> <kbd className="font-sans font-semibold">↓</kbd> {s.hintNavigate}
            </span>
            <span>
              <kbd className="font-sans font-semibold">Enter</kbd> {s.hintOpen}
            </span>
            <span>
              <kbd className="font-sans font-semibold">Esc</kbd> {s.hintClose}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
