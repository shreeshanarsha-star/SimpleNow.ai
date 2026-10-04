import { NextResponse } from "next/server";
import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/time/status — tiny payload for the top-bar check-in pill.
// Never errors for people outside NR Synergy: they just get { member: false }
// and the pill stays hidden.
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const ctx = await getNrsContext();
    const member = ctx?.member;
    if (!ctx || !member || !hasNrsAccess(ctx) || !ctx.features.time) {
      return NextResponse.json({ member: false }, { headers });
    }
    const supabase = await createClient();
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const { data } = await supabase
      .from("nrs_work_logs")
      .select("check_in_at, check_out_at, mode, timezone")
      .eq("member_id", member.id)
      .gte("check_in_at", since)
      .order("check_in_at", { ascending: false })
      .limit(10);
    const logs = (data ?? []) as { check_in_at: string; check_out_at: string | null; mode: string; timezone: string }[];
    const open = logs.find((l) => !l.check_out_at) ?? null;
    // Minutes already worked today (closed logs that started today in the log's own timezone).
    const today = (tz: string) => new Date().toLocaleDateString("en-CA", { timeZone: tz || "UTC" });
    const closedToday = logs.filter(
      (l) => l.check_out_at && new Date(l.check_in_at).toLocaleDateString("en-CA", { timeZone: l.timezone || "UTC" }) === today(l.timezone)
    );
    const workedMin = closedToday.reduce(
      (sum, l) => sum + Math.max(0, Math.round((new Date(l.check_out_at as string).getTime() - new Date(l.check_in_at).getTime()) / 60_000)),
      0
    );
    return NextResponse.json(
      {
        member: true,
        firstName: member.full_name.split(" ")[0],
        open: open ? { since: open.check_in_at, mode: open.mode } : null,
        workedTodayMin: workedMin,
      },
      { headers }
    );
  } catch {
    return NextResponse.json({ member: false }, { headers });
  }
}
