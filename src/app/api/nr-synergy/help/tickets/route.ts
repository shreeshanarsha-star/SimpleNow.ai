import { NextResponse } from "next/server";
import { guard, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";
import { isTicketCategory } from "@/app/tools/nr-synergy/help/_lib";

// POST { category, title, description? }: open a ticket for the caller.
// User client: nrs_tickets allows own insert when the help feature is on.
export async function POST(req: Request) {
  const g = await guard("help");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const body = await readBody(req);
  if (!body) return jsonError("Invalid request body");
  if (!isTicketCategory(body.category)) return jsonError("Choose a category");
  const title = optText(body.title, 200);
  if (!title) return jsonError(title === undefined ? "Subject is too long (200 characters max)" : "Please add a subject");
  const description = optText(body.description, 4000);
  if (description === undefined) return jsonError("Details are too long (4000 characters max)");

  const { data, error } = await supabase
    .from("nrs_tickets")
    .insert({ org_id: member.org_id, member_id: member.id, category: body.category, title, description })
    .select("id")
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
