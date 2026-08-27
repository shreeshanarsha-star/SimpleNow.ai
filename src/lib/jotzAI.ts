import { callTextModel, callVisionModel } from "@/lib/aiClient";

// Jotz.ai's AI layer -- "capture anything, AI sorts it". Strict JSON-only
// output, same convention as lib/talentAI.ts. One classification call per
// capture: identify what the item is, extract whatever structured fields
// make sense for it, decide which of the 10 Jotz categories it belongs in,
// and never make the user choose a folder up front (see lib/departments.ts
// PERSONAL_TOOLS entry + the Jotz product brief for the "why").

export const JOTZ_CATEGORIES = [
  "contacts",
  "documents",
  "receipts",
  "photos",
  "places",
  "memories",
  "products",
  "notes",
  "tasks",
  "others",
] as const;

export type JotzCategory = (typeof JOTZ_CATEGORIES)[number];

export const JOTZ_CATEGORY_LABELS: Record<JotzCategory, string> = {
  contacts: "Contacts",
  documents: "Documents",
  receipts: "Receipts",
  photos: "Photos",
  places: "Places",
  memories: "Memories",
  products: "Products",
  notes: "Notes",
  tasks: "Tasks",
  others: "Others",
};

export type JotzClassification = {
  category: JotzCategory;
  item_type: string; // e.g. "business_card", "receipt", "handwritten_note", "photo"
  title: string; // short human title, e.g. "Ravi Kumar - Acme Corp" or "DMart receipt"
  ai_summary: string; // one sentence, what this is
  extracted_data: Record<string, unknown>; // whatever structured fields apply
  tags: string[]; // secondary classification, e.g. ["Travel", "Coorg"]
  confidence: "high" | "medium" | "low";
};

function parseJsonResponse(text: string): JotzClassification {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const category: JotzCategory = JOTZ_CATEGORIES.includes(parsed.category) ? parsed.category : "others";
  return {
    category,
    item_type: typeof parsed.item_type === "string" ? parsed.item_type : "unknown",
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Untitled",
    ai_summary: typeof parsed.ai_summary === "string" ? parsed.ai_summary : "",
    extracted_data:
      parsed.extracted_data && typeof parsed.extracted_data === "object" ? parsed.extracted_data : {},
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === "string").slice(0, 8) : [],
    confidence: ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium",
  };
}

// Shared instructions for both the vision path (photos/scans) and the
// text path (extracted PDF/DOCX text). Keeps the JSON contract and
// category guidance identical regardless of capture method.
const CLASSIFY_INSTRUCTIONS = `You are Jotz.ai. A user captured something (a photo or an uploaded file) with no
indication of what it is or where it belongs -- your job is to figure that out completely, so the
user never has to pick a category themselves.

Respond as JSON only (no markdown fences, no prose), matching this exact shape:
{
  "category": one of "contacts" | "documents" | "receipts" | "photos" | "places" | "memories" | "products" | "notes" | "tasks" | "others",
  "item_type": short snake_case label, e.g. "business_card", "receipt", "id_document", "handwritten_note", "photo", "product_label",
  "title": short human-readable title (a person's name for a contact, a merchant name for a receipt, a document's title, a short photo caption, the note/task text itself if short),
  "ai_summary": one short plain sentence describing what this is,
  "extracted_data": an object with whatever fields genuinely apply -- extract only what is explicitly
    present, never invent a name, number, date, or amount that isn't actually there. Use fields like:
      - business card / contact: name, designation, company, phone, email, website, address
      - receipt: merchant, date, items (array of {name, price}), subtotal, tax, total, payment_method
      - document: document_type, title, date, organization_or_person, important_dates (array), entities (array)
      - photo: objects (array), scene, place, people (array, only if names are visibly labeled/written), date
      - product: product_name, brand, model, price
      - note: note_text
      - task: task_text, due_date (if a date/relative date like "tomorrow" is mentioned)
  "tags": array of up to 6 short secondary-classification tags (e.g. a travel photo might have
    tags ["Travel", "Coorg", "Memories"] while still living in category "photos"),
  "confidence": "high" | "medium" | "low" -- how sure you are about the category choice
}

Category guidance:
- A visiting/business card -> "contacts".
- A shop/restaurant/purchase receipt or invoice -> "receipts".
- A formal document (ID, certificate, letter, contract, form, statement, ticket) -> "documents".
- An ordinary photo of people/scenery/objects with no travel or event context -> "photos".
- A photo that is clearly of a specific place, landmark, or while traveling -> "places" (also fine to
  tag it "Memories" if it reads like a personal keepsake -- don't invent a second category for this,
  use tags instead).
- A product, packaging, or item for sale/reference -> "products".
- Handwritten or typed free text that is informational, not an action -> "notes".
- Handwritten or typed free text that describes something the user needs to DO (e.g. "Call Ravi
  tomorrow", "Pay rent by 5th", "Buy milk") -> "tasks". Put the action itself in extracted_data.task_text.
- If you cannot confidently tell what this is -> "others", with confidence "low", and put your best
  guess of what it might be in ai_summary so the user has something to go on.
Never leave category empty and never ask the user a question -- always commit to your best answer.`;

export async function classifyJotzImage(
  imageDataUrl: string,
  fileName: string
): Promise<JotzClassification> {
  const text = await callVisionModel(
    `${CLASSIFY_INSTRUCTIONS}\n\nThe captured file is named "${fileName}". Analyze the attached image.`,
    imageDataUrl,
    900
  );
  return parseJsonResponse(text);
}

export async function classifyJotzText(
  extractedText: string,
  fileName: string
): Promise<JotzClassification> {
  const text = await callTextModel(
    `${CLASSIFY_INSTRUCTIONS}\n\nThe captured file is named "${fileName}". Analyze the following text extracted from it:\n\n--- Extracted text ---\n${extractedText.slice(0, 12000)}`,
    900
  );
  return parseJsonResponse(text);
}

// Fallback used when AI classification fails outright (no key, API error,
// timeout, unparseable response) -- the capture itself must never be lost,
// it just lands in Others so the user can find and re-file it by hand.
export function fallbackClassification(fileName: string, reason: string): JotzClassification {
  return {
    category: "others",
    item_type: "unknown",
    title: fileName || "Untitled",
    ai_summary: `We couldn't understand this yet (${reason}). We've saved it to Others.`,
    extracted_data: {},
    tags: [],
    confidence: "low",
  };
}
