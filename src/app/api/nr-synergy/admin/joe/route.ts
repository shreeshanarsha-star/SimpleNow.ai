import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, str } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

const COLUMNS = "md_message_title, md_video_url, md_transcript, subtitles, updated_at";

export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { data, error } = await g.admin.from("nrs_joe_media").select(COLUMNS).eq("org_id", g.orgId).maybeSingle();
    dbCheck(error, "JOE media");
    return ok({ joe: data ?? null });
  });
}

// PUT {md_message_title, md_video_url, md_transcript}
export async function PUT(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const url = str(b.md_video_url, "Video URL", { optional: true, max: 2000 });
    if (url && !/^https:\/\//i.test(url)) throw new HttpError("Video URL must start with https://");
    const row = {
      org_id: g.orgId,
      md_message_title: str(b.md_message_title, "Title", { optional: true, max: 200 }),
      md_video_url: url,
      md_transcript: str(b.md_transcript, "Transcript", { optional: true, max: 50_000 }),
      updated_at: new Date().toISOString(),
    };
    const { error } = await g.admin.from("nrs_joe_media").upsert(row, { onConflict: "org_id" });
    dbCheck(error, "Saving JOE media");
    await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_joe_media", entityId: g.orgId, action: "upsert", after: { ...row, md_transcript: row.md_transcript ? `${row.md_transcript.length} chars` : null } });
    return ok({ ok: true });
  });
}
