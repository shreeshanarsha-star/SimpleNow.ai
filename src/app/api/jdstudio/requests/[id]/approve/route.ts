import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAndStoreFinalDocx } from "@/lib/jdstudio/pipeline";
import type { JdStudioRequest } from "@/lib/jdstudio/types";

// Self-approve path (the owner is signed in on the dashboard). The
// "route to another email" path is decided via the public token instead
// (see /api/jdstudio/intake/[token] POST { action: "approve" }).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: req } = await supabase.from("jdstudio_requests").select("*").eq("id", id).eq("owner_id", user.id).maybeSingle();
  if (!req) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (req.status !== "pending_approval") {
    return NextResponse.json({ error: `Can't approve from status "${req.status}".` }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const docxPath = await generateAndStoreFinalDocx(admin, req as JdStudioRequest);
    const { data: updated, error } = await admin
      .from("jdstudio_requests")
      .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString(), final_docx_path: docxPath })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ request: updated });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't generate the final document." }, { status: 500 });
  }
}
