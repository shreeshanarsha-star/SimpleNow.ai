import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function SmartSourceClipperPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AppShell title="SimpleNow-Source">
      <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-8">

        {/* Badge */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            Chrome Extension · v0.3.0
          </span>
          <span className="text-[11px] text-ink-muted">Internal · SimpleNow.ai users only</span>
        </div>

        {/* Hero */}
        <div className="flex flex-col gap-3">
          <h1 className="font-display font-bold text-[28px] leading-tight text-ink tracking-tight">
            Find their contact info and clip candidates into your pipeline — without leaving LinkedIn.
          </h1>
          <p className="text-[14px] text-ink-muted leading-relaxed max-w-lg">
            Open any LinkedIn profile and SimpleNow-Source opens alongside it in a side panel: it
            auto-extracts the candidate, has AI search for a public email and phone number, and saves
            them straight into your{" "}
            <Link href="/tools/smart-source-ai" className="text-amber-700 font-medium hover:underline">
              SmartSource.ai
            </Link>{" "}
            projects. No copy-paste. No tab switching.
          </p>
        </div>

        {/* Preview card */}
        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="bg-[#151221] px-4 py-3 flex items-center justify-between border-b border-[#2a2440]">
            <div className="flex items-baseline gap-2">
              <div className="text-white font-extrabold text-[16px] leading-none tracking-tight">
                Simple<span className="relative text-[#C79A3E]">N<svg className="inline w-[9px] h-[9px] mx-px mb-0.5" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="12"><circle cx="50" cy="50" r="45"/><path d="M27 51 L43 67 L75 33" strokeLinecap="round" strokeLinejoin="round"/></svg>w
                  <span className="absolute left-px right-px -bottom-0.5 h-[1.6px] rounded-full bg-[#C79A3E]" />
                </span>
              </div>
              <span className="text-[9px] font-bold tracking-wide uppercase text-[#a79cd6] bg-[#a79cd6]/10 border border-[#a79cd6]/25 rounded px-1.5 py-0.5">
                Source
              </span>
            </div>
          </div>
          <div className="p-4 bg-[#fafaf9] flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-white p-3 shadow-sm flex flex-col gap-2">
              <div className="text-[10px] font-bold tracking-widest text-amber-700 uppercase">AI Found</div>
              <div className="font-bold text-[15px] text-ink">Priya Sharma</div>
              <div className="text-[12px] text-ink-muted">Senior Product Manager · Razorpay</div>
              <div className="flex items-center justify-between text-[12px] bg-slate-50 border border-border rounded-md px-2.5 py-1.5">
                <span className="text-ink">priya.sharma@razorpay.com</span>
                <span className="text-ink-muted text-[10px]">copy</span>
              </div>
              <div className="flex items-center justify-between text-[12px] bg-slate-50 border border-border rounded-md px-2.5 py-1.5">
                <span className="text-ink">+91 98450 12345</span>
                <span className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-emerald-600" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.42a9.86 9.86 0 0 0 4.62 1.15h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.46 17.5 2 12.04 2Z"/></svg>
                  <span className="text-ink-muted text-[10px]">copy</span>
                </span>
              </div>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-800">
              Senior PM Hiring - Q4 2026 · 12 candidates
            </div>
            <div className="rounded-md bg-gradient-to-r from-amber-700 to-amber-900 text-white text-center text-[13px] font-semibold py-2.5">
              Add to Smart Source →
            </div>
          </div>
        </div>

        {/* Feature pills */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "🔎", title: "AI contact lookup", desc: "Searches for a public email & phone number for the candidate — never a guess." },
            { icon: "🗂️", title: "Side panel", desc: "Stays open as you browse profile to profile — no re-opening a popup each time." },
            { icon: "💬", title: "WhatsApp in one click", desc: "Message the number AI found without retyping or saving it first." },
          ].map(f => (
            <div key={f.title} className="rounded-lg border border-border bg-white p-3 flex flex-col gap-1.5 shadow-sm">
              <span className="text-[20px]">{f.icon}</span>
              <div className="text-[12.5px] font-bold text-ink">{f.title}</div>
              <div className="text-[11.5px] text-ink-muted leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>

        {/* Install steps */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm flex flex-col gap-4">
          <div className="font-bold text-[14px] text-ink">How to install</div>
          <ol className="flex flex-col gap-3">
            {[
              { n: "1", text: <>Download the extension <strong>.zip</strong> below, then unzip it</> },
              { n: "2", text: <>Open <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">chrome://extensions</code> and enable <strong>Developer Mode</strong> (toggle, top right)</> },
              { n: "3", text: <>Click <strong>"Load unpacked"</strong> and select the unzipped folder</> },
              { n: "4", text: <>Make sure you're signed in to SimpleNow.ai in that browser, then open any <code className="bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">linkedin.com/in/…</code> profile — the panel opens on the right automatically</> },
            ].map(step => (
              <li key={step.n} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 font-bold text-[12px] flex items-center justify-center flex-shrink-0 mt-0.5">
                  {step.n}
                </span>
                <span className="text-[13px] text-ink leading-relaxed">{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="text-[11.5px] text-ink-muted leading-relaxed border-t border-border pt-3">
            Chrome will show a "developer mode extensions" notice occasionally since this isn't published
            to the Chrome Web Store yet — that's expected and safe to dismiss.
          </p>
        </div>

        {/* Download CTA */}
        {user ? (
          <div className="flex flex-col gap-3">
            <a
              href="/downloads/simplenow-source-extension.zip"
              download
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-700 to-amber-900 hover:opacity-90 transition-opacity text-white font-semibold text-[14px] rounded-lg py-3.5 shadow-sm"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download SimpleNow-Source (.zip)
            </a>
            <p className="text-center text-[11px] text-ink-muted">
              For SimpleNow.ai users only · Internal release · v0.3.0
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-amber-50 p-4 text-center flex flex-col gap-2">
            <p className="text-[13px] text-ink font-medium">Sign in to download the extension</p>
            <Link
              href="/login?next=/tools/smartsource-clipper"
              className="inline-flex items-center justify-center gap-1.5 text-amber-700 font-semibold text-[13px] hover:underline"
            >
              Sign in to SimpleNow.ai →
            </Link>
          </div>
        )}

      </div>
    </AppShell>
  );
}
