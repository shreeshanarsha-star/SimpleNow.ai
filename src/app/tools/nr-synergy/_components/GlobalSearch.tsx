"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { search as s, fillSearch as fill } from "@/lib/nrs/i18n/en/search";
import {
  answerParts,
  ASK_MAX,
  looksLikeQuestion,
  normalizeQuestion,
  type AskOrigin,
  type AskResponse,
  type AskSource,
} from "@/lib/nrs/ask";
import {
  highlightParts,
  normalizeQuery,
  SEARCH_MIN,
  type SearchGroup,
  type SearchGroupKey,
  type SearchItem,
  type SearchResponse,
} from "@/lib/nrs/search";

// NR Synergy global search. Rendered by the layout above the section nav on
// every page. Ctrl/Cmd+K (or "/" outside a text field) focuses it; results
// come from GET /api/nr-synergy/search, which runs on the caller's RLS client.
// A top "Ask NR Synergy" row (or the send button, or the mic) calls
// POST /api/nr-synergy/search/ask, which answers from company documents first
// and the web second, and shows a cited answer in the panel.

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
  joe: "award",
  links: "externalLink",
};

type Status = "idle" | "loading" | "ready" | "error";

interface AskState {
  status: Status;
  question: string;
  answer: string;
  sources: AskSource[];
  origin: AskOrigin;
  error: string | null;
}

const ASK_IDLE: AskState = { status: "idle", question: "", answer: "", sources: [], origin: "none", error: null };

// Minimal typing for the browser speech API (Chrome / Edge / Safari prefix it).
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SpeechCtor = new () => SpeechRec;
function speechCtor(): SpeechCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Option =
  | { kind: "ask"; id: string; question: string }
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

function SourceLink({
  src,
  onNavigate,
  className,
  children,
  label,
}: {
  src: AskSource;
  onNavigate: () => void;
  className: string;
  children: React.ReactNode;
  label?: string;
}) {
  if (src.external || /^https?:\/\//i.test(src.href)) {
    return (
      <a href={src.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className} aria-label={label}>
        {children}
      </a>
    );
  }
  return (
    <Link href={src.href} onClick={onNavigate} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

function AnswerPanel({
  ask,
  helpHref,
  onRetry,
  onNavigate,
}: {
  ask: AskState;
  helpHref: string | null;
  onRetry: () => void;
  onNavigate: () => void;
}) {
  const byN = new Map(ask.sources.map((src) => [src.n, src]));
  return (
    <section
      aria-label={s.ask.heading}
      aria-busy={ask.status === "loading"}
      className="mb-2 rounded-xl border border-brand/20 bg-brand-wash/40 p-3 sm:p-3.5"
    >
      <div className="flex items-center gap-2 mb-2 min-w-0">
        <span className="w-6 h-6 rounded-md bg-brand text-white flex items-center justify-center flex-shrink-0">
          <Icon name="sparkle" className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand-dark flex-shrink-0">{s.ask.heading}</span>
        <span className="text-[11.5px] text-ink-muted truncate min-w-0 flex-1">“{ask.question}”</span>
        {ask.status === "ready" && ask.origin !== "none" && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold flex-shrink-0 ${
              ask.origin === "web" ? "bg-warning-wash text-ink-2" : "bg-surface text-brand-dark border border-brand/20"
            }`}
          >
            <Icon name={ask.origin === "web" ? "globe" : "book"} className="w-3 h-3" />
            {ask.origin === "web" ? s.ask.fromWeb : s.ask.fromCompany}
          </span>
        )}
      </div>

      {ask.status === "loading" && (
        <div>
          <p className="sr-only">{s.ask.thinking}</p>
          <div aria-hidden="true" className="flex flex-col gap-2 py-1 animate-pulse">
            {[92, 84, 88, 56].map((w, k) => (
              <div key={k} className="h-3 rounded bg-surface" style={{ width: `${w}%` }} />
            ))}
            <p className="pt-1 text-[11.5px] text-ink-muted">{s.ask.thinking}</p>
          </div>
        </div>
      )}

      {ask.status === "error" && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-[13px] text-ink break-words">{ask.error ?? s.ask.error}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onRetry}
              className="text-[12.5px] font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
            >
              {s.ask.retry}
            </button>
            {helpHref && (
              <Link href={helpHref} onClick={onNavigate} className="text-[12.5px] font-semibold text-brand hover:underline">
                {s.ask.raiseTicket} →
              </Link>
            )}
          </div>
        </div>
      )}

      {ask.status === "ready" && (
        <>
          <p className="text-[13.5px] leading-relaxed text-ink whitespace-pre-line break-words">
            {answerParts(ask.answer).map((part, i) => {
              if ("text" in part) return <Fragment key={i}>{part.text}</Fragment>;
              const src = byN.get(part.cite);
              if (!src) return <Fragment key={i}>[{part.cite}]</Fragment>;
              return (
                <SourceLink
                  key={i}
                  src={src}
                  onNavigate={onNavigate}
                  label={`${s.ask.sources} ${src.n}: ${src.title}`}
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 mx-[1px] align-[2px] rounded-full bg-brand text-white text-[10px] font-bold no-underline hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
                >
                  {src.n}
                </SourceLink>
              );
            })}
          </p>

          {ask.sources.length > 0 && (
            <div className="mt-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted mb-1">{s.ask.sources}</p>
              <ol className="flex flex-col gap-0.5">
                {ask.sources.map((src) => (
                  <li key={src.n}>
                    <SourceLink
                      src={src}
                      onNavigate={onNavigate}
                      className="group flex items-start gap-2 rounded-lg px-1.5 py-1 text-[12.5px] text-ink-2 hover:bg-surface hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <span className="mt-[1px] inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-surface border border-brand/30 text-brand text-[10px] font-bold flex-shrink-0">
                        {src.n}
                      </span>
                      <span className="flex-1 min-w-0 break-words">{src.title}</span>
                      {(src.external || /^https?:\/\//i.test(src.href)) && (
                        <>
                          <Icon name="externalLink" className="w-3.5 h-3.5 mt-[2px] text-ink-muted flex-shrink-0" />
                          <span className="sr-only">{s.opensNewTab}</span>
                        </>
                      )}
                    </SourceLink>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
            <span>{ask.origin === "web" ? s.ask.webNote : s.ask.disclaimer}</span>
            {helpHref && ask.sources.length === 0 && (
              <Link href={helpHref} onClick={onNavigate} className="font-semibold text-brand hover:underline">
                {s.ask.raiseTicket} →
              </Link>
            )}
          </div>
        </>
      )}
    </section>
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
  const askAbortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [retryTick, setRetryTick] = useState(0);
  const [keys, setKeys] = useState("Ctrl K");
  const [narrow, setNarrow] = useState(false);
  const [ask, setAsk] = useState<AskState>(ASK_IDLE);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  // Below SEARCH_MIN there is nothing to fetch (the API would 400): the panel shows the min-chars hint.
  const normalized = normalizeQuery(query);
  const term = normalized && normalized.trim().length >= SEARCH_MIN ? normalized : null;
  const question = normalizeQuestion(query);
  const isQuestion = looksLikeQuestion(query);
  // The panel's answer belongs to the question currently in the box.
  const askCurrent = ask.status !== "idle" && !!question && ask.question === question;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setCanSpeak(!!speechCtor());
    return () => recRef.current?.stop();
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

  // Editing the question drops a stale answer (and any request in flight).
  useEffect(() => {
    if (ask.status !== "idle" && ask.question !== question) {
      askAbortRef.current?.abort();
      setAsk(ASK_IDLE);
    }
  }, [question, ask.status, ask.question]);

  useEffect(() => () => askAbortRef.current?.abort(), []);

  const runAsk = useCallback(async (q: string) => {
    askAbortRef.current?.abort();
    const ctrl = new AbortController();
    askAbortRef.current = ctrl;
    setAsk({ ...ASK_IDLE, status: "loading", question: q });
    try {
      const res = await fetch("/api/nr-synergy/search/ask", {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = (await res.json().catch(() => null)) as (Partial<AskResponse> & { error?: string }) | null;
      if (ctrl.signal.aborted) return;
      if (!res.ok || !body || typeof body.answer !== "string") {
        setAsk({ ...ASK_IDLE, status: "error", question: q, error: typeof body?.error === "string" ? body.error : null });
        return;
      }
      setAsk({
        status: "ready",
        question: q,
        answer: body.answer,
        sources: Array.isArray(body.sources) ? body.sources : [],
        origin: body.origin === "internal" || body.origin === "web" ? body.origin : "none",
        error: null,
      });
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
      setAsk({ ...ASK_IDLE, status: "error", question: q, error: null });
    }
  }, []);

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

  // The ask row is offered for a question that hasn't been answered (or is loading) yet.
  const showAskRow = !showRecent && !!question && !(askCurrent && (ask.status === "loading" || ask.status === "ready"));

  const options: Option[] = useMemo(() => {
    if (showRecent) return recent.map((r, i) => ({ kind: "recent" as const, id: `${uid}-r${i}`, query: r }));
    const out: Option[] = [];
    if (showAskRow && question) out.push({ kind: "ask", id: `${uid}-ask`, question });
    if (status !== "ready") return out;
    for (const g of groups) {
      g.items.forEach((item, i) => out.push({ kind: "result", id: `${uid}-${g.key}-${i}`, group: g.key, item }));
    }
    return out;
  }, [showRecent, recent, status, groups, uid, showAskRow, question]);

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
    if (opt.kind === "ask") {
      remember(opt.question);
      void runAsk(opt.question);
      inputRef.current?.focus();
      return;
    }
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
      // With nothing highlighted: a question goes to Ask; a keyword opens the
      // best result (or asks when nothing matched).
      const firstResult = options.findIndex((o) => o.kind === "result");
      const pick = active >= 0 ? active : !isQuestion && firstResult >= 0 ? firstResult : 0;
      const opt = options[pick];
      if (open && opt) {
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
  const showAnswer = !showRecent && askCurrent;
  const closeAfterLink = () => {
    remember(ask.question || query);
    setOpen(false);
  };
  const panelOpen = open && hasBody;
  const activeId = panelOpen && active >= 0 ? options[active]?.id : undefined;

  let announce = "";
  if (panelOpen && showAnswer) {
    if (ask.status === "loading") announce = s.ask.thinking;
    else if (ask.status === "error") announce = ask.error ?? s.ask.error;
    else if (ask.status === "ready") announce = ask.answer;
  } else if (panelOpen && term) {
    if (status === "loading") announce = s.loading;
    else if (status === "error") announce = s.error;
    else if (status === "ready") announce = total === 1 ? s.resultCountOne : fill(s.resultCount, { count: total });
  }

  const sendAsk = () => {
    if (!question) {
      inputRef.current?.focus();
      return;
    }
    remember(question);
    setOpen(true);
    void runAsk(question);
    inputRef.current?.focus();
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText = text;
      }
      setQuery(text.slice(0, ASK_MAX));
      setOpen(true);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const q = normalizeQuestion(finalText);
      if (q) {
        remember(q);
        void runAsk(q);
      }
    };
    recRef.current = rec;
    setListening(true);
    setOpen(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const indexOf = new Map(options.map((o, i) => [o.id, i]));
  const optionClass = (on: boolean) =>
    `group flex items-center gap-3 rounded-xl px-2.5 py-2 cursor-pointer select-none transition-colors ${
      on ? "bg-brand-wash" : "hover:bg-page"
    }`;

  return (
    <div ref={rootRef} className={`relative w-full max-w-[880px] mx-auto py-1 sm:py-2 ${panelOpen ? "z-30" : "z-[1]"}`}>
      <label htmlFor={inputId} className="sr-only">
        {s.label}
      </label>
      <div className="nrs-search-3d group/bar flex items-center gap-2 sm:gap-3 rounded-[22px] sm:rounded-[26px] border border-border bg-gradient-to-b from-[var(--search-bg-1)] to-[var(--search-bg-2)] pl-2.5 sm:pl-3 pr-2 sm:pr-2.5 py-2 sm:py-2.5 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[1px] focus-within:-translate-y-[1px] focus-within:border-brand/45">
        <span
          aria-hidden="true"
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-[14px] flex items-center justify-center flex-shrink-0 text-white bg-gradient-to-br from-brand to-brand-dark shadow-[inset_0_1px_0_rgba(255,255,255,.35),0_4px_10px_-2px_rgb(var(--brand-rgb)/0.45)]"
        >
          <Icon name="sparkle" className="w-[18px] h-[18px]" />
        </span>
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
          maxLength={ASK_MAX}
          value={query}
          placeholder={listening ? s.listening : narrow ? s.placeholderShort : s.placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 border-none outline-none bg-transparent text-[15px] sm:text-[15.5px] py-2 text-ink placeholder:text-ink-muted text-ellipsis"
        />
        {query && !listening && (
          <button
            type="button"
            aria-label={s.clear}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:text-ink hover:bg-page flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="x" className="w-3.5 h-3.5" />
          </button>
        )}
        <kbd
          aria-hidden="true"
          title={fill(s.shortcutHint, { keys })}
          className="hidden md:inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted font-sans flex-shrink-0"
        >
          {keys}
        </kbd>
        {canSpeak && (
          <button
            type="button"
            aria-label={listening ? s.micStop : s.mic}
            aria-pressed={listening}
            title={listening ? s.micStop : s.mic}
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleMic}
            className={`relative w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              listening ? "bg-critical text-white border-critical" : "bg-surface text-ink-2 border-border hover:text-brand hover:border-brand/40"
            }`}
          >
            {listening && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-critical/40 animate-ping" />}
            <Icon name={listening ? "stop" : "mic"} className="relative w-[17px] h-[17px]" />
          </button>
        )}
        <button
          type="button"
          aria-label={s.ask.send}
          title={s.ask.send}
          disabled={!question || (askCurrent && ask.status === "loading")}
          onMouseDown={(e) => e.preventDefault()}
          onClick={sendAsk}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white bg-gradient-to-b from-brand to-brand-dark shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_3px_8px_-2px_rgb(var(--brand-rgb)/0.5)] transition-[opacity,transform] hover:scale-[1.04] active:scale-95 disabled:opacity-35 disabled:hover:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Icon name="arrowUp" className="w-[17px] h-[17px]" />
        </button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>

      {panelOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-[22px] bg-surface/95 backdrop-blur-2xl border border-border shadow-[0_24px_60px_-12px_rgba(16,24,40,.28),0_8px_20px_-8px_rgba(16,24,40,.14)] overflow-hidden">
          <div className="max-h-[min(70vh,520px)] overflow-y-auto overscroll-contain p-2">
          {showAnswer && (
            <AnswerPanel
              ask={ask}
              helpHref={helpHref}
              onRetry={() => void runAsk(ask.question)}
              onNavigate={closeAfterLink}
            />
          )}
          <div id={listId} role="listbox" aria-label={s.resultsLabel}>
            {options[0]?.kind === "ask" && (
              <div
                id={options[0].id}
                role="option"
                aria-selected={active === 0}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(0)}
                onClick={() => choose(options[0])}
                className={`${optionClass(active === 0)} mb-1 border border-brand/20`}
              >
                <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-brand text-white">
                  <Icon name="sparkle" className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-ink break-words line-clamp-2">
                    {fill(s.ask.row, { question: options[0].question })}
                  </span>
                  <span className="block text-[11.5px] text-ink-muted truncate">
                    {s.ask.rowHint}
                  </span>
                </span>
                <kbd
                  aria-hidden="true"
                  className={`hidden sm:inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-muted font-sans flex-shrink-0 ${
                    active === 0 || active < 0 ? "opacity-100" : "opacity-0"
                  }`}
                >
                  Enter
                </kbd>
              </div>
            )}

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

            {!showRecent && !term && !isQuestion && (
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

            {!showRecent && term && status === "ready" && total === 0 && !question && (
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
