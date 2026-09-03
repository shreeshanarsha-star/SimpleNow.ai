import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractFileText } from "@/lib/jdstudio/extractText";
import { classifyUpload, extractRecipientRows, draftAnswersFromSampleJd } from "@/lib/jdstudio/ai";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/jdstudio/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const mode = form?.get("mode") === "auto" ? "auto" : "manual";
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file to process." }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 15MB)." }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  const extFromName = lowerName.match(/\.(xlsx|xls|csv|docx|pdf|txt)$/)?.[1] || "";
  const ext = ALLOWED_UPLOAD_TYPES[file.type] || extFromName;
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported file type -- drop a spreadsheet (.xlsx/.csv), a Word doc, a PDF, or a .txt list." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const admin = createAdminClient();
  const uploadId = randomUUID();
  const filePath = `${user.id}/uploads/${uploadId}.${ext}`;

  const { error: uploadError } = await admin.storage
    .from("jdstudio")
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `Couldn't save this file: ${uploadError.message}` }, { status: 500 });
  }

  let extracted;
  try {
    extracted = await extractFileText(Buffer.from(bytes), file.name, file.type);
  } catch (err) {
    const { data: upload } = await admin
      .from("jdstudio_uploads")
      .insert({
        id: uploadId,
        owner_id: user.id,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        mode,
        status: "failed",
        error: err instanceof Error ? `Couldn't read this file: ${err.message}` : "Couldn't read this file.",
      })
      .select()
      .single();
    return NextResponse.json({ upload }, { status: 200 });
  }

  if (!extracted.fullText || extracted.fullText.trim().length < 10) {
    const { data: upload } = await admin
      .from("jdstudio_uploads")
      .insert({
        id: uploadId,
        owner_id: user.id,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        mode,
        status: "failed",
        error: "Couldn't find enough readable content in this file.",
      })
      .select()
      .single();
    return NextResponse.json({ upload }, { status: 200 });
  }

  let classification;
  try {
    classification = await classifyUpload(extracted.fullText);
  } catch (err) {
    const { data: upload } = await admin
      .from("jdstudio_uploads")
      .insert({
        id: uploadId,
        owner_id: user.id,
        file_path: filePath,
        file_name: file.name,
        mime_type: file.type || null,
        mode,
        status: "failed",
        error: err instanceof Error ? `AI classification failed: ${err.message}` : "AI classification failed.",
      })
      .select()
      .single();
    return NextResponse.json({ upload }, { status: 200 });
  }

  let extractedRows = null;
  let sampleAnswers = null;
  try {
    if (classification.kind === "master_data" || classification.kind === "email_list") {
      extractedRows = await extractRecipientRows(extracted.fullText);
    } else if (classification.kind === "sample_jd") {
      sampleAnswers = await draftAnswersFromSampleJd(extracted.fullText);
    }
  } catch {
    // Non-fatal -- the review screen falls back to manual entry.
  }

  const { data: upload, error: insertError } = await admin
    .from("jdstudio_uploads")
    .insert({
      id: uploadId,
      owner_id: user.id,
      file_path: filePath,
      file_name: file.name,
      mime_type: file.type || null,
      mode,
      kind: classification.kind,
      status: "awaiting_review",
      classification: { ...classification, row_count: extractedRows?.length ?? undefined, sample_answers: sampleAnswers },
      extracted_rows: extractedRows,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ upload });
}

export async function GET() {
  let user, supabase;
  try {
    ({ user, supabase } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const { data, error } = await supabase
    .from("jdstudio_uploads")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ uploads: data });
}
