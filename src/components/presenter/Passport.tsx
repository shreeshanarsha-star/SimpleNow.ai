"use client";
// Presenter.ai — the private "AI passport" each person keeps on their phone,
// plus the take-home kit. Nothing here is shared with anyone else.
import { useEffect, useRef, useState } from "react";
import { HR_PROMPTS, LEVELS, NEXT_STEP, SAFETY, TOOL_BY_TASK } from "@/lib/presenter/content";

type Props = {
  name: string;
  level: string | null;
  quiz: number;
  quizOf: number;
  commit: string | null;
  showKit: boolean;
  deckUrl?: string | null;
  title: string;
};

export default function Passport(p: Props) {
  const [unlocked, setUnlocked] = useState(false);
  const [msg, setMsg] = useState("");
  const line = LEVELS.find((l) => l.name === p.level)?.line || "Complete the self-assessment to get your level";
  const next = (p.level && NEXT_STEP[p.level]) || "Pick one repetitive task and try one approved AI tool on it this week.";

  useEffect(() => {
    const t = setTimeout(() => setUnlocked(true), 900);
    if (navigator.vibrate) navigator.vibrate([30, 60, 30]);
    return () => clearTimeout(t);
  }, []);

  const card = async () => {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1350;
    const x = c.getContext("2d")!;
    const g = x.createLinearGradient(0, 0, 1080, 1350);
    g.addColorStop(0, "#ea580c");
    g.addColorStop(1, "#9f1239");
    x.fillStyle = g;
    x.fillRect(0, 0, 1080, 1350);
    x.fillStyle = "rgba(255,255,255,0.12)";
    x.beginPath();
    x.arc(980, 120, 260, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#fff";
    x.textAlign = "left";
    x.textBaseline = "top";
    const F = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    x.font = `600 34px ${F}`;
    x.fillText("MY AI PASSPORT", 80, 90);
    x.font = `400 30px ${F}`;
    x.fillStyle = "rgba(255,255,255,0.85)";
    x.fillText(p.title, 80, 140);
    x.fillStyle = "#fff";
    x.font = `800 64px ${F}`;
    x.fillText(p.name, 80, 230);
    x.font = `900 110px ${F}`;
    x.fillText(p.level || "In progress", 80, 330);
    x.font = `400 34px ${F}`;
    wrap(x, line, 80, 470, 920, 44);
    let y = 590;
    const section = (h: string, body: string) => {
      x.font = `700 28px ${F}`;
      x.fillStyle = "rgba(255,255,255,0.75)";
      x.fillText(h.toUpperCase(), 80, y);
      x.fillStyle = "#fff";
      x.font = `500 38px ${F}`;
      y = wrap(x, body, 80, y + 44, 920, 50) + 36;
    };
    section("My next step", next);
    if (p.commit) section("My 30-day commitment", p.commit);
    section("My three checks", "Fact: is it true?  Value: is the work better?  ROI: does the saving beat the cost?");
    x.font = `800 40px ${F}`;
    x.fillText("AI, HI or notepad: what matters is ROI.", 80, 1240);
    return new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
  };

  const save = async () => {
    setMsg("");
    const blob = await card();
    if (!blob) return;
    const file = new File([blob], "my-ai-passport.png", { type: "image/png" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My AI passport" });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-ai-passport.png";
    a.click();
    setMsg("Saved to your downloads.");
  };

  const remind = () => {
    // Calendar reminder 30 days from now, set up by the person themselves (no messages from us).
    const d = new Date(Date.now() + 30 * 86400_000);
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const text = p.commit ? `My AI commitment: ${p.commit}` : "Try AI on one repetitive task";
    const esc = (s: string) => s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SimpleNow//Presenter//EN",
      "BEGIN:VEVENT",
      `UID:${Date.now()}@simplenow.ai`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${ymd}`,
      `SUMMARY:${esc("30 days on: " + text)}`,
      `DESCRIPTION:${esc("Did it save time once checking is included? Fact, Value, ROI. AI, HI or notepad: what matters is ROI.")}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const a = document.createElement("a");
    a.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    a.download = "my-ai-commitment.ics";
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 to-rose-700 p-6 text-center">
        {unlocked && <Confetti />}
        <div className="text-xs uppercase tracking-widest text-white/80">My AI passport · private</div>
        <div className={`mt-3 text-4xl font-black transition-all duration-700 ${unlocked ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}>{p.level || "In progress"}</div>
        <div className="mt-1 text-sm text-white/85">{line}</div>
        <div className="mt-4 text-sm text-white/80">Quiz: {p.quiz} / {p.quizOf}</div>
      </div>
      <div className="rounded-3xl bg-white/[0.06] p-5 space-y-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wider text-white/50">My next step</div>
          <div className="mt-1 text-white/90">{next}</div>
        </div>
        {p.commit && (
          <div>
            <div className="text-xs uppercase tracking-wider text-white/50">My 30-day commitment</div>
            <div className="mt-1 text-white/90">{p.commit}</div>
          </div>
        )}
        <div className="text-white/70">Fact · Value · ROI. AI, HI or notepad: what matters is ROI.</div>
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button onClick={save} className="rounded-2xl bg-orange-600 py-3 font-semibold">Save my passport</button>
          <button onClick={remind} className="rounded-2xl bg-white/10 py-3 font-semibold">Remind me in 30 days</button>
        </div>
        {msg && <div className="text-xs text-white/60">{msg}</div>}
        <div className="text-xs text-white/40">Only you can see this. Goal: one level up in 90 days.</div>
      </div>
      {p.showKit && <Kit deckUrl={p.deckUrl} />}
    </div>
  );
}

function wrap(x: CanvasRenderingContext2D, text: string, left: number, top: number, maxW: number, lh: number) {
  const words = text.split(/\s+/);
  let line = "";
  let y = top;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (x.measureText(t).width > maxW && line) {
      x.fillText(line, left, y);
      line = w;
      y += lh;
    } else line = t;
  }
  if (line) x.fillText(line, left, y);
  return y + lh;
}

function Confetti() {
  const ref = useRef<HTMLDivElement>(null);
  const bits = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      {bits.map((i) => (
        <span
          key={i}
          className="absolute top-0 h-2 w-2 rounded-sm"
          style={{
            left: `${(i * 37) % 100}%`,
            background: ["#fbb116", "#6aa132", "#0066b3", "#ffffff"][i % 4],
            animation: `conf ${1.4 + (i % 5) * 0.2}s ease-out ${(i % 7) * 0.05}s forwards`,
          }}
        />
      ))}
      <style>{`@keyframes conf{from{transform:translateY(-10px) rotate(0);opacity:1}to{transform:translateY(260px) rotate(540deg);opacity:0}}`}</style>
    </div>
  );
}

function Kit({ deckUrl }: { deckUrl?: string | null }) {
  const [copied, setCopied] = useState(-1);
  const copy = async (t: string, i: number) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    } catch {}
  };
  return (
    <div className="space-y-4">
      <Section title="Pick the tool by the task">
        <ul className="space-y-1.5 text-sm text-white/80">
          {TOOL_BY_TASK.map((t) => (
            <li key={t.task}>
              <b className="text-white">{t.task}:</b> {t.tools}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-white/40">Free tiers and prices change often; check on the day. Free or personal accounts: no confidential data, turn off training.</p>
      </Section>
      <Section title="10 HR prompts to try tomorrow">
        <div className="space-y-2">
          {HR_PROMPTS.map((pr, i) => (
            <div key={i} className="rounded-xl bg-white/5 p-3 text-sm">
              <div className="font-semibold">{pr.title}</div>
              <div className="mt-1 text-white/70">{pr.prompt}</div>
              <button onClick={() => copy(pr.prompt, i)} className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs">
                {copied === i ? "Copied ✓" : "Copy"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-white/40">Use company-approved accounts. No names, salaries or employee codes in prompts. Check every output.</p>
      </Section>
      <Section title="Use AI, protect people's data">
        <div className="grid gap-3 text-sm">
          <div>
            <div className="font-semibold text-emerald-300">Do</div>
            <ul className="mt-1 space-y-1 text-white/80">{SAFETY.do.map((d) => <li key={d}>✔ {d}</li>)}</ul>
          </div>
          <div>
            <div className="font-semibold text-rose-300">Don&apos;t</div>
            <ul className="mt-1 space-y-1 text-white/80">{SAFETY.dont.map((d) => <li key={d}>✘ {d}</li>)}</ul>
          </div>
        </div>
      </Section>
      {deckUrl && (
        <a href={deckUrl} target="_blank" rel="noreferrer" className="block rounded-2xl bg-white/10 py-3 text-center font-semibold">
          Download today&apos;s slides (PDF)
        </a>
      )}
      <p className="text-center text-sm text-white/50">Thank you for your time, your questions and your curiosity.</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white/[0.06] p-5">
      <h3 className="mb-3 text-lg font-bold">{title}</h3>
      {children}
    </div>
  );
}
