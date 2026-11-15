"use client";
// Presenter.ai — owner console: session, uploads, and the links to open on
// the TV laptop and on the control phone.
import { useEffect, useState } from "react";
import { api } from "@/lib/presenter/client";
import BrainPanel from "@/components/presenter/BrainPanel";

type Session = {
  id: string;
  code: string;
  title: string;
  status: string;
  state: { files?: Record<string, { name: string; at: string }> };
  created_at: string;
};

const UPLOADS: Array<{ kind: "deck" | "notes" | "quiz"; label: string; hint: string }> = [
  { kind: "deck", label: "Presentation (PDF)", hint: "What the room sees on the TV" },
  { kind: "notes", label: "Speaker notes (PDF)", hint: "Shree's brain for each slide — same page order as the deck" },
  { kind: "quiz", label: "Quiz & assessment (PDF)", hint: "Optional for now" },
];

export default function PresenterConsole() {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [origin, setOrigin] = useState("");

  const load = async () => {
    const { session: s } = await api<{ session: Session }>("/api/presenter/session");
    setSession(s);
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    load().catch((e) => setMsg(e.message));
  }, []);

  const upload = async (kind: string, file: File) => {
    if (!session) return;
    setBusy(kind);
    setMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      fd.append("sessionId", session.id);
      await api("/api/presenter/deck", { method: "POST", body: fd });
      await load();
      setMsg(`${file.name} uploaded.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
    }
  };

  const newSession = async () => {
    const { session: s } = await api<{ session: Session }>("/api/presenter/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setSession(s);
  };

  if (!session) return <div className="p-6 text-sm text-ink-muted">{msg || "Loading…"}</div>;

  const tv = `${origin}/presenter/live?s=${session.id}`;
  const ctl = `${origin}/presenter/control?s=${session.id}`;
  const hubUrl = `${origin}/p/${session.code}`;

  return (
    <div className="space-y-6 p-1">
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-muted">Current session</div>
            <div className="text-lg font-semibold">{session.title}</div>
            <div className="text-sm text-ink-muted">Code {session.code} · created {new Date(session.created_at).toLocaleString()}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!confirm(`Clear all sign-ups, answers and questions in session ${session.code}? People memory is kept.`)) return;
                try {
                  await api("/api/presenter/hub/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id, action: "clear" }) });
                  setMsg("Session cleared.");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Clear failed");
                }
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Clear test data
            </button>
            <button onClick={newSession} className="rounded-lg border border-border px-3 py-2 text-sm">New session</button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <a href={tv} target="_blank" className="rounded-2xl border border-border bg-surface p-5 hover:border-border-strong">
          <div className="text-sm font-semibold">1 · Open the TV screen</div>
          <div className="mt-1 text-xs text-ink-muted">On the presenting laptop (HDMI to TV). Click once to arm full screen.</div>
          <div className="mt-2 break-all text-xs">{tv}</div>
        </a>
        <a href={ctl} target="_blank" className="rounded-2xl border border-border bg-surface p-5 hover:border-border-strong">
          <div className="text-sm font-semibold">2 · Open the control page</div>
          <div className="mt-1 text-xs text-ink-muted">On your phone (signed in), with the Bluetooth earpiece.</div>
          <div className="mt-2 break-all text-xs">{ctl}</div>
        </a>
        <a href={hubUrl} target="_blank" className="rounded-2xl border border-border bg-surface p-5 hover:border-border-strong">
          <div className="text-sm font-semibold">3 · Audience phones</div>
          <div className="mt-1 text-xs text-ink-muted">No login. The TV lobby shows this as a QR code.</div>
          <div className="mt-2 break-all text-xs">{hubUrl}</div>
        </a>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="text-sm font-semibold">Session material</div>
        {UPLOADS.map((u) => {
          const f = session.state?.files?.[u.kind];
          return (
            <div key={u.kind} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
              <div>
                <div className="text-sm font-medium">{u.label}</div>
                <div className="text-xs text-ink-muted">{f ? `✓ ${f.name}` : u.hint}</div>
              </div>
              <label className="cursor-pointer rounded-lg bg-ink px-3 py-2 text-xs text-surface">
                {busy === u.kind ? "Uploading…" : f ? "Replace" : "Upload"}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(u.kind, e.target.files[0])} />
              </label>
            </div>
          );
        })}
        {msg && <div className="text-xs text-ink-muted">{msg}</div>}
      </div>

      <BrainPanel key={session.id} sessionId={session.id} />
    </div>
  );
}
