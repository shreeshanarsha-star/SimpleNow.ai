import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { generateJdDocx } from "@/lib/jdstudio/docgen";
import type { JdTemplate } from "@/lib/jdstudio/types";

export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const { data: req, error } = await supabase
    .from("jdstudio_requests")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!req) return NextResponse.json({ error: "Request not found." }, { status: 404 });
  if (!req.ai_draft_json) return NextResponse.json({ error: "No draft available for download." }, { status: 400 });

  const url = new URL(request.url);
  const formatParam = url.searchParams.get("format") || req.template || "external";
  const template: JdTemplate = formatParam === "internal" ? "internal" : "external";

  try {
    const buffer = await generateJdDocx(
      {
        jobTitle: req.job_title || "Job Description",
        department: req.department || "General",
        draft: req.ai_draft_json,
      },
      template
    );

    const safeTitle = (req.job_title || "Role").replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeTitle}_${template}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate document." },
      { status: 500 }
    );
  }
}
