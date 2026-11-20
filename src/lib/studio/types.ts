// Presenter Studio — the show plan (what the wizard saves) and the live state
// (what the TV, remote and phones share). Pure types + defaults, no imports, so
// the engine and its tests run anywhere.

export type Intent = "awareness" | "training" | "induction" | "townhall" | "sales" | "workshop" | "other";

export type Purpose = {
  intent: Intent;
  purpose: string;
  audience: string;
  message: string; // the ultimate message
  closingLine: string; // said word for word
  outcome: string; // what people should do after
  success: string;
  minutes: number;
  eventDate: string; // YYYY-MM-DD
  timeOfDay: "morning" | "afternoon" | "evening";
};

export type Slide = { n: number; text: string; notes: string };

export type Poll = { key: string; afterSlide: number; question: string; options: string[]; answer: number | null };
export type QuizQ = { q: string; options: string[]; answer: number };

export type Person = { name: string; role: string; note: string };

export type Preset = "warm" | "formal" | "energetic" | "calm";

export type Plan = {
  purpose: Purpose;
  deck: { name: string; pages: number; uploadedAt: string } | null;
  slides: Slide[];
  polls: { enabled: boolean; items: Poll[] };
  quiz: { enabled: boolean; placement: "before" | "after"; seconds: number; items: QuizQ[] };
  qa: { enabled: boolean };
  audience: { mode: "anonymous" | "list"; people: Person[] };
  presenter: { kind: "shree" | "anam" | "voice"; personaId: string; name: string };
  personality: { preset: Preset; rules: string; mustSay: string; avoid: string };
  script: { opening: string; slides: Record<string, string>; closing: string; generatedAt: string | null };
  mode: "manual" | "assisted";
};

export const PRESETS: Record<Preset, { label: string; style: string }> = {
  warm: { label: "Warm trainer", style: "Warm, respectful, kind, encouraging, with a light touch of gentle humour. Simple words." },
  formal: { label: "Formal corporate", style: "Polished, concise, confident and professional. No jokes. Clear structure." },
  energetic: { label: "Energetic host", style: "Upbeat, lively and enthusiastic, short punchy sentences, celebrates the audience." },
  calm: { label: "Calm expert", style: "Calm, thoughtful and precise; explains the why; reassuring and credible." },
};

export const INTENTS: Record<Intent, string> = {
  awareness: "Awareness session",
  training: "Training",
  induction: "Induction / onboarding",
  townhall: "Town hall / update",
  sales: "Sales or product pitch",
  workshop: "Workshop",
  other: "Other",
};

export function emptyPlan(): Plan {
  return {
    purpose: { intent: "awareness", purpose: "", audience: "", message: "", closingLine: "", outcome: "", success: "", minutes: 45, eventDate: "", timeOfDay: "morning" },
    deck: null,
    slides: [],
    polls: { enabled: true, items: [] },
    quiz: { enabled: false, placement: "after", seconds: 20, items: [] },
    qa: { enabled: true },
    audience: { mode: "anonymous", people: [] },
    presenter: { kind: "shree", personaId: "", name: "Shree" },
    personality: { preset: "warm", rules: "", mustSay: "", avoid: "" },
    script: { opening: "", slides: {}, closing: "", generatedAt: null },
    mode: "manual",
  };
}

/** Fill any missing fields (older saved plans) with defaults. */
export function normalizePlan(p: Partial<Plan> | null | undefined): Plan {
  const e = emptyPlan();
  const x = (p || {}) as Partial<Plan>;
  return {
    ...e,
    ...x,
    purpose: { ...e.purpose, ...(x.purpose || {}) },
    polls: { ...e.polls, ...(x.polls || {}), items: x.polls?.items || [] },
    quiz: { ...e.quiz, ...(x.quiz || {}), items: x.quiz?.items || [] },
    qa: { ...e.qa, ...(x.qa || {}) },
    audience: { ...e.audience, ...(x.audience || {}), people: x.audience?.people || [] },
    presenter: { ...e.presenter, ...(x.presenter || {}) },
    personality: { ...e.personality, ...(x.personality || {}) },
    script: { ...e.script, ...(x.script || {}), slides: x.script?.slides || {} },
    slides: x.slides || [],
  };
}

/* ------------------------------- Run of show ------------------------------- */

export type StepKind = "opening" | "slide" | "poll" | "poll_result" | "quiz_intro" | "quiz_q" | "quiz_end" | "qa" | "results" | "close";
export type Step = {
  kind: StepKind;
  label: string;
  slide: number | null; // slide shown on the TV during this step
  say: string; // what the presenter says when the step starts ("" = nothing)
  pollKey?: string;
  quizIdx?: number;
  estSec: number;
};

/* --------------------------------- Live ---------------------------------- */

export type Live = {
  v: number; // version: every change bumps it; commands must quote it
  started: boolean;
  step: number;
  held: boolean;
  spoken: number; // last step the TV finished speaking (-1 = none)
  stepAt: number; // ms when the current step began
  say: { id: number; text: string } | null; // operator-injected line
  ended: boolean;
  avatar: "starting" | "ok" | "voice" | "off";
  take: number; // bumps whenever the TV must (re)speak the current step from the start
};

export function emptyLive(): Live {
  return { v: 0, started: false, step: 0, held: false, spoken: -1, stepAt: 0, say: null, ended: false, avatar: "off", take: 0 };
}

export type Action =
  | { type: "start" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; step: number }
  | { type: "hold" }
  | { type: "resume" }
  | { type: "say"; text: string }
  | { type: "spoken"; step: number }
  | { type: "avatar"; status: Live["avatar"] }
  | { type: "reset" };
