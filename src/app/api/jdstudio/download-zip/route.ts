import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { zipFiles } from "@/lib/jdstudio/zip";

export const maxDuration = 60;

export async function GET(request: Request) {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : [];
  if (!ids.length) return NextResponse.json({ error: "No requests selected." }, { status: 400 });

  const { data: rows, error } = await supabase
    .from("jdstudio_requests")
    .select("id, job_title, department, final_docx_path")
    .eq("owner_id", user.id)
    .in("id", ids)
    .not("final_docx_path", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: "None of the selected JDs have a final document yet." }, { status: 400 });

  const admin = createAdminClient();
  const files: { name: string; buffer: Buffer }[] = [];
  for (const row of rows) {
    const { data, error: dlError } = await admin.storage.from("jdstudio").download(row.final_docx_path as string);
    if (dlError || !data) continue;
    const buffer = Buffer.from(await data.arrayBuffer());
    const safeName = `${(row.job_title || "JD").replace(/[^a-zA-Z0-9 _-]/g, "")}_${row.department}`.trim() || row.id;
    files.push({ name: `${safeName}.docx`, buffer });
  }
  if (!files.length) return NextResponse.json({ error: "Couldn't retrieve any final documents." }, { status: 500 });

  const zipBuffer = await zipFiles(files);
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="jd-studio-export.zip"`,
    },
  });
}
