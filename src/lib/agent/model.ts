import { getModel } from "@/lib/aiClient";

// Tool-calling-capable model call for the Ask Shree agent loop. Deliberately
// separate from lib/aiClient.ts's callTextModel (used by every other
// feature): those callers just want "prompt in, text out" and never need
// tool calls, so keeping this here avoids touching a function eleven other
// tools depend on. Same provider (OpenAI Chat Completions, same
// OPENAI_API_KEY/OPENAI_MODEL), same graceful-failure shape.

export type AgentMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type AgentModelResponse = {
  content: string | null;
  toolCalls: OpenAiToolCall[];
};

const AGENT_TIMEOUT_MS = 25_000;

export async function callAgentModel(
  messages: AgentMessage[],
  tools: ReturnType<typeof import("./actions").toOpenAiTools>
): Promise<AgentModelResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set on the server.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);

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
        messages,
        tools,
        tool_choice: "auto",
        max_tokens: 700,
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

  const choice = data?.choices?.[0]?.message;
  if (!choice) throw new Error("The model returned an empty response.");

  return {
    content: choice.content ?? null,
    toolCalls: Array.isArray(choice.tool_calls) ? choice.tool_calls : [],
  };
}
