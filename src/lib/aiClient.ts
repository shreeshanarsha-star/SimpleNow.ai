// Shared text-generation client for every AI feature on the site
// (Talent.ai JD/resume parsing + pipeline summaries, Smart Screen.ai
// structuring + scoring, Job Postings.ai polish, Offer.ai polish, Jotz.ai
// capture classification). Uses OpenAI's Chat Completions API via a raw
// fetch call -- no SDK dependency, same "graceful, logged failure" shape
// as lib/email.ts's Resend integration. Swapped in from the Anthropic SDK
// because the Anthropic Console account hit an identity-verification
// wall; every caller kept the same "prompt in, plain text out" signature
// so no call-site logic (prompts, JSON parsing, etc.) had to change.
export const AI_TIMEOUT_MS = 25_000;
// Vision calls (Jotz.ai photographing a business card/receipt/document)
// need more headroom than a text-only completion.
export const AI_VISION_TIMEOUT_MS = 45_000;

export function hasAiKey() {
  return !!process.env.OPENAI_API_KEY;
}

export function getModel() {
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

async function chatCompletion(
  messages: unknown[],
  maxTokens: number,
  timeoutMs: number
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set on the server.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: getModel(),
        max_tokens: maxTokens,
        messages,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("The model timed out. Try again.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: { message?: string } }).error?.message) ||
      `OpenAI API error (${res.status})`;
    throw new Error(msg);
  }

  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("The model returned an empty response.");
  return text;
}

export async function callTextModel(
  prompt: string,
  maxTokens: number,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<string> {
  return chatCompletion([{ role: "user", content: prompt }], maxTokens, timeoutMs);
}

// Multimodal call for image understanding (Jotz.ai's business card /
// receipt / document / photo classification). gpt-4o-mini accepts an
// image alongside text in one user message -- same endpoint, same key,
// no separate vision integration to stand up. imageDataUrl must be a
// "data:<mime>;base64,<...>" string.
export async function callVisionModel(
  prompt: string,
  imageDataUrl: string,
  maxTokens: number,
  timeoutMs: number = AI_VISION_TIMEOUT_MS
): Promise<string> {
  return chatCompletion(
    [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    maxTokens,
    timeoutMs
  );
}
