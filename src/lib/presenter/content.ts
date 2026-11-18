// Presenter.ai — session content shared by the TV, the phones and the server.
// Quiz ANSWERS are deliberately NOT here (they live in quizKey.ts, server-only)
// so no phone can read them from the page bundle.

export type QuizQ = { section: string; q: string; options: [string, string, string, string] };

// Source: "AI Qiz and assessment/Part1_Quiz_and_Assessment.pptx" (30 questions, same order).
export const QUIZ: QuizQ[] = [
  { section: "The names", q: "AI stands for…", options: ["Artificial Intelligence", "Automatic Internet", "Advanced Information", "Applied Instructions"] },
  { section: "The names", q: "LLM stands for…", options: ["Long Learning Machine", "Large Language Model", "Live Language Monitor", "Logical Learning Method"] },
  { section: "The names", q: "GPT stands for…", options: ["General Purpose Technology", "Google Processing Tool", "Generative Pre-trained Transformer", "Guided Prediction Text"] },
  { section: "The names", q: "ML stands for…", options: ["Mobile Learning", "Model Language", "Main Logic", "Machine Learning"] },
  { section: "The names", q: "ChatGPT is made by…", options: ["Google", "Microsoft", "OpenAI", "Meta"] },
  { section: "The names", q: "Gemini is made by…", options: ["Google", "Apple", "Anthropic", "Amazon"] },
  { section: "The names", q: "Claude is made by…", options: ["OpenAI", "Anthropic", "Google", "Microsoft"] },
  { section: "The names", q: "Copilot is made by…", options: ["Meta", "Google", "Anthropic", "Microsoft"] },
  { section: "The words", q: "The instruction you type into AI is called a…", options: ["Token", "Prompt", "Code", "Query box"] },
  { section: "The words", q: "A small chunk of text the AI reads is called a…", options: ["Token", "Byte", "Pixel", "Cookie"] },
  { section: "The words", q: "When AI confidently makes up a fact, it's called a…", options: ["Glitch", "Crash", "Hallucination", "Bug"] },
  { section: "The words", q: "AI that creates new text, images or video is called…", options: ["Robotic AI", "Generative AI", "Narrow AI", "Search AI"] },
  { section: "The words", q: "AI that takes actions toward a goal on its own is called…", options: ["Agentic AI", "Generative AI", "Smart search", "Autocorrect"] },
  { section: "The words", q: "Building an app by describing it in plain English is called…", options: ["No-code", "Hard coding", "Pair coding", "Vibe coding"] },
  { section: "The words", q: "A fake video or cloned voice made by AI is called a…", options: ["Filter", "Deepfake", "Meme", "Avatar"] },
  { section: "The words", q: "AI that handles text, images and audio together is called…", options: ["Multimodal", "Multitask", "Multicloud", "Multilingual"] },
  { section: "The words", q: "How much text an AI can hold in mind at once is its…", options: ["Memory card", "Hard disk", "Context window", "Cache"] },
  { section: "The words", q: "The date where an AI's knowledge stops is its…", options: ["Expiry date", "Training cutoff", "Version date", "Deadline"] },
  { section: "The history", q: "The test of whether a machine can pass as human is the…", options: ["Einstein test", "Turing test", "Gates test", "Jobs test"] },
  { section: "The history", q: "In 2016, which AI beat Go world champion Lee Sedol?", options: ["Watson", "Siri", "Deep Blue", "AlphaGo"] },
  { section: "The history", q: "The 2017 invention behind every modern LLM is the…", options: ["Transformer", "Processor", "Algorithm", "Browser"] },
  { section: "The history", q: "ChatGPT was launched in…", options: ["2018", "2020", "2022", "2024"] },
  { section: "Using it safely", q: "Which one should you never paste into a free AI tool?", options: ["A news article", "A recipe", "A Diwali wish", "Employee salary data"] },
  { section: "Using it safely", q: "A human approving AI's work before it acts is called…", options: ["Human-in-the-loop", "Human override", "Manual mode", "Back-up"] },
  { section: "Using it safely", q: "The setting that controls how random an AI's answers are is…", options: ["Volume", "Speed", "Temperature", "Brightness"] },
  { section: "Using it safely", q: "Asking AI 'Are you sure?' usually…", options: ["Fixes every error", "Can make it change a correct answer too", "Locks the answer", "Deletes the chat"] },
  { section: "Builder & agent creator", q: "RAG stands for…", options: ["Random Answer Generator", "Rapid AI Gateway", "Retrieval-Augmented Generation", "Real-time Agent Grid"] },
  { section: "Builder & agent creator", q: "Training an existing AI further on your own data is called…", options: ["Fine-tuning", "Re-booting", "Prompting", "Uploading"] },
  { section: "Builder & agent creator", q: "Hidden text that tricks an AI agent into obeying it is called…", options: ["Phishing", "Spam", "Malware", "Prompt injection"] },
  { section: "Builder & agent creator", q: "MCP, the standard that lets AI agents plug into apps and tools, stands for…", options: ["Master Control Program", "Model Context Protocol", "Multi-Cloud Platform", "Machine Code Processor"] },
];

/** Quiz clock: every device derives the current question from the start time, so nothing has to "advance" it. */
export const QUIZ_TIMING = { leadInMs: 6000, revealMs: 3000 };
/** Answer time per question, from how much there is to read: 10–16 s (no force-fitting). */
export const QUIZ_ANSWER_MS = QUIZ.map((q) => {
  const words = `${q.q} ${q.options.join(" ")}`.split(/\s+/).length;
  return Math.max(10_000, Math.min(16_000, Math.round((6000 + words * 330) / 500) * 500));
});
const QUIZ_STARTS = QUIZ_ANSWER_MS.reduce<number[]>((acc, ms, i) => [...acc, i === 0 ? 0 : acc[i - 1] + QUIZ_ANSWER_MS[i - 1] + QUIZ_TIMING.revealMs], []);
export const QUIZ_TOTAL_MS = QUIZ_TIMING.leadInMs + QUIZ_ANSWER_MS.reduce((a, b) => a + b + QUIZ_TIMING.revealMs, 0);
/** When question idx opens, relative to the quiz start. */
export const quizQuestionOffset = (idx: number) => QUIZ_STARTS[idx] ?? 0;
export type QuizState = { start: number; stoppedAt?: number | null };
export function quizClock(quiz: QuizState | null | undefined, now: number) {
  if (!quiz?.start) return { status: "off" as const, idx: -1, msLeft: 0, answerMs: 0 };
  if (quiz.stoppedAt && now >= quiz.stoppedAt) return { status: "done" as const, idx: QUIZ.length, msLeft: 0, answerMs: 0 };
  const t = now - quiz.start;
  if (t < 0) return { status: "leadin" as const, idx: -1, msLeft: -t, answerMs: 0 };
  let idx = QUIZ_STARTS.length - 1;
  while (idx > 0 && QUIZ_STARTS[idx] > t) idx--;
  const answerMs = QUIZ_ANSWER_MS[idx];
  const inSlot = t - QUIZ_STARTS[idx];
  if (idx === QUIZ.length - 1 && inSlot >= answerMs + QUIZ_TIMING.revealMs) return { status: "done" as const, idx: QUIZ.length, msLeft: 0, answerMs: 0 };
  return inSlot < answerMs
    ? { status: "answer" as const, idx, msLeft: answerMs - inSlot, answerMs }
    : { status: "reveal" as const, idx, msLeft: answerMs + QUIZ_TIMING.revealMs - inSlot, answerMs };
}

/* ------------------------- Self-assessment (DRAFT) ------------------------- */
// DRAFT by Claude for Shreesha's approval (open item 3). Pick the HIGHEST true
// statement; options score 1–4; total 20–80. Areas follow the quiz deck slide 34.
export type AssessQ = { area: string; q: string; options: [string, string, string, string] };
export const ASSESSMENT: AssessQ[] = [
  { area: "Writing & communication", q: "Emails and messages", options: ["I write them fully myself", "I sometimes ask AI to draft or polish one", "I use AI every week for drafts and always edit before sending", "I have saved prompts or a project that drafts them in my style"] },
  { area: "Writing & communication", q: "Letters, JDs and announcements", options: ["I start from an old file and edit by hand", "Now and then I get an AI first draft", "AI writes my first draft routinely, using role, context, ask and format", "I've built a reusable assistant that produces them consistently"] },
  { area: "Writing & communication", q: "Tone, length and language", options: ["I haven't used AI for this", "I use AI to fix tone or grammar now and then", "I regularly use AI to shorten, adapt tone or translate for different readers", "I've set up a tool or workflow that does this for my team"] },
  { area: "Reading & understanding", q: "Long documents and reports", options: ["I read them fully myself", "I sometimes paste one in for a summary", "I regularly summarise and question documents with AI, then check the source", "I query a knowledge hub of approved documents I set up"] },
  { area: "Reading & understanding", q: "Finding answers in policies and SOPs", options: ["I search the files manually", "I ask a chatbot general questions occasionally", "I use AI on uploaded, approved policies and verify the exact section", "I built a policy assistant that others use"] },
  { area: "Meetings", q: "Meeting notes and action items", options: ["Handwritten notes or none", "I sometimes ask AI to tidy my notes", "I regularly use AI for summaries and action items", "Notes flow automatically into action items, trackers or emails"] },
  { area: "Meetings", q: "Preparing for meetings", options: ["No AI involved", "Occasionally I ask AI for an agenda", "I regularly prepare agendas, briefs and talking points with AI", "A reusable workflow prepares my briefs from my calendar and documents"] },
  { area: "Research & thinking", q: "Researching a topic", options: ["Google and read pages myself", "Sometimes I ask a chatbot", "I use tools with sources (e.g. Perplexity, NotebookLM) and open the citations", "I've set up a recurring research or monitoring agent"] },
  { area: "Research & thinking", q: "Thinking through a problem", options: ["I don't use AI for this", "Occasionally I brainstorm with AI", "I regularly ask AI to challenge my thinking, list options and trade-offs", "I use structured decision templates or an AI reviewer I set up"] },
  { area: "Excel & data", q: "Formulas and data cleaning", options: ["I do it manually or ask a colleague", "I sometimes ask AI for a formula", "I regularly use Copilot or AI to clean, analyse and chart data, and I reconcile totals", "I've automated a data pipeline with AI steps"] },
  { area: "Excel & data", q: "Monthly reports and MIS", options: ["I build them by hand each time", "Occasionally AI summarises a report for me", "AI helps every cycle and I verify the numbers", "The report refreshes automatically with AI insights"] },
  { area: "Presentations & learning", q: "Presentations and decks", options: ["I build them manually", "Occasionally AI gives me ideas or text", "I regularly generate a draft deck with AI, then refine it", "I have a reusable template or workflow that produces branded decks"] },
  { area: "Presentations & learning", q: "Learning something new", options: ["I don't use AI to learn", "Occasionally I ask AI to explain something", "I regularly learn with AI: explain, quiz me, make a plan", "I built a learning assistant or curriculum for me or my team"] },
  { area: "Prompting & tools", q: "How I prompt", options: ["Short one-line questions", "I add some detail sometimes", "I consistently give role, context, ask and format, and iterate", "I write structured, reusable prompts or instructions others use"] },
  { area: "Prompting & tools", q: "Tools I use", options: ["None, or one chatbot rarely", "One AI tool now and then", "Two or three tools every week, picked by task", "I connect tools together (integrations, APIs, MCP)"] },
  { area: "Reuse & automation", q: "Reusing what works", options: ["I start from scratch every time", "I sometimes copy an old prompt", "I keep a prompt library, projects or custom GPTs I reuse", "I share reusable assistants with my team"] },
  { area: "Reuse & automation", q: "Automation", options: ["Nothing automated", "I know which tasks could be automated, but haven't yet", "I've built at least one simple automation with AI in it", "I've built an agent that takes actions, with a human approving"] },
  { area: "Safety & quality", q: "Data safety", options: ["I'm not sure what's safe to paste", "I avoid obviously sensitive data", "I always use approved accounts, no personal data, training turned off", "I help define or teach safe-use rules for others"] },
  { area: "Safety & quality", q: "Checking AI output", options: ["I use the output as it is", "I skim it", "I always fact-check names, numbers and sources", "I've built checks into my workflow (review steps, second check)"] },
  { area: "Mindset", q: "My mindset", options: ["AI isn't for my work yet", "Curious: I try when someone shows me", "I actively look for tasks where AI pays off (ROI)", "I redesign my work around AI and help others do it"] },
];

export const LEVELS = [
  { name: "Explorer", min: 20, max: 35, line: "Starting out: tries AI now and then" },
  { name: "Practitioner", min: 36, max: 50, line: "Uses AI weekly for real tasks" },
  { name: "Builder", min: 51, max: 65, line: "Has templates, projects, repeatable workflows" },
  { name: "Agent Creator", min: 66, max: 80, line: "Designs AI that acts, with checks" },
] as const;
export function levelFor(score: number) {
  return LEVELS.find((l) => score >= l.min && score <= l.max) || LEVELS[0];
}

/* ------------------------------ Polls (DRAFT) ------------------------------ */
// DRAFT by Claude for Shreesha's approval (open item 4).
export type Poll = {
  key: string;
  label: string;
  q: string;
  options: string[];
  /** Games: index of the best answer, revealed with a one-line why. */
  best?: number;
  explain?: string;
  /** Prediction: the real outcome is chosen live by Shreesha. */
  liveResult?: boolean;
};
export const POLLS: Poll[] = [
  { key: "before", label: "AI confidence check · start", q: "How confident are you using AI in your daily work?", options: ["Not yet", "A little", "Fairly", "Very"] },
  { key: "poll1", label: "Poll 1 · Reality check", q: "Has AI saved you real time this month, after checking its work?", options: ["Yes, a lot", "A little", "Not really", "I don't use it yet"] },
  { key: "poll2", label: "Poll 2 · Tool by task", q: "Which task will you try with AI first?", options: ["Writing & emails", "Excel & data", "Policy answers", "Presentations & flyers", "Meeting notes"] },
  { key: "debate", label: "Poll · 900 agents", q: "300 people build 3 AI agents each: 900 agents. What happens?", options: ["Productivity shoots up", "Management gets more problems", "Both: big gains, only if managed well"] },
  { key: "check-fact", label: "App check · Fact", q: "Fact check: are the event details, logo and colours right?", options: ["👍 Yes", "👌 Mostly", "👎 No"] },
  { key: "check-value", label: "App check · Value", q: "Value: is it better than what we'd make in Canva or Word?", options: ["👍 Yes", "👌 About the same", "👎 No"] },
  { key: "check-roi", label: "App check · ROI", q: "ROI: did it save time, once checking is included?", options: ["👍 Yes", "👌 Not sure", "👎 No"] },
  // AI, HI or notepad? (DRAFT, needs approval): the core message as a game.
  {
    key: "game-1",
    label: "AI, HI or Notepad? · 1",
    q: "An employee asks for their exact leave entitlement under company policy. Best way to answer?",
    options: ["Ask a free chatbot", "Approved policy hub + HR checks it", "Notepad", "An agent that approves leave by itself"],
    best: 1,
    explain: "AI retrieves from the approved policy, HR validates. Fast and correct.",
  },
  {
    key: "game-2",
    label: "AI, HI or Notepad? · 2",
    q: "Writing to an employee who just lost a parent. Best way to write it?",
    options: ["AI writes it", "HI: your own words (AI can help structure)", "Notepad", "An agent sends it"],
    best: 1,
    explain: "Empathy and judgement are human work. The words should be yours.",
  },
  {
    key: "game-3",
    label: "AI, HI or Notepad? · 3",
    q: "Jotting three action points in a 10-minute team huddle. Best tool?",
    options: ["An AI meeting agent", "A long AI summary", "Notepad", "Ask HR to minute it"],
    best: 2,
    explain: "Fast, free and private. Not everything needs AI: that's ROI thinking.",
  },
  // Before Shreesha's live agent demo (DRAFT): the result is set live after the demo.
  {
    key: "predict",
    label: "Prediction · the agent demo",
    q: "Shreesha's AI agent will try a real HR task. What will happen?",
    options: ["It completes it on its own", "It completes it with human help", "It gets blocked"],
    liveResult: true,
  },
  { key: "after", label: "AI confidence check · end", q: "How confident are you using AI in your daily work?", options: ["Not yet", "A little", "Fairly", "Very"] },
];
export const pollByKey = (k?: string | null) => POLLS.find((p) => p.key === k);

/* ------------------------------ Hub state ------------------------------ */
export type HubPhase = "lobby" | "wishwall" | "quiz" | "assessment" | "poll" | "questions" | "build" | "flyer" | "commit" | "finale" | "closed";
export type HubState = {
  phase: HubPhase;
  quiz?: QuizState | null;
  poll?: string | null; // poll key while phase === "poll"
  finaleStep?: number; // 0 nothing · 1 third · 2 second · 3 winner · 4 levels · 5 before vs after
  /** Game / prediction: the revealed answer index (null = not revealed). */
  pollReveal?: number | null;
  /** HR Wish Wall: tasks grouped by theme. */
  wishGroups?: Array<{ label: string; items: string[] }> | null;
  flyerUrl?: string | null;
  flyerBuild?: FlyerBuild | null;
  /** Documents pushed to phones during the show (e.g. at the slide tagged [SHARE PDF]). */
  sharedDocs?: string[];
  at?: number;
};
export type FlyerInputs = { name: string; date: string; venue: string; highlights: string[] };
export type FlyerBuild = { status: "waiting" | "building" | "ready" | "failed"; startedAt: number; finishedAt?: number; inputs: FlyerInputs; provider?: string; error?: string };

/** Backup flyer app (pre-built, tested), prefilled with the room's inputs. */
export function backupFlyerUrl(i: FlyerInputs) {
  const q = new URLSearchParams({ name: i.name, date: i.date, venue: i.venue, h1: i.highlights[0] || "", h2: i.highlights[1] || "", h3: i.highlights[2] || "" });
  return `/flyer/index.html?${q.toString()}`;
}

// DRAFT preset ideas for a quiet room (open item 4), one tap on the control phone.
export const FLYER_PRESETS: Array<{ label: string; inputs: FlyerInputs }> = [
  { label: "Family Day", inputs: { name: "P&C Family Day", date: "Sat 6 Dec, 10:00 AM", venue: "NRPL Bengaluru office", highlights: ["Cricket: HR vs Finance", "Kids zone and magic show", "Lunch with live music"] } },
  { label: "AI Lunch & Learn", inputs: { name: "AI Lunch & Learn", date: "Fri 12 Dec, 1:00 PM", venue: "Training room", highlights: ["Write a JD in 5 minutes", "Excel Copilot tricks", "Build your own policy hub"] } },
];
export const DEFAULT_HUB: HubState = { phase: "lobby" };

export const PHONE_TAKEAWAYS = [
  "The 3-check test: Fact, Value, ROI.",
  "AI, HI or notepad: what matters is ROI.",
  "Never paste employee data into personal AI tools.",
  "Start small: one assistant, one design tool, one automation.",
];

/* ------------------------------ Take-home kit ------------------------------ */
export const NEXT_STEP: Record<string, string> = {
  Explorer: "Use AI every week for one real task, and run the 3 checks on every output.",
  Practitioner: "Turn one task you repeat into a saved prompt or project you reuse.",
  Builder: "Automate one repeatable workflow, with a human check before anything goes out.",
  "Agent Creator": "Design one bounded agent: clear goal, limited permissions, human approval step.",
};

// From deck slide 13 ("Pick the tool by the task"). Vendor pricing pages are the source; they change often.
export const TOOL_BY_TASK = [
  { task: "Writing, documents, emails", tools: "Claude · ChatGPT" },
  { task: "Presentations", tools: "Gamma · Claude · ChatGPT" },
  { task: "Flyers and design", tools: "Canva" },
  { task: "Excel and data", tools: "Microsoft 365 Copilot · ChatGPT" },
  { task: "Research with sources", tools: "Perplexity · NotebookLM" },
  { task: "Meeting notes", tools: "Fireflies · Otter" },
  { task: "Websites, apps, dashboards", tools: "Claude · Lovable · Replit" },
  { task: "Workflow agents", tools: "Copilot Studio · n8n · Zapier" },
];

// From deck slide 16 ("Use AI, protect people's data").
export const SAFETY = {
  do: [
    "Use company-approved accounts",
    "Turn off 'train on my data' on any personal account",
    "Use aggregate or synthetic data where you can",
    "Check AI output before it leaves the team",
    "Ask IT when unsure",
  ],
  dont: [
    "Paste employee data, salaries, CVs or customer lists into personal tools",
    "Assume removing names makes data anonymous: employee codes are identifiers too",
    "Let an agent send external emails or payments without approval",
    "Trust a citation you haven't opened",
  ],
};

// DRAFT for Shreesha's approval: 10 starter prompts (placeholders in [brackets]).
export const HR_PROMPTS = [
  { title: "Job description", prompt: "You are an HR recruiter at a nutraceutical and animal-health company. Draft a job description for [role]: purpose, 6 key responsibilities, must-have and nice-to-have skills, and a 2-line company intro. Mark anything you're unsure of as [TO CONFIRM]." },
  { title: "Employee announcement", prompt: "Write a warm, clear 120-word announcement to all employees about [event or policy]. Include what, when, who it affects and who to contact. Mark gaps as [TO CONFIRM]." },
  { title: "Policy answer with source", prompt: "Using only the approved policy I've attached, answer: [question]. Quote the exact section and page. If the policy doesn't cover it, say so instead of guessing." },
  { title: "Interview questions", prompt: "Create 8 competency-based interview questions for [role], each with what a strong answer and a weak answer sound like." },
  { title: "Offer letter template", prompt: "Draft an offer letter template for [role] with placeholders for [CTC], [joining date], [location] and [reporting manager]. Don't invent any numbers." },
  { title: "Spot trends in a tracker", prompt: "This is an anonymised [attrition / hiring] table. Find the 3 biggest trends, flag any odd numbers, and suggest one chart for each. Show your working so I can check the totals." },
  { title: "Summarise feedback", prompt: "Summarise these anonymised survey comments into 5 themes, with one example comment and one suggested action for each." },
  { title: "Meeting minutes", prompt: "Turn these rough notes into minutes: decisions made, action items with owner and due date, and open questions." },
  { title: "Make an email clearer", prompt: "Rewrite this email to be shorter, clearer and kind. Keep every fact. Then list what you changed." },
  { title: "Onboarding plan", prompt: "Create a 4-week onboarding plan for a new [role]: week by week, with owners, checkpoints and the one thing they should be able to do by the end of each week." },
];

/* ------------------------------ autopilot run of show ------------------------------ */
// Budgets in seconds; they add up to the 75-minute plan. Each step ends when it's
// done or its budget runs out. Shreesha can pause, skip or go back at any time.
export const SHOW_STEPS: Array<{ id: string; label: string; budget: number }> = [
  { id: "welcome", label: "Act 1 · You introduce Shree", budget: 180 },
  { id: "intros", label: "Act 2 · Meet the team", budget: 480 },
  { id: "before", label: "Act 2 · AI confidence check (start)", budget: 60 },
  { id: "quiz", label: "Act 3 · Quiz", budget: 480 },
  { id: "story", label: "Act 4 · The Story", budget: 1080 },
  { id: "debate", label: "Act 4 · Poll: 900 agents", budget: 120 },
  { id: "mirror", label: "Act 5 · The Mirror", budget: 330 },
  { id: "qa", label: "Act 6 · Ask anything", budget: 420 },
  { id: "finale", label: "Act 7 · Results", budget: 300 },
  { id: "close", label: "Act 7 · Close", budget: 120 },
];

/** The Story ends just before the first slide that matches this (the Q&A slide, or the old flyer slide). */
export const STORY_END_RE = /ASK ANYTHING|FLYER CHALLENGE/i;

/** Documents Shree can push to phones. The [SHARE PDF] tag in a slide's notes shares SHARED_DOCS[0]. */
export const SHARED_DOCS = [
  {
    key: "hr-ai-use-cases",
    title: "More AI ways for your HR function",
    sub: "Use cases and tools by function (TA, L&D, HRBP, HR Ops, Total Rewards, Shared Services). Start with the 1,000-employee column: it's closest to our size.",
    url: "/presenter/docs/hr-ai-use-cases-by-function.pdf",
  },
];
