import { callTextModel, AI_TIMEOUT_MS } from "@/lib/aiClient";

// Thin adapter so the ported Gauri.ai prompt files (gauriConversation.ts,
// gauriVet.ts) can keep their original askClaude(systemPrompt, userMessage,
// maxTokens) call shape from askshree-app (v1), which sent system+user as
// two separate chat messages. v2's shared aiClient only exposes a single
// combined-prompt callTextModel(), so this just concatenates the two
// exactly as they'd read in a system+user exchange -- same content, one
// message instead of two, functionally equivalent for a completion model.
export async function askGauriAI(systemPrompt: string, userMessage: string, maxTokens = 2000): Promise<string> {
  const combined = `${systemPrompt}\n\n${userMessage}`;
  return callTextModel(combined, maxTokens, AI_TIMEOUT_MS);
}
