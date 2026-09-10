// Synthetic Demonstration Event for Intelexa.ai
// Strictly flagged as DEMO DATA per Requirement 29.
// Demonstrates the full capabilities of Intelexa without requiring a 2-hour live recording.

export const DEMO_EVENT_ID = "demo-techsparks-2026-bengaluru";

export const DEMO_PROFILE = {
  name: "Shreesha",
  email: "shree@simplenow.ai",
  whatsapp_number: "+91 98860 12345",
  job_title: "Founder & Product Architect",
  company: "SimpleNow.ai",
  industry: "Enterprise AI & HR Technology",
  business_interests: "AI agents, autonomous workflows, recruitment technology, ATS integration, enterprise sales",
  products_services: "SimpleNow.ai suite (Talent.ai, Smart Screen, Intelexa.ai)",
  target_customers: "VPs of Talent Acquisition, HR Directors, Tech Founders, Enterprise Operations Heads",
  geography: "India & Global",
  professional_objectives: "Scale SimpleNow enterprise adoption, secure pilot customers for Talent.ai & Intelexa, forge recruitment tech partnerships",
  what_matters_to_me: "I am interested in AI, recruitment technology, enterprise sales, HR technology and identifying high-value business opportunities."
};

export const DEMO_EVENT = {
  id: DEMO_EVENT_ID,
  event_name: "TechSparks 2026: The Agentic Enterprise — AI in Action",
  event_type: "Conference",
  objectives: ["Find business opportunities", "Competitive intelligence", "Networking", "Learn"],
  watch_for: "Look for TA heads and enterprise leaders who may need AI recruitment automation and ATS integration.",
  start_time: "2026-09-10T17:04:00+05:30",
  end_time: "2026-09-10T19:12:00+05:30",
  duration_seconds: 7680, // 2h 08m
  location: "Marriott Grand Ballroom, Bengaluru",
  recording_status: "stopped",
  processing_status: "completed",
  processing_step: "Report Delivered",
  is_demo: true,
  recipients: [
    { name: "Shreesha", email: "shree@simplenow.ai", whatsapp: "+91 98860 12345", delivery_email: true, delivery_whatsapp: true, is_primary: true },
    { name: "Rahul (Co-founder)", email: "rahul@simplenow.ai", whatsapp: "+91 98860 54321", delivery_email: true, delivery_whatsapp: true, is_primary: false }
  ],
  metadata: {
    venue: "Marriott, Bengaluru",
    attendee_count: "~350 leaders",
    audio_quality: "High (Multi-speaker mic setup)"
  }
};

export const DEMO_TRANSCRIPT = {
  full_text: `[00:00:15] Welcome everyone to TechSparks 2026 Bengaluru. Tonight our keynote focus is: The Autonomous Enterprise — How AI agents are moving from simple conversational chatbots toward autonomous workflow execution.
[00:04:20] Keynote Speaker Dr. Ananya Sen: In 2024 and 2025, companies bought copilot licenses. In 2026, enterprise buyers are asking for agents that actually execute tasks across disconnected databases, ERPs, and Applicant Tracking Systems.
[00:12:35] Rahul Sharma (VP Talent Acquisition, ABC Corp): Speaking as a buyer running a 4,000-person tech hiring engine, our biggest pain point isn't sourcing candidates. LinkedIn and recruiters generate thousands of resumes. Our bottleneck is screening calibration and legacy ATS integration with Workday and SuccessFactors. Current tools hallucinate scores and don't match our hiring managers' actual unspoken rubrics.
[00:22:10] Priya Nair (Chief Technology Officer, CloudForge): We tried deploying LinkedIn's Hiring Assistant last quarter. While the UI is slick, the cost is prohibitive at $18,000 per recruiter seat per year, and it locks you completely into LinkedIn's walled garden. We need modular solutions that sit on top of our existing tech stack.
[00:38:50] Panel Moderator: Rahul, what would make ABC Corp switch or pilot a new AI recruitment tool today?
[00:39:15] Rahul Sharma: If a vendor can show me two things: First, zero integration friction — it ingests our custom scorecard criteria without needing a six-month IT project. Second, verified provenance — whenever an AI screens or rejects a candidate, it must cite exact resume evidence. If someone can demo that on our open requisition tomorrow morning, I'd sign a pilot before Friday.
[00:54:30] Vikram Malhotra (Managing Partner, Deccan Horizons Venture Fund): From an investor perspective, the winners in vertical SaaS won't be generic note-takers or wrapper apps. The winners will be agents that capture live context, structure private enterprise data, and turn conversations directly into revenue pipeline.
[01:15:20] Dr. Ananya Sen: Look at the emerging compliance standards in the EU and India's DPDP Act. Automated AI scoring without human-in-the-loop audit logs is becoming a major legal risk. Enterprise legal teams are blocking black-box AI tools.
[01:34:40] Audience Q&A - Shreesha asks: Rahul, regarding your ATS friction, how is ABC Corp handling privacy and candidate opt-in when automating WhatsApp candidate outreach?
[01:35:10] Rahul Sharma: Excellent question. Right now, recruiters do WhatsApp manually from personal phones because our ATS doesn't support verified WhatsApp Business Cloud API workflows with explicit opt-in logging. That's a huge compliance headache and lost time. If a platform unified calibrated screening with compliant multi-channel outreach, we would jump on it immediately.
[01:58:15] Panel wrap-up: Key takeaway: AI is transitioning from passive chatbots to proactive intelligence agents that listen, understand, and drive immediate execution.`,
  segments: [
    { start: "00:00:15", end: "00:04:20", speaker: "Moderator", text: "Keynote opening: The Autonomous Enterprise — How AI agents are moving from simple conversational chatbots toward autonomous workflow execution." },
    { start: "00:04:20", end: "00:12:35", speaker: "Dr. Ananya Sen", text: "In 2026, enterprise buyers are asking for agents that actually execute tasks across disconnected databases, ERPs, and ATS systems." },
    { start: "00:12:35", end: "00:22:10", speaker: "Rahul Sharma (VP TA, ABC Corp)", text: "Our bottleneck is screening calibration and legacy ATS integration with Workday and SuccessFactors. Current tools hallucinate scores." },
    { start: "00:22:10", end: "00:38:50", speaker: "Priya Nair (CTO, CloudForge)", text: "LinkedIn Hiring Assistant is $18,000 per seat per year and locks you into LinkedIn. We need modular solutions." },
    { start: "00:39:15", end: "00:45:00", speaker: "Rahul Sharma", text: "If a vendor shows zero integration friction and verified resume evidence citations, I would sign a pilot before Friday." },
    { start: "00:54:30", end: "01:05:00", speaker: "Vikram Malhotra (Partner, Deccan Horizons)", text: "Winners in vertical SaaS will turn live conversations and context directly into structured revenue pipeline." },
    { start: "01:15:20", end: "01:25:00", speaker: "Dr. Ananya Sen", text: "EU & DPDP compliance requires human-in-the-loop audit logs. Black-box screening algorithms are being blocked by legal." },
    { start: "01:34:40", end: "01:38:10", speaker: "Shreesha & Rahul Sharma", text: "Recruiters currently do WhatsApp manually from personal phones with zero ATS integration. Huge compliance headache." },
    { start: "01:58:15", end: "02:08:00", speaker: "Panel Wrap-up", text: "AI is transitioning from passive chatbots to proactive intelligence agents that listen, understand, and execute." }
  ]
};

export const DEMO_INTELLIGENCE = {
  entities: {
    people: ["Rahul Sharma", "Dr. Ananya Sen", "Priya Nair", "Vikram Malhotra", "Shreesha"],
    companies: ["ABC Corp", "CloudForge", "LinkedIn", "Workday", "SuccessFactors", "Deccan Horizons", "SimpleNow.ai"],
    products: ["LinkedIn Hiring Assistant", "Workday ATS", "SuccessFactors", "Talent.ai", "Smart Screen.ai", "Intelexa.ai"],
    topics: ["Autonomous AI Agents", "Recruitment Automation", "ATS Integration Friction", "Candidate WhatsApp Outreach", "DPDP Compliance", "Enterprise Pilot Readiness"]
  },
  live_signals: [
    { time: "00:12:35", tag: "Pain Point", text: "ABC Corp TA Head expresses severe dissatisfaction with legacy ATS screening hallucination.", priority: "HIGH" },
    { time: "00:22:10", tag: "Competitive Signal", text: "LinkedIn Hiring Assistant criticized for $18k/seat cost and walled-garden lock-in.", priority: "HIGH" },
    { time: "00:39:15", tag: "Immediate Opportunity", text: "Rahul Sharma is open to an immediate pilot for calibrated screening with evidence citations.", priority: "HIGH" },
    { time: "01:35:10", tag: "Unmet Need", text: "Recruiters conducting manual WhatsApp outreach due to lack of compliant ATS integration.", priority: "HIGH" }
  ],
  insights: [
    {
      insight: "Enterprise shift toward agentic workflow execution",
      what_was_said: "Enterprises are moving away from passive copilots toward autonomous agents that carry out multi-step tasks across legacy ERPs and ATSs.",
      what_it_means: "Buying criteria in 2026 has transitioned from conversational chat to reliable back-office workflow execution.",
      why_matters: "Validates SimpleNow's foundational strategy of building task-specific AI systems rather than a generic chatbot.",
      timestamp: "00:04:20",
      classification: "OBSERVED",
      priority: "HIGH"
    },
    {
      insight: "Recruitment screening bottleneck is calibration and evidence provenance, not candidate volume",
      what_was_said: "Recruiters are overwhelmed by volume; existing AI tools hallucinate scores without showing verifiable proof from CVs.",
      what_it_means: "Recruiters and hiring managers distrust AI scoring unless every recommendation links directly to resume excerpts.",
      why_matters: "Direct validation of SimpleNow's Smart Screen.ai architecture which grounds every score in verbatim resume evidence.",
      timestamp: "00:12:35",
      classification: "OBSERVED",
      priority: "HIGH"
    },
    {
      insight: "LinkedIn Hiring Assistant vulnerability due to pricing and vendor lock-in",
      what_was_said: "Priya Nair highlighted that LinkedIn's solution costs $18k/seat/year and traps enterprise data in a closed garden.",
      what_it_means: "Enterprise CTOs are actively seeking vendor-neutral, modular alternatives that connect directly to their private infrastructure.",
      why_matters: "SimpleNow can position itself as an open, cost-effective enterprise alternative with superior data sovereignty.",
      timestamp: "00:22:10",
      classification: "INFERRED",
      priority: "HIGH"
    },
    {
      insight: "Unregulated WhatsApp outreach represents an urgent enterprise compliance hazard",
      what_was_said: "Rahul Sharma confirmed ABC Corp recruiters use personal phones for WhatsApp candidate messaging due to lack of ATS tooling.",
      what_it_means: "Companies face severe DPDP compliance fines and zero visibility into recruiter candidate communications.",
      why_matters: "Opportunity to pitch SimpleNow's automated WhatsApp outreach with built-in opt-in compliance and candidate audit trails.",
      timestamp: "01:35:10",
      classification: "OBSERVED",
      priority: "HIGH"
    }
  ],
  people: [
    {
      name: "Rahul Sharma",
      role: "VP Talent Acquisition",
      company: "ABC Corp",
      discussed: "Struggles with 4,000-person tech hiring engine, screening calibration, legacy Workday friction, and manual WhatsApp messaging.",
      interest: "Extremely high. Explicitly stated he will sign an immediate pilot if demonstrated on an open requisition.",
      why_matters: "Ideal enterprise design partner and high-value customer for Talent.ai and Smart Screen.ai.",
      opportunity: "Enterprise pilot contract for ABC Corp's tech recruitment division.",
      timestamp: "00:39:15",
      priority: "HIGH",
      follow_up_drafts: {
        email: `Subject: Following up from TechSparks Bengaluru — Calibrated screening demo for ABC Corp\n\nHi Rahul,\n\nI really resonated with your point at TechSparks regarding the calibration bottleneck in tech hiring and how existing AI tools hallucinate scores instead of citing verifiable resume proof.\n\nAt SimpleNow, our Smart Screen agent was engineered specifically to solve this: it scores candidates against your hiring managers' exact unspoken rubrics while linking every single point back to verbatim CV excerpts, without requiring a complex ATS overhaul.\n\nCould we run a 15-minute live demonstration on one of ABC Corp's current open requisitions tomorrow or Friday morning?\n\nBest regards,\nShreesha\nFounder, SimpleNow.ai`,
        whatsapp: `Hi Rahul, great connecting at TechSparks Bengaluru! Loved your keynote insights on ATS screening friction and the manual WhatsApp outreach challenge. As mentioned, we built SimpleNow's Smart Screen with verified resume citations to eliminate hallucinated screening scores. Would love to run a 15-min pilot demo on one of your live requisitions this Friday. Let me know if 11:00 AM works! — Shreesha`,
        linkedin: `Hi Rahul — great hearing your panel remarks at TechSparks Bengaluru today on enterprise screening calibration and Workday integration. Your emphasis on verifiable evidence over black-box AI scores matches our exact engineering principles at SimpleNow.ai. Would love to stay connected and share our calibrated screening pilot benchmark.`
      }
    },
    {
      name: "Priya Nair",
      role: "Chief Technology Officer",
      company: "CloudForge",
      discussed: "Enterprise dissatisfaction with LinkedIn's $18k/seat lock-in; need for modular, privacy-preserving AI micro-tools.",
      interest: "Medium-High. Exploring modular AI agents that integrate with internal engineering repos and ATS.",
      why_matters: "Key influencer in mid-market enterprise tech stack decisions.",
      opportunity: "Potential technology partner or customer for SimpleNow's developer & talent tools.",
      timestamp: "00:22:10",
      priority: "MEDIUM",
      follow_up_drafts: {
        email: `Subject: TechSparks Bengaluru — Modular AI agents vs. walled gardens\n\nHi Priya,\n\nYour keynote points regarding LinkedIn Hiring Assistant's prohibitive pricing and walled-garden constraints hit the nail on the head. Enterprise engineering teams need modular, privacy-first agents that sit on their own data.\n\nWe'd love to share an architecture walkthrough of how SimpleNow.ai decouples intelligence from proprietary lock-in. Let's find 15 minutes next week.\n\nWarm regards,\nShreesha`,
        whatsapp: `Hi Priya, really appreciated your panel comments on walled gardens vs modular enterprise AI at TechSparks Bengaluru! Would love to connect and exchange notes on privacy-preserving agentic infrastructure. — Shreesha, SimpleNow.ai`,
        linkedin: `Hi Priya — loved your clear breakdown at TechSparks Bengaluru on the true cost of enterprise vendor lock-in with closed AI assistants. Would love to connect and keep in touch!`
      }
    },
    {
      name: "Vikram Malhotra",
      role: "Managing Partner",
      company: "Deccan Horizons",
      discussed: "Venture perspective on vertical SaaS AI agents that turn real-time interactions into structured revenue pipeline.",
      interest: "High for disruptive enterprise AI architectures with proven customer traction.",
      why_matters: "Potential institutional investor or enterprise client network conduit.",
      opportunity: "Investor introduction & enterprise portfolio customer introductions.",
      timestamp: "00:54:30",
      priority: "MEDIUM",
      follow_up_drafts: {
        email: `Subject: TechSparks discussion — Vertical AI agents converting live context to pipeline\n\nHi Vikram,\n\nYour remark on vertical SaaS winners being agents that capture live context and turn conversations directly into enterprise pipeline resonated deeply.\n\nThat is precisely what we have shipped with Intelexa.ai and the SimpleNow suite. I'd love to share our current traction and demo our agentic workflow over a brief coffee.\n\nBest,\nShreesha`,
        whatsapp: `Hi Vikram, great panel at TechSparks! Your thesis on context-to-pipeline AI agents is exactly what we're executing at SimpleNow.ai. Would love to send you a 2-page brief. — Shreesha`,
        linkedin: `Hi Vikram — your TechSparks remarks on vertical SaaS agents transforming unstructured enterprise conversations into revenue pipeline were spot on. Would love to connect here!`
      }
    }
  ],
  opportunities: [
    {
      priority: "HIGH",
      opportunity: "Immediate enterprise pilot with ABC Corp (4,000 employees)",
      person_company: "Rahul Sharma (VP Talent Acquisition, ABC Corp)",
      reason: "Buyer actively expressed urgent dissatisfaction with current ATS screening and stated he will sign a pilot immediately if shown calibrated screening with evidence citations.",
      evidence: "Rahul verbatim stated at 00:39:15: 'If someone can demo that on our open requisition tomorrow morning, I'd sign a pilot before Friday.'",
      recommended_action: "Send personalized email and WhatsApp draft immediately proposing a 15-minute live pilot demonstration on Friday morning."
    },
    {
      priority: "HIGH",
      opportunity: "Compliant WhatsApp candidate communication module for enterprise ATS",
      person_company: "Enterprise TA Leaders / ABC Corp",
      reason: "Recruiters are conducting unmonitored WhatsApp candidate chats from personal devices, creating severe DPDP compliance liabilities.",
      evidence: "Discussed during Q&A at 01:35:10; acknowledged as widespread industry risk by panel.",
      recommended_action: "Package SimpleNow's candidate WhatsApp outreach feature into a highlighted enterprise compliance one-pager."
    },
    {
      priority: "MEDIUM",
      opportunity: "Displace LinkedIn Hiring Assistant at CloudForge and mid-market tech firms",
      person_company: "Priya Nair (CTO, CloudForge)",
      reason: "CTO explicitly looking for alternatives to LinkedIn's $18,000/seat/year pricing model.",
      evidence: "Priya Nair stated at 00:22:10 that LinkedIn's walled garden lock-in is unacceptable for their engineering roadmap.",
      recommended_action: "Send modular architecture overview showing how SimpleNow integrates with custom applicant pipelines at 80% lower cost."
    },
    {
      priority: "LOW",
      opportunity: "Deccan Horizons venture briefing / portfolio intros",
      person_company: "Vikram Malhotra (Managing Partner)",
      reason: "Seeking vertical AI agents solving real workflow friction.",
      evidence: "Panel remarks at 00:54:30.",
      recommended_action: "Add Vikram on LinkedIn and share a 2-page product brief."
    }
  ],
  competitive_intelligence: {
    competitors: [
      {
        name: "LinkedIn Hiring Assistant",
        products: "Hiring Assistant Copilot",
        pricing: "$18,000 per recruiter seat per year (disclosed by panelist Priya Nair)",
        claims: "Autonomous candidate sourcing and conversational outreach inside LinkedIn",
        positioning: "All-in-one proprietary talent suite",
        weaknesses: "Extreme pricing, locked into LinkedIn walled garden, cannot customize calibration or integrate deeply with private enterprise scorecards",
        opportunities: "Position SimpleNow as the open, customizable, cost-effective enterprise agent that integrates across any ATS."
      },
      {
        name: "Workday / SuccessFactors AI Screening",
        products: "Built-in ATS AI Ranker",
        pricing: "Bundled enterprise tier",
        claims: "Automated candidate fit scoring",
        positioning: "Legacy ERP module",
        weaknesses: "Hallucinated scores, opaque 'black-box' reasoning, zero verified evidence citations, rejected by enterprise legal teams for compliance",
        opportunities: "Offer SimpleNow's Smart Screen as an audit-compliant, evidence-grounded layer on top of Workday."
      }
    ]
  },
  market_intelligence: {
    trends: [
      "Transition from passive copilots to autonomous multi-step agents",
      "Enterprise legal departments actively blocking black-box AI without human-in-the-loop audit trails",
      "Increasing adoption of multi-channel messaging (WhatsApp) for high-response candidate recruitment"
    ],
    customer_pain: [
      "Recruiters overwhelmed by candidate volume while hiring managers complain about poor screening calibration",
      "Opaque AI algorithms hallucinating candidate scores without resume proof",
      "Manual, unlogged WhatsApp candidate communications creating DPDP regulatory liability"
    ],
    buying_signals: [
      "TA leaders ready to approve pilots within 48 hours if proven on real job requisitions with verifiable provenance"
    ]
  },
  action_plan: {
    do_today: [
      { task: "Send personalized follow-up email and WhatsApp message to Rahul Sharma (ABC Corp) requesting Friday pilot demo.", deadline: "Tonight (Sep 10, 2026)", priority: "HIGH" },
      { task: "Prepare a live test requisition demo environment in Smart Screen.ai to showcase calibrated scoring with resume evidence citations.", deadline: "Tonight (Sep 10, 2026)", priority: "HIGH" }
    ],
    do_this_week: [
      { task: "Connect with Priya Nair (CTO, CloudForge) on LinkedIn and send modular enterprise comparison document.", deadline: "Friday, Sep 12, 2026", priority: "MEDIUM" },
      { task: "Draft a 1-page compliance brief highlighting SimpleNow's DPDP-compliant WhatsApp candidate messaging audit trail.", deadline: "Sunday, Sep 14, 2026", priority: "MEDIUM" }
    ],
    do_later: [
      { task: "Schedule an introductory call with Vikram Malhotra (Deccan Horizons) regarding enterprise pipeline agent metrics.", deadline: "Next week", priority: "LOW" },
      { task: "Publish an engineering article on 'Why Verifiable Resume Citations Beat Black-Box ATS Scoring'.", deadline: "End of month", priority: "LOW" }
    ]
  },
  top_3_recommendations: [
    "1. Close the ABC Corp Pilot: Rahul Sharma is a high-intent buyer who publicly committed to signing a pilot this week if shown calibrated scoring with evidence citations. Strike while the iron is hot.",
    "2. Commercialize the WhatsApp Compliance Angle: Recruiter WhatsApp messaging is a massive unaddressed corporate compliance blind spot that SimpleNow is uniquely positioned to solve.",
    "3. Exploit LinkedIn's $18k Pricing Friction: Use LinkedIn Hiring Assistant's exorbitant cost and closed-garden lock-in as an anchor to demonstrate SimpleNow's superior ROI and data ownership."
  ],
  scorecard: {
    knowledge_score: 88,
    opportunities_score: 94,
    networking_score: 91,
    competitive_score: 85,
    overall_score: 90,
    rationale: "Exceptional commercial yield. Identified an immediate enterprise pilot opportunity (ABC Corp), captured crucial competitor pricing intelligence ($18k LinkedIn seat), and verified urgent unmet demand for compliant WhatsApp candidate communication."
  }
};

export const DEMO_REPORT = {
  executive_brief: [
    "Enterprise AI buying criteria in 2026 has transitioned from conversational copilots to autonomous agents executing multi-step back-office workflows.",
    "Major customer pain point identified: Tech hiring bottlenecks are driven by poor ATS screening calibration and opaque, hallucinated scoring rather than candidate sourcing volume.",
    "Immediate High-Value Opportunity: Rahul Sharma (VP TA, ABC Corp) publicly declared readiness to sign an AI screening pilot before Friday if shown calibrated scoring with verifiable resume evidence citations.",
    "Critical Competitive Intelligence: LinkedIn Hiring Assistant pricing confirmed at $18,000/seat/year, creating substantial enterprise resistance and openness to open, modular alternatives.",
    "Unmet Enterprise Need: Corporate recruiters are using personal phones for manual candidate WhatsApp outreach with zero ATS integration or DPDP compliance logging.",
    "Overall Event Value: 90/100 (Tier-1 commercial opportunity with direct buyer access)."
  ],
  what_happened: "TechSparks 2026 Bengaluru convened over 350 enterprise technology leaders, founders, and investors at the Marriott Grand Ballroom. The keynote and subsequent panel focused on the enterprise transition from AI copilots to autonomous workflow agents. Key discussions surfaced severe friction in legacy ATS platforms (Workday/SuccessFactors), high cost resistance to LinkedIn's proprietary tools, and urgent demand for verifiable, evidence-grounded candidate evaluation.",
  full_markdown: `# Intelexa Event Intelligence Report
**Event:** TechSparks 2026: The Agentic Enterprise — AI in Action  
**Date:** September 10, 2026 | 5:04 PM – 7:12 PM  
**Location:** Marriott Grand Ballroom, Bengaluru  
**Attendees:** ~350 enterprise executives, VP of TA, CTOs, Investors  

---

## 1. Executive Brief
- **Agentic Shift:** Enterprises have moved from chatbot copilots to workflow execution agents that interface with core databases and legacy ATS/ERP systems.
- **Screening Bottleneck:** Recruiter pain is not applicant volume, but screening calibration and the black-box hallucination of legacy ATS tools.
- **Hot Opportunity:** Rahul Sharma (VP Talent Acquisition, ABC Corp) is actively evaluating solutions and committed to a pilot trial if shown calibrated scoring with verbatim resume evidence.
- **Competitor Signal:** LinkedIn Hiring Assistant is facing pushback due to an $18,000/seat/year price point and closed-garden lock-in.
- **Market Gap:** Severe compliance hazard in manual recruiter WhatsApp messaging; enterprise buyers need automated, opt-in compliant candidate outreach.

---

## 2. What Happened
The session opened with Dr. Ananya Sen breaking down why 2026 enterprise software procurement is rejecting generic conversational bots in favor of autonomous task agents. A heated panel discussion followed between ABC Corp's TA head, CloudForge's CTO, and Deccan Horizons venture partners regarding legacy ATS limitations, candidate evaluation accuracy, and compliance risks under India's DPDP Act and European AI regulations.

---

## 3. What Matters (Top Insights)
1. **[OBSERVED] Screening Calibration & Provenance Bottleneck**  
   *What was said:* Recruiters are overwhelmed with resumes, but current AI ranking tools hallucinate scores without verifiable evidence (Rahul Sharma, 00:12:35).  
   *What it means:* Buyers will only trust AI tools that trace every claim back to exact resume excerpts.  
   *Why it matters to you:* Matches SimpleNow's Smart Screen core differentiator.

2. **[INFERRED] LinkedIn Hiring Assistant Vulnerability**  
   *What was said:* CloudForge CTO Priya Nair noted LinkedIn's $18k annual seat license locks companies into their proprietary platform (00:22:10).  
   *What it means:* Mid-market tech firms want open, cost-effective infrastructure they own.  
   *Why it matters to you:* High-leverage competitive wedge for SimpleNow's Talent suite.

3. **[OBSERVED] Unregulated WhatsApp Outreach Risk**  
   *What was said:* Recruiters currently message candidates on WhatsApp via personal devices without ATS audit logging (01:35:10).  
   *What it means:* Massive DPDP legal risk and zero corporate visibility.  
   *Why it matters to you:* Immediate justification for SimpleNow's automated WhatsApp candidate workflow.

---

## 4. Top Opportunities
- 🔥 **High Priority:** Immediate pilot with ABC Corp (Rahul Sharma, VP TA). Action: Send demonstration requisition proposal tonight.
- 🔥 **High Priority:** Compliant WhatsApp recruitment module addressing DPDP compliance risks.
- 🟡 **Medium Priority:** Modular alternative to LinkedIn Hiring Assistant for CloudForge (Priya Nair, CTO).
- ⚪ **Low Priority:** Portfolio introduction to Deccan Horizons fund (Vikram Malhotra).

---

## 5. Action Plan
- **Do Today:** Dispatch follow-up email and WhatsApp note to Rahul Sharma; spin up Smart Screen demo environment.
- **Do This Week:** Connect with Priya Nair on LinkedIn; produce 1-page WhatsApp DPDP compliance one-pager.
- **Do Later:** Follow up with Vikram Malhotra on venture metrics.

---

## 6. Event Scorecard (AI Assessment)
- **Knowledge Gained:** 88/100  
- **Business Opportunities:** 94/100  
- **Networking Value:** 91/100  
- **Competitive Intelligence:** 85/100  
- **Overall Value:** 90/100  
`,
  email_delivery_status: "sent",
  whatsapp_delivery_status: "sent",
  delivery_log: [
    { channel: "email", recipient: "shree@simplenow.ai", status: "sent", timestamp: "2026-09-10T19:15:22+05:30" },
    { channel: "whatsapp", recipient: "+91 98860 12345", status: "sent", timestamp: "2026-09-10T19:15:25+05:30" },
    { channel: "email", recipient: "rahul@simplenow.ai", status: "sent", timestamp: "2026-09-10T19:15:28+05:30" },
    { channel: "whatsapp", recipient: "+91 98860 54321", status: "sent", timestamp: "2026-09-10T19:15:30+05:30" }
  ]
};

export const DEMO_QA_PAIRS = [
  {
    question: "What were the three biggest insights from the event?",
    answer: `The three biggest insights are:\n\n1. **Screening Calibration Over Volume [00:12:35]**: TA leaders like Rahul Sharma (ABC Corp) are not looking for more candidate volume. Their critical pain point is that current AI screening hallucinates fit scores and lacks calibrated alignment with hiring managers.\n\n2. **LinkedIn Pricing & Lock-in Vulnerability [00:22:10]**: LinkedIn Hiring Assistant is priced at a staggering $18,000/seat/year, creating strong enterprise buyer resistance and an appetite for modular, vendor-neutral alternatives.\n\n3. **Unregulated Candidate WhatsApp Outreach [01:35:10]**: Corporate recruiters are messaging candidates via personal phones without ATS logging, exposing enterprises to severe DPDP regulatory fines and compliance liabilities.`,
    citations: ["00:12:35", "00:22:10", "01:35:10"]
  },
  {
    question: "Who should I follow up with first and what did they say?",
    answer: `You should immediately follow up with **Rahul Sharma, VP Talent Acquisition at ABC Corp [00:39:15]**.\n\nHe explicitly stated that if an AI screening vendor can demonstrate calibrated scoring with verifiable resume evidence on one of their open requisitions, he would **sign an enterprise pilot before Friday**.\n\nA pre-composed personalized email, WhatsApp message, and LinkedIn note have been prepared in your Follow-Up Drafts tab.`,
    citations: ["00:39:15"]
  },
  {
    question: "Prepare a 30-second briefing for my CEO.",
    answer: `**30-Second Executive Briefing:**\n"At TechSparks Bengaluru, enterprise buyers confirmed a major shift: they are rejecting conversational chatbots in favor of autonomous workflow agents that connect to core systems. ABC Corp's VP of Talent Acquisition is ready to pilot an AI screening tool this week if it provides verifiable CV evidence citations. Concurrently, enterprise backlash against LinkedIn's $18k/seat pricing presents a major window for SimpleNow to capture market share. I have already initiated follow-ups for a Friday pilot demonstration."`,
    citations: ["00:04:20", "00:39:15", "00:22:10"]
  }
];
