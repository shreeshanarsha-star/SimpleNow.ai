import { NextResponse } from "next/server";
import { guard, isUuid, jsonError, optText, readBody } from "@/app/tools/nr-synergy/_home/server";

// POST { to_member_id, value_id, message }: give kudos to a colleague for
// one of the org's values. User client (nrs_kudos allows own insert).
export async function POST(req: Request) {
  const g = await guard("home");
  if (!g.ok) return g.res;
  const { member, supabase } = g;

  const payload = await readBody(req);
  if (!payload) return jsonError("Invalid request body");
  const to = payload.to_member_id;
  const valueId = payload.value_id;
  if (!isUuid(to)) return jsonError("Choose who the kudos are for");
  if (to === member.id) return jsonError("You can't give kudos to yourself");
  if (!isUuid(valueId)) return jsonError("Choose a value");
  const message = optText(payload.message, 500);
  if (!message) return jsonError(message === undefined ? "Message is too long (500 characters max)" : "Write a short message");

  const [{ data: recipient }, { data: value }] = await Promise.all([
    supabase
      .from("nrs_members")
      .select("id")
      .eq("id", to)
      .eq("org_id", member.org_id)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle(),
    supabase.from("nrs_values").select("id").eq("id", valueId).eq("org_id", member.org_id).maybeSingle(),
  ]);
  if (!recipient) return jsonError("That colleague wasn't found", 404);
  if (!value) return jsonError("That value wasn't found", 404);

  const { error } = await supabase
    .from("nrs_kudos")
    .insert({ org_id: member.org_id, from_member_id: member.id, to_member_id: to, value_id: valueId, message });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}
