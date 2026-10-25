"use client";

// Customer-facing Dr.Remi page -- same dual-panel layout, header and
// notification bar as askshree.com: products on the left (instead of Open
// Jobs), the live voice assistant on the right.
import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import TopbarStatus from "@/components/TopbarStatus";
import RemiStudio from "./RemiStudio";
import type { RemiPublicProduct, RemiPublicWorkspace } from "./types";

const PER_PAGE = 4;

function priceText(p: RemiPublicProduct) {
  if (p.price_min == null && p.price_max == null) return null;
  const f = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const lo = p.price_min ?? p.price_max!;
  const hi = p.price_max ?? p.price_min!;
  return `${p.currency} ${f(lo)}${hi !== lo ? `–${f(hi)}` : ""}${p.price_unit ? ` / ${p.price_unit}` : ""}`;
}

export default function RemiPublicPage({
  ws,
  products,
  channel,
}: {
  ws: RemiPublicWorkspace;
  products: RemiPublicProduct[];
  channel: "web" | "qr";
}) {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [ask, setAsk] = useState<{ text: string; nonce: number } | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.name, p.category, p.summary, ...(p.species || []), ...(p.applications || [])].join(" ").toLowerCase().includes(q)
    );
  }, [products, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="min-h-screen bg-page text-ink flex flex-col">
      <header className="px-6 py-3.5 border-b border-border bg-surface shadow-soft-sm flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center hover:opacity-90">
            <Logo height={28} />
          </Link>
          <span className="hidden sm:inline text-ink-muted">·</span>
          <span className="hidden sm:inline font-semibold text-sm truncate">{ws.name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <TopbarStatus />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT: product shelf */}
          <section className="lg:col-span-6 bg-surface border border-border rounded-2xl shadow-soft overflow-hidden flex flex-col lg:h-[calc(100vh-170px)] min-h-[520px] lg:sticky lg:top-20 order-2 lg:order-1">
            <div className="bg-gradient-to-b from-brand-wash/70 via-surface to-surface border-b border-border p-4 flex items-center justify-between gap-3 min-h-[88px]">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-brand to-brand-dark p-0.5 shadow-emblem">
                  <div className="w-full h-full rounded-full bg-surface flex items-center justify-center">
                    <Icon name="box" className="w-6 h-6 text-brand" />
                  </div>
                </div>
                <div>
                  <h2 className="font-bold text-sm">Products</h2>
                  <p className="text-[11px] text-ink-muted">{ws.industry || "Explore our range"} · tap any product to ask {ws.assistant_name}</p>
                </div>
              </div>
              <div className="relative">
                <Icon name="search" className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Filter…"
                  className="h-8 w-32 sm:w-40 pl-7 pr-2 rounded-full border border-border bg-page text-xs outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-page p-3.5 space-y-2.5">
              {shown.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-xs text-ink-muted p-8">
                  <div>
                    <p className="font-semibold text-ink mb-1">{products.length ? "No products match" : "Ask me anything"}</p>
                    <p>
                      {products.length
                        ? "Try another word, or simply ask the assistant."
                        : `${ws.assistant_name} knows our full range — ask about any product, result or application.`}
                    </p>
                  </div>
                </div>
              ) : (
                shown.map((p) => (
                  <article key={p.id} className="bg-surface border border-border rounded-xl p-3.5 shadow-soft-sm hover:border-brand/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-bold text-[13px] text-ink">{p.name}</h3>
                        <div className="text-[11px] text-ink-muted flex flex-wrap gap-x-2">
                          {p.category && <span>{p.category}</span>}
                          {p.pack_sizes && <span>· {p.pack_sizes}</span>}
                        </div>
                      </div>
                      {priceText(p) && <span className="text-[10.5px] font-semibold text-brand bg-brand-wash rounded-full px-2 py-0.5 whitespace-nowrap">{priceText(p)}*</span>}
                    </div>
                    {p.summary && <p className="text-[11.5px] text-ink-2 mt-1.5 leading-relaxed line-clamp-3">{p.summary}</p>}
                    {!!p.key_benefits?.length && (
                      <ul className="mt-2 space-y-0.5">
                        {p.key_benefits.slice(0, 3).map((b) => (
                          <li key={b} className="text-[11px] text-ink flex gap-1.5">
                            <Icon name="check" className="w-3.5 h-3.5 text-good flex-shrink-0 mt-[1px]" />
                            {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {[...(p.species || []), ...(p.applications || [])].slice(0, 4).map((t) => (
                          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-page border border-border text-ink-muted">{t}</span>
                        ))}
                      </div>
                      <button
                        onClick={() => setAsk({ text: `Tell me about ${p.name} — is it right for me?`, nonce: Date.now() })}
                        className="text-[11px] font-semibold text-brand hover:text-brand-dark flex items-center gap-1 whitespace-nowrap"
                      >
                        <Icon name="chat" className="w-3.5 h-3.5" /> Ask {ws.assistant_name}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-border bg-surface flex items-center justify-between text-[11px] text-ink-muted">
              <span>{products.some((p) => p.price_min != null) ? "*Indicative; exact pricing depends on volume & region." : `${filtered.length} products`}</span>
              <div className="flex items-center gap-1.5">
                <button disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="px-2.5 py-1 rounded-lg border border-border disabled:opacity-40 hover:text-brand">Previous</button>
                <span>{page}/{pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((x) => x + 1)} className="px-2.5 py-1 rounded-lg border border-border disabled:opacity-40 hover:text-brand">Next</button>
              </div>
            </div>
          </section>

          {/* RIGHT: Dr.Remi studio */}
          <div className="lg:col-span-6 order-1 lg:order-2 lg:sticky lg:top-20">
            <RemiStudio ws={ws} channel={channel} externalAsk={ask} className="h-[calc(100vh-170px)] min-h-[580px]" />
          </div>
        </div>
      </main>
      <footer className="text-center text-[11px] text-ink-muted pb-4">
        {ws.assistant_name} is an AI assistant for {ws.name}. Answers come from approved company information; please confirm critical decisions with our team or your veterinarian/advisor. Powered by SimpleNow.ai
      </footer>
    </div>
  );
}
