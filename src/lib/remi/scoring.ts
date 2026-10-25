// Dr.Remi lead scoring -- blends the model's purchase-intent estimate with
// qualification coverage (need / budget / authority / timeline, 0-3 each)
// and whether we have a consented way to reach the customer.

export interface IntentSignals {
  score?: number; // 0-100, model estimate of buying within ~6 months
  need?: number;
  budget?: number;
  authority?: number;
  timeline?: number;
  urgency?: "low" | "medium" | "high" | string;
  buying_signals?: string[];
}

function n03(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(0, Math.min(3, Math.round(x))) : 0;
}

export function computeScore(intent: IntentSignals, hasConsentedContact: boolean): { score: number; tier: "hot" | "warm" | "cold" } {
  const model = Math.max(0, Math.min(100, Number(intent.score) || 0));
  const bant = n03(intent.need) + n03(intent.budget) + n03(intent.authority) + n03(intent.timeline); // 0..12
  const bantPct = (bant / 12) * 100;
  let score = 0.55 * model + 0.3 * bantPct + (hasConsentedContact ? 15 : 0);
  if (intent.urgency === "high") score += 5;
  score = Math.round(Math.max(0, Math.min(100, score)));
  const tier = score >= 70 ? "hot" : score >= 40 ? "warm" : "cold";
  return { score, tier };
}

/** Keep the strongest value seen so far for each signal (customers rarely "un-say" things). */
export function mergeSignals(prev: IntentSignals | null | undefined, next: IntentSignals | null | undefined): IntentSignals {
  const p = prev || {};
  const n = next || {};
  const urg = ["low", "medium", "high"];
  return {
    // The model sees the whole conversation each turn, so its latest estimate wins.
    score: Number.isFinite(Number(n.score)) && n.score !== undefined ? Number(n.score) : Number(p.score) || 0,
    need: Math.max(n03(p.need), n03(n.need)),
    budget: Math.max(n03(p.budget), n03(n.budget)),
    authority: Math.max(n03(p.authority), n03(n.authority)),
    timeline: Math.max(n03(p.timeline), n03(n.timeline)),
    urgency: urg[Math.max(urg.indexOf(String(p.urgency)), urg.indexOf(String(n.urgency)), 0)],
    buying_signals: Array.from(new Set([...(p.buying_signals || []), ...(n.buying_signals || [])])).slice(0, 12),
  };
}
