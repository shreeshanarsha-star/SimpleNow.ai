// Intelexa AI Intelligence Pipeline
// Implements multi-stage extraction, provenance tagging ([OBSERVED], [INFERRED], [RECOMMENDED]),
// user-profile personalization, 13-section report generation, and timestamped Q&A.

import { getModel, callVisionModel } from "./aiClient";

export interface UserProfileContext {
  name?: string;
  email?: string;
  whatsapp_number?: string;
  job_title?: string;
  company?: string;
  industry?: string;
  business_interests?: string;
  products_services?: string;
  target_customers?: string;
  geography?: string;
  professional_objectives?: string;
  what_matters_to_me?: string;
}

export interface EventMetadataContext {
  event_name?: string;
  event_type?: string;
  objectives?: string[];
  watch_for?: string;
  location?: string;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  user_notes?: string;
  attachments?: Array<{ name: string; type: string; base64: string }>;
}

export interface TranscriptSegment {
  start: string;
  end: string;
  speaker?: string;
  text: string;
}

async function callOpenAiJson<T>(systemPrompt: string, userPrompt: string, maxTokens = 3500): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const model = getModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from AI engine.");

    return JSON.parse(content) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAiText(systemPrompt: string, userPrompt: string, maxTokens = 3500): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const model = getModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API error (${res.status}): ${errBody.slice(0, 300)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } finally {
    clearTimeout(timer);
  }
}

// -------------------------------------------------------------
// Auto Event Naming (Section 8)
// -------------------------------------------------------------
export async function generateAutomaticEventName(transcriptSnippet: string): Promise<string> {
  const systemPrompt = `You are Intelexa's event naming engine. Given a transcript excerpt from an event, generate a concise, professional event title.
Rules:
- 4 to 8 words maximum.
- Format: "[Host/Company/Topic] — [Core Theme]" (e.g. "LinkedIn — The Rise of AI Agents", "B2B SaaS Summit — Scaling GTM & Pricing").
- Never invent metadata or venue names not present.
- Return valid JSON: { "event_name": string }`;

  try {
    const res = await callOpenAiJson<{ event_name: string }>(
      systemPrompt,
      `Transcript excerpt:\n${transcriptSnippet.slice(0, 3000)}`
    );
    return res.event_name || "Live Intelligence Session";
  } catch {
    return "Live Intelligence Session";
  }
}

// -------------------------------------------------------------
// Vision AI: Extract Data from Presentation Slides & Screenshots
// -------------------------------------------------------------
export async function extractSlideIntelligence(
  attachments: Array<{ name: string; type: string; base64: string }>
): Promise<string[]> {
  const extractedSlides: string[] = [];
  for (const att of attachments.slice(0, 5)) {
    try {
      const prompt = `You are Intelexa's Slide & Visual Intelligence Engine.
Examine this conference presentation slide, chart, diagram, or whiteboard screenshot.
Extract:
1. Slide Title / Headline
2. Key Data Points, Percentages, Architecture Components, or Frameworks
3. Any Speaker, Company, or Competitor names visible.
Be concise, bullet-pointed, and factual. Do not speculate.`;

      const slideText = await callVisionModel(prompt, att.base64, 500);
      if (slideText?.trim()) {
        extractedSlides.push(`[Slide: "${att.name}"]\n${slideText.trim()}`);
      }
    } catch (err) {
      console.warn(`[intelexa:vision] Failed to analyze slide image ${att.name}:`, err);
    }
  }
  return extractedSlides;
}

// -------------------------------------------------------------
// Stage 2 & 3 & 4 & 5: Deep Multi-Stage Extraction & Personalization
// -------------------------------------------------------------
export interface ExtractedIntelligence {
  entities: {
    people: string[];
    companies: string[];
    products: string[];
    locations: string[];
    technologies: string[];
    competitors: string[];
    topics: string[];
  };
  live_signals: Array<{
    time?: string;
    tag: string;
    text: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
  }>;
  insights: Array<{
    insight: string;
    what_was_said: string;
    what_it_means: string;
    why_matters: string;
    timestamp: string;
    classification: "OBSERVED" | "INFERRED" | "RECOMMENDED";
    priority: "HIGH" | "MEDIUM" | "LOW";
  }>;
  people: Array<{
    name: string;
    role: string;
    company: string;
    discussed: string;
    interest: string;
    why_matters: string;
    opportunity: string;
    timestamp: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    follow_up_drafts: {
      email: string;
      whatsapp: string;
      linkedin: string;
    };
  }>;
  companies: Array<{
    name: string;
    domain_or_industry?: string;
    context: string;
  }>;
  opportunities: Array<{
    priority: "HIGH" | "MEDIUM" | "LOW";
    opportunity: string;
    person_company: string;
    reason: string;
    evidence: string;
    recommended_action: string;
  }>;
  competitive_intelligence: {
    competitors: Array<{
      name: string;
      products?: string;
      pricing?: string;
      claims?: string;
      positioning?: string;
      weaknesses?: string;
      opportunities?: string;
    }>;
  };
  market_intelligence: {
    trends: string[];
    customer_pain: string[];
    tech_shifts?: string[];
    market_movements?: string[];
    buying_signals: string[];
  };
  action_plan: {
    do_today: Array<{ task: string; deadline?: string; priority?: string }>;
    do_this_week: Array<{ task: string; deadline?: string; priority?: string }>;
    do_later: Array<{ task: string; deadline?: string; priority?: string }>;
  };
  top_3_recommendations: string[];
  scorecard: {
    knowledge_score: number;
    opportunities_score: number;
    networking_score: number;
    competitive_score: number;
    overall_score: number;
    rationale: string;
  };
}

export async function processEventIntelligence(
  transcriptText: string,
  userProfile: UserProfileContext,
  eventMeta: EventMetadataContext
): Promise<ExtractedIntelligence> {
  let visualSlidesContext = "";
  if (eventMeta.attachments && eventMeta.attachments.length > 0) {
    const slideSummaries = await extractSlideIntelligence(eventMeta.attachments);
    if (slideSummaries.length > 0) {
      visualSlidesContext = `\n\nPRESENTATION SLIDES & VISUAL SCREENSHOTS:\n${slideSummaries.join("\n\n")}`;
    }
  }

  let userNotesContext = "";
  if (eventMeta.user_notes?.trim()) {
    userNotesContext = `\n\nUSER'S PERSONAL LIVE NOTES & OBSERVATIONS:\n${eventMeta.user_notes.trim()}\n(CRITICAL: The user noted these during the session. Weave their questions, speaker names, and observations directly into the intelligence extraction.)`;
  }

  const systemPrompt = `You are Intelexa, the elite Personal Event Intelligence Agent inside SimpleNow.ai.
Your mission is to transform live conversation transcripts, presentation slides, and user notes into high-yield, structured business intelligence:
Knowledge + People + Opportunities + Decisions + Actions.

CRITICAL AI RULES:
1. PROVENANCE INTEGRITY: Every insight MUST be classified as:
   - "OBSERVED": Directly supported by what was spoken verbatim or shown on presentation slides.
   - "INFERRED": Reasonable, logical interpretation by the AI.
   - "RECOMMENDED": Prescriptive recommendation based on the user's objectives.
   Never attribute AI inferences to a speaker.
2. PERSONALIZATION: Evaluate all content through the user's persistent profile:
   User Name: ${userProfile.name || "The User"}
   Job Title: ${userProfile.job_title || "Executive / Founder"}
   Company: ${userProfile.company || "Enterprise"}
   Industry: ${userProfile.industry || "Technology"}
   What Matters: ${userProfile.what_matters_to_me || userProfile.business_interests || "High-value business opportunities"}
   Event Objectives: ${(eventMeta.objectives || []).join(", ") || "General Intelligence"}
   Watch For: ${eventMeta.watch_for || "Relevant business opportunities and competitive moves"}
3. MULTIMODAL SYNTHESIS: Fuse spoken dialogue with presentation slides and user notes. If a key architecture diagram or metric was on a slide, incorporate it into insights and knowledge.
4. PRESERVE DEADLINES: Where deadlines were explicitly mentioned, preserve them verbatim. Do not invent dates.
5. ACTIONABILITY: For key people detected, create realistic, contextual follow-up drafts for Email, WhatsApp, and LinkedIn based on actual spoken remarks.
6. SCORECARD: Provide honest, objective assessment scores (0-100) for Knowledge Gained, Business Opportunities, Networking Value, Competitive Intelligence, and Overall Event Value.

Return a strictly valid JSON object matching the requested schema.`;

  const userPrompt = `Event Name: ${eventMeta.event_name || "Event"}
Event Type: ${eventMeta.event_type || "Live Event"}
Transcript:
${transcriptText.slice(0, 24000)}
${visualSlidesContext}
${userNotesContext}

Generate the complete structured JSON response matching this schema:
{
  "entities": {
    "people": ["string"],
    "companies": ["string"],
    "products": ["string"],
    "locations": ["string"],
    "technologies": ["string"],
    "competitors": ["string"],
    "topics": ["string"]
  },
  "live_signals": [
    { "time": "00:00:00", "tag": "string", "text": "string", "priority": "HIGH" }
  ],
  "insights": [
    {
      "insight": "string",
      "what_was_said": "string",
      "what_it_means": "string",
      "why_matters": "string",
      "timestamp": "00:00:00",
      "classification": "OBSERVED" | "INFERRED" | "RECOMMENDED",
      "priority": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "people": [
    {
      "name": "string",
      "role": "string",
      "company": "string",
      "discussed": "string",
      "interest": "string",
      "why_matters": "string",
      "opportunity": "string",
      "timestamp": "00:00:00",
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "follow_up_drafts": {
        "email": "string",
        "whatsapp": "string",
        "linkedin": "string"
      }
    }
  ],
  "companies": [
    { "name": "string", "domain_or_industry": "string", "context": "string" }
  ],
  "opportunities": [
    {
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "opportunity": "string",
      "person_company": "string",
      "reason": "string",
      "evidence": "string",
      "recommended_action": "string"
    }
  ],
  "competitive_intelligence": {
    "competitors": [
      {
        "name": "string",
        "products": "string",
        "pricing": "string",
        "claims": "string",
        "positioning": "string",
        "weaknesses": "string",
        "opportunities": "string"
      }
    ]
  },
  "market_intelligence": {
    "trends": ["string"],
    "customer_pain": ["string"],
    "buying_signals": ["string"]
  },
  "action_plan": {
    "do_today": [{ "task": "string", "deadline": "string", "priority": "HIGH" }],
    "do_this_week": [{ "task": "string", "deadline": "string", "priority": "MEDIUM" }],
    "do_later": [{ "task": "string", "deadline": "string", "priority": "LOW" }]
  },
  "top_3_recommendations": [
    "1. string",
    "2. string",
    "3. string"
  ],
  "scorecard": {
    "knowledge_score": 85,
    "opportunities_score": 90,
    "networking_score": 80,
    "competitive_score": 75,
    "overall_score": 84,
    "rationale": "string"
  }
}`;

  return callOpenAiJson<ExtractedIntelligence>(systemPrompt, userPrompt, 4000);
}

// -------------------------------------------------------------
// Stage 6: Polish 13-Section Report Construction
// -------------------------------------------------------------
export interface EventReportResult {
  executive_brief: string[];
  what_happened: string;
  full_markdown: string;
}

export async function constructEventReport(
  intel: ExtractedIntelligence,
  eventMeta: EventMetadataContext,
  userProfile: UserProfileContext
): Promise<EventReportResult> {
  const systemPrompt = `You are Intelexa's Master Intelligence Report Writer.
Generate a structured, executive-grade Event Intelligence Report adhering to the strict 13-section format.
Tone: Highly intelligent, concise, strategic, polished.
Return valid JSON:
{
  "executive_brief": [ "5 to 7 sharp bullets covering the entire event in under 60 seconds" ],
  "what_happened": "Concise 2-paragraph narrative summary of the event",
  "full_markdown": "Full Markdown formatted report containing all 13 sections"
}`;

  const userPrompt = `Event: ${eventMeta.event_name} (${eventMeta.event_type})
Location: ${eventMeta.location || "Bengaluru / Virtual"}
Duration: ${Math.round((eventMeta.duration_seconds || 0) / 60)} minutes
User: ${userProfile.name || "User"} (${userProfile.company || "Enterprise"})
${eventMeta.user_notes ? `User Live Notes: ${eventMeta.user_notes}\n` : ""}
Extracted Data:
${JSON.stringify({
  insights: intel.insights.slice(0, 8),
  people: intel.people.slice(0, 5),
  opportunities: intel.opportunities.slice(0, 6),
  competitive: intel.competitive_intelligence,
  actions: intel.action_plan,
  top3: intel.top_3_recommendations,
  scorecard: intel.scorecard
}, null, 2)}

Ensure the full_markdown contains:
1. Executive Brief (5-7 bullets)
2. What Happened
3. What Matters (Top Insights with [OBSERVED], [INFERRED], [RECOMMENDED] tags & timestamps)
4. People (Key stakeholders with role, company, discussion, and opportunity)
5. Opportunities (High, Medium, Low priority with evidence and recommended actions)
6. Competitive Intelligence (Competitors, products, pricing, claims, weaknesses)
7. Market Intelligence (Trends, customer pain, tech shifts, buying signals)
8. Action Plan (Do Today, Do This Week, Do Later)
9. Top 3 Recommendations ("If I only do three things...")
10. People to Follow Up With
11. Follow-up Drafts (Email, WhatsApp, LinkedIn)
12. Event Scorecard (Knowledge, Opportunities, Networking, Competitive, Overall /100)
13. Delivery & Next Actions`;

  return callOpenAiJson<EventReportResult>(systemPrompt, userPrompt, 3800);
}

// -------------------------------------------------------------
// Stage 7: Event Q&A ("Ask Intelexa" with Citations)
// -------------------------------------------------------------
export interface QAResult {
  answer: string;
  citations: string[];
}

export async function askIntelexa(
  question: string,
  eventContext: {
    event_name: string;
    transcriptText: string;
    intelligence: ExtractedIntelligence;
    reportMarkdown: string;
  }
): Promise<QAResult> {
  const systemPrompt = `You are Intelexa, answering questions about a specific attended event.
Guidelines:
- Ground your answers in the event transcript and extracted intelligence.
- ALWAYS reference timestamps when citing what speakers said (e.g. "[00:12:35]").
- If the user asks for a briefing, summary, sales pitch, or competitor comparison, produce a crisp, executive-ready response.
- Format with markdown bullets and bold emphasis.
- Return JSON: { "answer": string, "citations": ["timestamp strings like 00:12:35"] }`;

  const userPrompt = `Event: ${eventContext.event_name}
User Question: "${question}"

Executive Report Summary:
${eventContext.reportMarkdown.slice(0, 3000)}

Transcript Excerpt:
${eventContext.transcriptText.slice(0, 16000)}`;

  return callOpenAiJson<QAResult>(systemPrompt, userPrompt, 1500);
}
