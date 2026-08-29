"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { VScroller } from "./Scroller";
import { ALL_ITEMS } from "@/lib/departments";

type ResultType = "text" | "search" | "weather" | "currency" | "calc" | "clarify" | "navigate" | "candidates" | "todo";

type FeedTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  resultType?: ResultType;
  resultData?: Record<string, unknown> | null;
};

const STORAGE_KEY = "askShreeConversationId";

// Some tool pages (Talent.ai) keep their own internal tab state that a
// same-URL router.push can't reset -- Next treats navigating to the exact
// URL you're already on as a no-op, so a user sitting on e.g. the Admin
// tab who asks Ask Shree to "open Talent.ai" would otherwise be left
// exactly where they were. Dispatching this event lets that page's own
// component reset itself locally when routing alone won't trigger it.
function goToFeature(router: ReturnType<typeof useRouter>, href: string) {
  try {
    if (typeof window !== "undefined") {
      const targetPath = href.split("?")[0];
      if (window.location.pathname === targetPath) {
        window.dispatchEvent(new CustomEvent("askshree:same-page-nav", { detail: { pathname: targetPath } }));
      }
    }
  } catch {
    // non-fatal -- worst case the same-page reset doesn't fire and the
    // user just stays on their current tab, no different from today
  }
  router.push(href);
}

// Speech Recognition isn't in the standard TS DOM lib -- narrow, local typing
// for just what we use, rather than pulling in a whole ambient-types package.
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } }; length?: number }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Persistent command bar, sticky to the viewport bottom in the main
// column -- lands on the exact same horizontal line as Sidebar's bottom
// profile/settings row (both are pinned to the bottom of a `h-screen`
// column), so the two together read as one continuous bottom strip
// across the whole app, on every page, not just Overview.
//
// Behavior: an exact/near match against a real tool or department name
// still navigates instantly with no AI call (fast path, unchanged). Any
// other request -- questions, conversions, searches, follow-ups -- goes
// to Ask Shree, the agent behind /api/ask-shree/query, and renders an
// interactive result above the bar instead of a plain "not found" message.
export default function GlobalSearchBar() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [notFoundMsg, setNotFoundMsg] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Reload prior turns on mount so a page refresh doesn't lose context.
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) return;
    conversationIdRef.current = saved;
    fetch(`/api/ask-simple/conversations/${saved}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.messages?.length) return;
        setFeed(
          data.messages.map((m: { id: string; role: "user" | "assistant"; content: string; result_type?: ResultType; result_data?: Record<string, unknown> | null }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            resultType: m.result_type,
            resultData: m.result_data,
          }))
        );
      })
      .catch(() => {
        // Stale/foreign id, or offline -- fall back to a clean slate.
        localStorage.removeItem(STORAGE_KEY);
        conversationIdRef.current = null;
      });
  }, []);

  function findLocalMatch(query: string) {
    for (const dept of ALL_ITEMS) {
      const tool = dept.tools.find((t) => t.n.toLowerCase().includes(query));
      if (tool && tool.s === "live" && tool.href) return { href: tool.href };
      if (tool) return { href: `/departments/${dept.id}?tool=${encodeURIComponent(tool.n)}` };
      if (dept.name.toLowerCase().includes(query)) return { href: `/departments/${dept.id}` };
    }
    return null;
  }

  async function askShree(text: string) {
    setBusy(true);
    const userTurn: FeedTurn = { id: `u-${Date.now()}`, role: "user", content: text };
    setFeed((f) => [...f, userTurn]);
    try {
      let lat: number | undefined;
      let lon: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) return reject(new Error("no geolocation"));
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 2500 });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        // No permission / no support -- the agent's weather tool falls
        // back to a default location automatically.
      }

      const res = await fetch("/api/ask-simple/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId: conversationIdRef.current,
          clientLat: lat,
          clientLon: lon,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Ask Simple couldn't process that.");

      conversationIdRef.current = data.conversationId;
      if (typeof window !== "undefined" && data.conversationId) {
        localStorage.setItem(STORAGE_KEY, data.conversationId);
      }
      setFeed((f) => [
        ...f,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.reply,
          resultType: data.resultType,
          resultData: data.resultData,
        },
      ]);

      // A clear "go here" / "do this" intent that the user actually has
      // access to -- let them see the confirmation for a beat, then take
      // them there, same as the existing exact-name fast path already does.
      if (data.resultType === "navigate" && data.resultData?.hasAccess && data.resultData?.href) {
        setTimeout(() => goToFeature(router, data.resultData.href as string), 700);
      }
    } catch (err) {
      setFeed((f) => [
        ...f,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function runSearch() {
    const raw = q.trim();
    const query = raw.toLowerCase();
    if (!query || busy) return;
    setNotFoundMsg(null);
    setQ("");

    const match = findLocalMatch(query);
    if (match) {
      goToFeature(router, match.href);
      return;
    }
    askShree(raw);
  }

  function toggleMic() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setNotFoundMsg("Voice input isn't supported in this browser -- try Chrome or Edge.");
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) {
        setQ("");
        askShree(transcript);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="px-[26px] pb-8 pt-2">
      <div className="w-full max-w-[680px] mx-auto relative">
        {feed.length > 0 && (
          <VScroller
            className="absolute bottom-[calc(100%+10px)] left-0 right-0 max-h-[360px]"
            trackClassName="max-h-[360px] flex flex-col gap-2 pb-1"
          >
            {busy && (
              <div className="self-start bg-surface border border-border rounded-md px-3.5 py-2 text-[12.5px] text-ink-muted shadow-soft-sm">
                Ask Simple is thinking…
              </div>
            )}
            {/* Newest exchange first -- reading the most recent answer
                shouldn't require scrolling past the whole history first.
                Group into [user, assistant] pairs (how they're always
                appended) and reverse pair order, not per-message order,
                so each question still reads directly above its own
                answer -- only which exchange comes first flips. */}
            {(() => {
              const pairs: FeedTurn[][] = [];
              for (let i = 0; i < feed.length; i += 2) {
                pairs.push(feed.slice(i, i + 2));
              }
              return pairs
                .slice()
                .reverse()
                .map((pair) =>
                  pair.map((turn) => <FeedCard key={turn.id} turn={turn} />)
                );
            })()}
          </VScroller>
        )}
        {notFoundMsg && feed.length === 0 && (
          <p className="absolute bottom-[calc(100%+8px)] left-0 right-0 text-center text-[12px] text-ink-muted">
            {notFoundMsg}
          </p>
        )}
        <div className="flex items-center gap-2.5 bg-gradient-to-b from-[var(--search-bg-1)] to-[var(--search-bg-2)] border border-brand/[0.18] rounded-full pl-5 pr-2 py-2.5 shadow-soft focus-within:border-brand/40 transition-colors">
          <Icon name="search" className="w-4 h-4 text-ink-muted flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={listening ? "Listening…" : "Ask Simple anything, or search departments or tools…"}
            className="border-none outline-none bg-transparent text-[13.5px] w-full py-1 text-ink placeholder:text-ink-muted"
            disabled={busy}
          />
          <button
            type="button"
            onClick={toggleMic}
            aria-label="Ask Simple with your voice"
            className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
              listening
                ? "border-brand/40 bg-brand-wash text-brand animate-pulse"
                : "border-border bg-page text-ink-2 hover:border-border-strong hover:text-ink"
            }`}
          >
            <Icon name="mic" className="w-[14px] h-[14px]" />
          </button>
          <button
            onClick={runSearch}
            aria-label="Search"
            disabled={busy}
            className="w-8 h-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--accent-btn-1),var(--accent-btn-2))] text-white border-none flex items-center justify-center flex-shrink-0 shadow-button hover:brightness-110 transition-all disabled:opacity-60"
          >
            <Icon name="arrowUp" className="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedCard({ turn }: { turn: FeedTurn }) {
  if (turn.role === "user") {
    return (
      <div className="self-end max-w-[85%] bg-brand-wash text-ink rounded-md px-3.5 py-2 text-[13px] shadow-soft-sm">
        {turn.content}
      </div>
    );
  }

  const data = turn.resultData;

  if (turn.resultType === "search" && data && Array.isArray(data.results)) {
    const results = data.results as Array<{ title: string; link: string; snippet: string }>;
    const answerBox = data.answerBox as { title?: string | null; answer?: string | null } | null;
    return (
      <div className="self-start w-full bg-surface border border-border rounded-md p-3.5 shadow-soft-sm flex flex-col gap-2.5">
        <p className="m-0 text-[13px] text-ink">{turn.content}</p>
        {answerBox?.answer && (
          <div className="text-[12.5px] text-ink-2 border-l-2 border-brand/40 pl-2.5">{answerBox.answer}</div>
        )}
        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            {results.slice(0, 5).map((r, i) => (
              <a
                key={i}
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block border border-border rounded-sm px-2.5 py-2 hover:border-border-strong transition-colors"
              >
                <div className="text-[12.5px] font-semibold text-brand truncate">
                  {i + 1}. {r.title}
                </div>
                <div className="text-[11.5px] text-ink-muted line-clamp-2">{r.snippet}</div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (turn.resultType === "weather" && data) {
    const current = data.current as { tempC?: number; icon?: string; label?: string } | undefined;
    const tomorrow = data.tomorrow as { maxC?: number; minC?: number; label?: string } | undefined;
    return (
      <div className="self-start w-full bg-surface border border-border rounded-md p-3.5 shadow-soft-sm flex items-center gap-4">
        <div className="w-9 h-9 rounded-full bg-brand-wash flex items-center justify-center flex-shrink-0">
          <Icon name={current?.icon || "cloud"} className="w-[18px] h-[18px] text-brand" />
        </div>
        <div className="flex-1">
          <div className="text-[13px] text-ink">{turn.content}</div>
          <div className="text-[11.5px] text-ink-muted mt-0.5">
            {String(data.locationLabel || "")}
            {current?.tempC != null ? ` -- ${Math.round(current.tempC)}°C, ${current.label || ""}` : ""}
            {tomorrow ? ` -- tomorrow ${Math.round(tomorrow.maxC ?? 0)}°/${Math.round(tomorrow.minC ?? 0)}° ${tomorrow.label || ""}` : ""}
          </div>
        </div>
      </div>
    );
  }

  if (turn.resultType === "currency" && data) {
    return (
      <div className="self-start w-full bg-surface border border-border rounded-md p-3.5 shadow-soft-sm">
        <div className="text-[15px] font-semibold text-ink">
          {String(data.amount)} {String(data.from)} = {String(data.converted)} {String(data.to)}
        </div>
        <div className="text-[11.5px] text-ink-muted mt-0.5">Rate: 1 {String(data.from)} = {String(data.rate)} {String(data.to)}</div>
      </div>
    );
  }

  if (turn.resultType === "candidates" && data && data.requisitionFound && Array.isArray(data.candidates)) {
    const candidates = data.candidates as Array<{
      name: string;
      matchScore: number | null;
      matchNote?: string | null;
      stage?: string | null;
      company?: string | null;
      location?: string | null;
      experienceYears?: number | null;
      link: string;
    }>;
    const requisition = data.requisition as { reqNo?: string; title?: string } | undefined;
    return (
      <div className="self-start w-full bg-surface border border-border rounded-md p-3.5 shadow-soft-sm flex flex-col gap-2.5">
        <p className="m-0 text-[13px] text-ink">{turn.content}</p>
        {requisition && (requisition.reqNo || requisition.title) && (
          <div className="text-[11.5px] text-ink-muted">
            {requisition.reqNo} {requisition.title}
          </div>
        )}
        {candidates.length > 0 && (
          <div className="flex flex-col gap-2">
            {candidates.map((c, i) => (
              <a
                key={i}
                href={c.link}
                className="block border border-border rounded-sm px-2.5 py-2 hover:border-border-strong transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-semibold text-brand truncate">
                    {i + 1}. {c.name}
                  </div>
                  {c.matchScore != null && (
                    <div className="shrink-0 text-[11px] font-semibold text-brand bg-brand-wash rounded-full px-2 py-0.5">
                      {Math.round(c.matchScore)}% match
                    </div>
                  )}
                </div>
                <div className="text-[11.5px] text-ink-muted line-clamp-2">
                  {[c.company, c.location, c.experienceYears != null ? `${c.experienceYears} yrs` : null]
                    .filter(Boolean)
                    .join(" -- ")}
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (turn.resultType === "todo" && data && data.added) {
    return (
      <div className="self-start max-w-[85%] bg-surface border border-border rounded-md px-3.5 py-2 text-[13px] text-ink shadow-soft-sm flex flex-col gap-1.5">
        <span className="whitespace-pre-wrap">{turn.content}</span>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-ink-muted truncate">&quot;{String(data.text)}&quot; added.</span>
          {typeof data.href === "string" && (
            <a href={data.href} className="font-semibold text-brand flex-shrink-0 hover:underline">
              View here →
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="self-start max-w-[85%] bg-surface border border-border rounded-md px-3.5 py-2 text-[13px] text-ink shadow-soft-sm whitespace-pre-wrap">
      {turn.content}
    </div>
  );
}
