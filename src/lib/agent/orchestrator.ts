import type { SupabaseClient } from "@supabase/supabase-js";
import { ACTION_REGISTRY, getAction, toOpenAiTools, type ActionContext } from "./actions";
import { callAgentModel, type AgentMessage } from "./model";

export type QueryResult = {
  conversationId: string;
  reply: string;
  resultType: "text" | "search" | "weather" | "currency" | "calc" | "clarify";
  resultData: Record<string, unknown> | null;
  toolsUsed: string[];
};

const MAX_TOOL_ITERATIONS = 4;
const HISTORY_MESSAGES = 12;

type TaskState = {
  lastQuery?: string;
  lastTool?: string;
  lastResults?: Array<{ index: number; label: string; detail?: string; link?: string }>;
  updatedAt?: string;
};

function toolResultTypeFor(toolName: string | null): QueryResult["resultType"] {
  switch (toolName) {
    case "search_web":
      return "search";
    case "get_weather":
      return "weather";
    case "convert_currency":
      return "currency";
    case "calculate":
      return "calc";
    default:
      return "text";
  }
}

// Builds a compact "here's what you searched for" list so a follow-up like
// "which one is better" or "the second one" has something concrete to
// resolve against, both in the system prompt and in task_state for the
// next turn.
function buildResultsFromToolData(toolName: string, data: Record<string, unknown>): TaskState["lastResults"] {
  if (toolName === "search_web" && Array.isArray(data.results)) {
    return (data.results as Array<{ title: string; link: string; snippet: string }>).map((r, i) => ({
      index: i + 1,
      label: r.title,
      detail: r.snippet,
      link: r.link,
    }));
  }
  return undefined;
}

function formatMemoryForPrompt(items: Array<{ key: string; value: string }>): string {
  if (!items.length) return "Nothing saved yet.";
  return items.map((m) => `- ${m.key}: ${m.value}`).join("\n");
}

function formatResultsForPrompt(results: TaskState["lastResults"]): string {
  if (!results || !results.length) return "None.";
  return results.map((r) => `${r.index}. ${r.label}${r.detail ? ` -- ${r.detail}` : ""}`).join("\n");
}

const SYSTEM_PROMPT = (memoryBlock: string, resultsBlock: string, lastQuery: string | null) => `You are Ask Shree, a helpful everyday assistant built into Askshree.com's homepage search bar. Users type or speak natural, casual requests -- treat this like a real assistant conversation, not a search engine.

Rules:
- Use a tool whenever the answer needs real, current, or precise information -- especially weather, currency conversion, math, or today's date/time. Never guess these; always call the matching tool.
- There is no maps/places/food-delivery/ride-hailing/shopping API connected yet. For "near me", directions, restaurants, or product requests, use search_web and be upfront that these are web search results, not a live maps/booking feed. Never claim you booked, ordered, called, or completed any real-world action -- nothing here can actually do that yet.
- You can write things yourself without a tool: job descriptions, interview questions, summaries, explanations, general knowledge. Only reach for a tool when the fact needs to be current, verified, or computed.
- If the request is genuinely ambiguous even given the conversation so far and what's known about the user, ask exactly ONE short, specific clarifying question -- don't interrogate, don't list many options.
- The user may refer back with "it", "that one", "the second one", "which one's better" -- resolve these using "Recent results" below.
- Keep replies short and conversational (2-4 sentences) unless the user asked for something inherently longer (a JD, a summary, interview questions) -- then be complete.
- Only call save_memory for something the user clearly wants remembered long-term (a preference, their city, etc.), not incidental details.
- Never fabricate that an external action succeeded.

Known about this user:
${memoryBlock}

Recent results (most recent search this conversation${lastQuery ? ` -- "${lastQuery}"` : ""}):
${resultsBlock}`;

export async function runAskShreeQuery(params: {
  supabase: SupabaseClient<any>;
  userId: string;
  message: string;
  conversationId?: string | null;
  clientLat?: number;
  clientLon?: number;
}): Promise<QueryResult> {
  const { supabase, userId, message, clientLat, clientLon } = params;
  const startedAt = Date.now();
  let modelCalls = 0;
  let toolCallCount = 0;
  const toolsUsed: string[] = [];
  let lastToolName: string | null = null;
  let lastToolData: Record<string, unknown> | null = null;

  // 1) Resolve or create the conversation.
  let conversationId = params.conversationId || null;
  let taskState: TaskState = {};
  if (conversationId) {
    const { data: convo } = await supabase
      .from("ask_shree_conversations")
      .select("id, task_state")
      .eq("id", conversationId)
      .maybeSingle();
    if (convo) {
      taskState = (convo.task_state as TaskState) || {};
    } else {
      conversationId = null; // stale/foreign id -- start fresh rather than error out
    }
  }
  if (!conversationId) {
    const { data: created, error: createError } = await supabase
      .from("ask_shree_conversations")
      .insert({ user_id: userId, title: message.slice(0, 80) })
      .select("id")
      .single();
    if (createError || !created) throw new Error(createError?.message || "Could not start a new conversation.");
    conversationId = created.id;
  }

  try {
    // 2) Recent conversation history for context.
    const { data: historyRows } = await supabase
      .from("ask_shree_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_MESSAGES);
    const history = (historyRows || []).reverse();

    // 3) Long-term user memory.
    const { data: memoryRows } = await supabase
      .from("ask_shree_memory")
      .select("key, value")
      .eq("user_id", userId)
      .limit(30);

    const systemPrompt = SYSTEM_PROMPT(
      formatMemoryForPrompt(memoryRows || []),
      formatResultsForPrompt(taskState.lastResults),
      taskState.lastQuery || null
    );

    const messages: AgentMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h): AgentMessage => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: message },
    ];

    const tools = toOpenAiTools();
    let finalReply: string | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await callAgentModel(messages, tools);
      modelCalls++;

      if (!response.toolCalls.length) {
        finalReply = response.content;
        break;
      }

      messages.push({ role: "assistant", content: response.content, tool_calls: response.toolCalls });

      for (const call of response.toolCalls) {
        const action = getAction(call.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          // malformed args from the model -- tell it so via the tool result, don't crash
        }

        let result;
        if (!action) {
          result = { ok: false, error: `Unknown tool "${call.function.name}".` };
        } else {
          const ctx: ActionContext = { userId, supabase, clientLat, clientLon };
          toolCallCount++;
          toolsUsed.push(action.name);
          try {
            result = await action.run(args, ctx);
          } catch (err) {
            result = { ok: false, error: err instanceof Error ? err.message : "Tool execution failed." };
          }
          if (result.ok) {
            lastToolName = action.name;
            lastToolData = result.data || null;
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 4000),
        });
      }
    }

    if (finalReply == null) {
      // Hit the iteration cap without a natural-language wrap-up -- force one
      // final call with no further tool use so the user still gets an answer
      // grounded in whatever tool results already came back.
      const forced = await callAgentModel(
        [...messages, { role: "user", content: "Please give your final answer now, in plain text, based on the information above." }],
        []
      );
      modelCalls++;
      finalReply = forced.content || "I wasn't able to finish that one -- could you try rephrasing?";
    }

    const resultType = toolResultTypeFor(lastToolName);
    const resultData = lastToolData;

    // Update task_state for follow-up resolution next turn.
    const nextTaskState: TaskState = { ...taskState };
    if (lastToolName && lastToolData) {
      const results = buildResultsFromToolData(lastToolName, lastToolData);
      if (results) {
        nextTaskState.lastResults = results;
        nextTaskState.lastQuery = message;
      }
      nextTaskState.lastTool = lastToolName;
      nextTaskState.updatedAt = new Date().toISOString();
    }

    // 4) Persist both turns + updated task state.
    await supabase.from("ask_shree_messages").insert([
      { conversation_id: conversationId, user_id: userId, role: "user", content: message },
      {
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: finalReply,
        tools_used: toolsUsed.length ? toolsUsed : null,
        result_type: resultType,
        result_data: resultData,
      },
    ]);
    await supabase
      .from("ask_shree_conversations")
      .update({ task_state: nextTaskState, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    await supabase.from("ask_shree_logs").insert({
      user_id: userId,
      conversation_id: conversationId,
      query: message,
      tools_used: toolsUsed.length ? toolsUsed : null,
      result_type: resultType,
      model_calls: modelCalls,
      tool_calls: toolCallCount,
      latency_ms: Date.now() - startedAt,
      success: true,
    });

    return {
      conversationId: conversationId as string,
      reply: finalReply,
      resultType,
      resultData,
      toolsUsed,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error.";
    await supabase.from("ask_shree_logs").insert({
      user_id: userId,
      conversation_id: conversationId,
      query: message,
      tools_used: toolsUsed.length ? toolsUsed : null,
      model_calls: modelCalls,
      tool_calls: toolCallCount,
      latency_ms: Date.now() - startedAt,
      success: false,
      error: errorMessage,
    });
    // Graceful, non-technical message to the user -- the real error is
    // already logged server-side above.
    return {
      conversationId: conversationId as string,
      reply: "I'm having trouble processing that right now. Please try again in a moment.",
      resultType: "text",
      resultData: null,
      toolsUsed,
    };
  }
}

export { ACTION_REGISTRY };
