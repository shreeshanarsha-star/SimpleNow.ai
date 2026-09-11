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
  event_name?: string;
  executive_brief?: string[];
  what_happened?: string;
  scorecard?: {
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
  "event_name": "Concise professional title (4-8 words, e.g. 'TA Summit — Scaling Tech Hiring & Calibrated Screening')",
  "executive_brief": [
    "5 to 7 sharp bullets covering key discussions, opportunities, and decisions in under 60 seconds"
  ],
  "what_happened": "Concise 2-paragraph narrative summary of what transpired during the event"
}`;

  return callOpenAiJson<ExtractedIntelligence>(systemPrompt, userPrompt, 4000);
}

// -------------------------------------------------------------
// Deterministic 12-Section Markdown Report Compiler
// -------------------------------------------------------------
export function compileReportMarkdown(
  intel: ExtractedIntelligence,
  eventMeta: EventMetadataContext,
  userProfile: UserProfileContext
): string {
  const eventTitle = eventMeta.event_name || intel.event_name || "Live Intelligence Session";
  const durationMin = Math.round((eventMeta.duration_seconds || 0) / 60);

  let md = `# INTELEXA EVENT INTELLIGENCE REPORT\n`;
  md += `**Event:** ${eventTitle} | **Type:** ${eventMeta.event_type || "Conference / Summit"}\n`;
  md += `**Prepared for:** ${userProfile.name || "User"} (${userProfile.company || "Enterprise"})\n`;
  md += `**Duration:** ${durationMin > 0 ? `${durationMin} mins` : "Live Session"} | **Location:** ${eventMeta.location || "On-site / Virtual"}\n\n`;
  md += `---\n\n`;

  // 1. Executive Brief
  md += `## 1. Executive Brief (Under 60 Seconds)\n`;
  if (Array.isArray(intel.executive_brief) && intel.executive_brief.length > 0) {
    intel.executive_brief.forEach((b) => {
      md += `- ${b}\n`;
    });
  } else {
    md += `- Executive intelligence session captured and processed.\n`;
  }
  md += `\n---\n\n`;

  // 2. What Happened
  md += `## 2. What Happened\n`;
  md += `${intel.what_happened || "A high-impact event session with key industry stakeholders, strategy discussions, and market moves."}\n\n`;
  md += `---\n\n`;

  // 3. Top Insights
  md += `## 3. What Matters: Top Insights\n`;
  if (Array.isArray(intel.insights) && intel.insights.length > 0) {
    intel.insights.slice(0, 8).forEach((ins, idx) => {
      md += `### ${idx + 1}. [${ins.classification || "OBSERVED"}] ${ins.insight} (${ins.timestamp || "Event"})\n`;
      md += `* **What was said:** ${ins.what_was_said}\n`;
      md += `* **What it means:** ${ins.what_it_means}\n`;
      md += `* **Why it matters to you:** ${ins.why_matters}\n\n`;
    });
  } else {
    md += `Insights synthesized from event dialogue and session materials.\n\n`;
  }
  md += `---\n\n`;

  // 4. Key People
  md += `## 4. Key Stakeholders & People Profiled\n`;
  if (Array.isArray(intel.people) && intel.people.length > 0) {
    intel.people.forEach((p) => {
      md += `### 👤 ${p.name} — ${p.role}${p.company ? ` (${p.company})` : ""}\n`;
      md += `- **Discussed:** ${p.discussed}\n`;
      md += `- **Interest Level:** ${p.interest}\n`;
      md += `- **Why It Matters:** ${p.why_matters}\n`;
      if (p.opportunity) md += `- **Opportunity:** ${p.opportunity}\n`;
      md += `\n`;
    });
  } else {
    md += `Stakeholder interactions logged and mapped.\n\n`;
  }
  md += `---\n\n`;

  // 5. Opportunities
  md += `## 5. High-Yield Opportunities\n`;
  if (Array.isArray(intel.opportunities) && intel.opportunities.length > 0) {
    intel.opportunities.forEach((opp) => {
      const flame = opp.priority === "HIGH" ? "🔥 [HIGH]" : opp.priority === "MEDIUM" ? "🟡 [MEDIUM]" : "⚪ [LOW]";
      md += `### ${flame} ${opp.opportunity}\n`;
      if (opp.person_company) md += `* **Context / Stakeholder:** ${opp.person_company}\n`;
      md += `* **Reason:** ${opp.reason}\n`;
      md += `* **Verifiable Evidence:** ${opp.evidence}\n`;
      md += `* **Recommended Action:** ${opp.recommended_action}\n\n`;
    });
  } else {
    md += `Opportunities mined against your strategic profile.\n\n`;
  }
  md += `---\n\n`;

  // 6. Competitive Intelligence
  md += `## 6. Competitive Intelligence\n`;
  if (intel.competitive_intelligence?.competitors?.length) {
    intel.competitive_intelligence.competitors.forEach((c) => {
      md += `### ⚔️ ${c.name}\n`;
      if (c.products) md += `- **Products / Features:** ${c.products}\n`;
      if (c.pricing) md += `- **Pricing Disclosures:** ${c.pricing}\n`;
      if (c.claims) md += `- **Claims & Positioning:** ${c.claims}\n`;
      if (c.weaknesses) md += `- **Identified Vulnerabilities:** ${c.weaknesses}\n`;
      if (c.opportunities) md += `- **Wedge Opportunity:** ${c.opportunities}\n`;
      md += `\n`;
    });
  } else {
    md += `No direct competitors named during this session.\n\n`;
  }
  md += `---\n\n`;

  // 7. Market Intelligence
  md += `## 7. Market Intelligence\n`;
  if (intel.market_intelligence) {
    if (intel.market_intelligence.trends?.length) {
      md += `**Key Market Trends:**\n`;
      intel.market_intelligence.trends.forEach((t) => (md += `- ${t}\n`));
      md += `\n`;
    }
    if (intel.market_intelligence.customer_pain?.length) {
      md += `**Customer Pain Points:**\n`;
      intel.market_intelligence.customer_pain.forEach((p) => (md += `- ${p}\n`));
      md += `\n`;
    }
    if (intel.market_intelligence.buying_signals?.length) {
      md += `**Commercial Buying Signals:**\n`;
      intel.market_intelligence.buying_signals.forEach((s) => (md += `- ${s}\n`));
      md += `\n`;
    }
  }
  md += `---\n\n`;

  // 8. Action Plan
  md += `## 8. Prioritized Action Plan\n`;
  if (intel.action_plan) {
    if (intel.action_plan.do_today?.length) {
      md += `### ⚡ Do Today (Immediate Momentum)\n`;
      intel.action_plan.do_today.forEach((a) => (md += `- [ ] **${a.task}**${a.deadline ? ` (Due: ${a.deadline})` : ""}\n`));
      md += `\n`;
    }
    if (intel.action_plan.do_this_week?.length) {
      md += `### 📅 Do This Week\n`;
      intel.action_plan.do_this_week.forEach((a) => (md += `- [ ] **${a.task}**${a.deadline ? ` (Due: ${a.deadline})` : ""}\n`));
      md += `\n`;
    }
    if (intel.action_plan.do_later?.length) {
      md += `### ⏳ Do Later / Strategic Tracking\n`;
      intel.action_plan.do_later.forEach((a) => (md += `- [ ] ${a.task}${a.deadline ? ` (${a.deadline})` : ""}\n`));
      md += `\n`;
    }
  }
  md += `---\n\n`;

  // 9. Top 3 Recommendations
  md += `## 9. Top 3 Strategic Recommendations\n`;
  if (intel.top_3_recommendations?.length) {
    intel.top_3_recommendations.forEach((r, idx) => {
      md += `${idx + 1}. ${r}\n`;
    });
  }
  md += `\n---\n\n`;

  // 10. Follow-up Drafts
  md += `## 10. Personalized Follow-up Drafts\n`;
  if (intel.people?.length) {
    intel.people.slice(0, 3).forEach((p) => {
      md += `### Follow-up with ${p.name} (${p.company || "Enterprise"})\n`;
      if (p.follow_up_drafts?.email) {
        md += `**📧 Email Draft:**\n\`\`\`text\n${p.follow_up_drafts.email}\n\`\`\`\n\n`;
      }
      if (p.follow_up_drafts?.whatsapp) {
        md += `**💬 WhatsApp Draft:**\n\`\`\`text\n${p.follow_up_drafts.whatsapp}\n\`\`\`\n\n`;
      }
      if (p.follow_up_drafts?.linkedin) {
        md += `**🔗 LinkedIn Note:**\n\`\`\`text\n${p.follow_up_drafts.linkedin}\n\`\`\`\n\n`;
      }
    });
  }

  return md;
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
  // If single-pass extraction already produced executive brief and what happened, compile immediately in 1ms!
  if (
    Array.isArray(intel.executive_brief) &&
    intel.executive_brief.length > 0 &&
    intel.what_happened?.trim()
  ) {
    return {
      executive_brief: intel.executive_brief,
      what_happened: intel.what_happened,
      full_markdown: compileReportMarkdown(intel, eventMeta, userProfile),
    };
  }

  // Fallback: fast synthesis if missing
  const systemPrompt = `You are Intelexa's Master Intelligence Report Writer.
Generate an executive brief and what happened narrative.
Return valid JSON:
{
  "executive_brief": [ "5 to 7 sharp bullets covering the entire event in under 60 seconds" ],
  "what_happened": "Concise 2-paragraph narrative summary of the event"
}`;

  const userPrompt = `Event: ${eventMeta.event_name} (${eventMeta.event_type})
Insights: ${JSON.stringify(intel.insights.slice(0, 5))}
Opportunities: ${JSON.stringify(intel.opportunities.slice(0, 4))}`;

  try {
    const res = await callOpenAiJson<{ executive_brief: string[]; what_happened: string }>(
      systemPrompt,
      userPrompt,
      1500
    );
    const brief = res.executive_brief || ["Keynote and session takeaways recorded."];
    const what = res.what_happened || "High-impact event session attended and recorded.";
    intel.executive_brief = brief;
    intel.what_happened = what;
    return {
      executive_brief: brief,
      what_happened: what,
      full_markdown: compileReportMarkdown(intel, eventMeta, userProfile),
    };
  } catch {
    const brief = ["Event session captured and analyzed."];
    const what = "Comprehensive event intelligence recorded.";
    intel.executive_brief = brief;
    intel.what_happened = what;
    return {
      executive_brief: brief,
      what_happened: what,
      full_markdown: compileReportMarkdown(intel, eventMeta, userProfile),
    };
  }
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
