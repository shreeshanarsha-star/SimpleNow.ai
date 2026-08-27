import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { JOTZ_CATEGORIES } from "@/lib/jotzAI";

// List the signed-in user's Jotz items -- RLS (user_id = auth.uid()) is
// what actually enforces isolation here, this route just adds the
// optional category/keyword filters on top. Same "not feature-gated,
// owner-scoped" rule as every other Personal Tool.
export async function GET(request: Request) {
  let supabase;
  try {
    ({ supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim();

  let query = supabase.from("jotz_items").select("*").order("created_at", { ascending: false });

  if (category && (JOTZ_CATEGORIES as readonly string[]).includes(category)) {
    query = query.eq("category", category);
  }

  // V1 keyword search: title / AI summary / AI-guessed item type / tags --
  // plain ILIKE, no semantic search infra to stand up for this.
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    query = query.or(
      `title.ilike.${like},ai_summary.ilike.${like},item_type.ilike.${like},tags.cs.{${q.replace(/[{},"]/g, "")}}`
    );
  }

  const { data: items, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items });
}
