import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractDocumentText } from "@/lib/contracts/textExtract";
import { classifyJotzImage, classifyJotzText, fallbackClassification } from "@/lib/jotzAI";

// Jotz.ai -- Personal Tool, not feature-gated (requireUser only, same rule
// as Contracts & eSign / personal_notes). One capture per request: save
// the original safely first, then run AI classification, then persist
// the result. The capture is never lost even if AI fails -- a failed or
// low-confidence classification still lands in "others" with the file
// intact, never silently dropped.
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB, matches the jotz storage bucket's limit
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function POST(request: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file to capture." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That file is too large (max 20MB)." }, { status: 400 });
  }

  const lowerName = file.name.toLowerCase();
  const extFromExt =
    (lowerName.match(/\.(png|jpe?g|webp|heic|heif|gif|pdf|docx?|)$/)?.[1] || "").replace("jpeg", "jpg");
  const ext = EXT_BY_MIME[file.type] || extFromExt;
  const isImage = file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "heic", "heif", "gif"].includes(ext);
  const isDoc = ["pdf", "doc", "docx"].includes(ext);
  if (!ext || (!isImage && !isDoc)) {
    return NextResponse.json(
      { error: "Jotz can capture images, PDFs, and Word documents right now." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const itemId = randomUUID();
  const filePath = `${user.id}/${itemId}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  // 1. Save the original safely, before anything else.
  const { error: uploadError } = await admin.storage
    .from("jotz")
    .upload(filePath, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: `Couldn't save that capture: ${uploadError.message}` }, { status: 500 });
  }

  const { error: insertError } = await admin.from("jotz_items").insert({
    id: itemId,
    user_id: user.id,
    category: "others",
    title: file.name,
    file_path: filePath,
    file_name: file.name,
    mime_type: file.type || null,
    ai_status: "processing",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 2-6. Send for AI analysis, determine type/category, extract structured
  // data. A failure here never loses the capture -- it just falls back to
  // Others with the original file still fully intact and downloadable.
  let classification;
  try {
    if (isImage) {
      const buffer = Buffer.from(bytes);
      const dataUrl = `data:${file.type || "image/jpeg"};base64,${buffer.toString("base64")}`;
      classification = await classifyJotzImage(dataUrl, file.name);
    } else {
      const { fullText } = await extractDocumentText(Buffer.from(bytes), file.name, file.type);
      if (!fullText || fullText.trim().length < 10) {
        classification = fallbackClassification(file.name, "couldn't read any text from this file");
      } else {
        classification = await classifyJotzText(fullText, file.name);
      }
    }
  } catch (err) {
    classification = fallbackClassification(
      file.name,
      err instanceof Error ? err.message : "AI analysis failed"
    );
  }

  const ai_status = classification.confidence === "low" && classification.category === "others" ? "failed" : "done";

  // 7. Persist the structured result, original stays associated via file_path.
  const { data: updated, error: updateError } = await admin
    .from("jotz_items")
    .update({
      category: classification.category,
      item_type: classification.item_type,
      title: classification.title,
      ai_summary: classification.ai_summary,
      extracted_data: classification.extracted_data,
      tags: classification.tags,
      ai_confidence: classification.confidence,
      ai_status,
      ai_error: ai_status === "failed" ? classification.ai_summary : null,
    })
    .eq("id", itemId)
    .select()
    .single();

  if (updateError) {
    // The original + a first-pass row are already safely saved; report
    // partial success rather than pretending nothing happened.
    return NextResponse.json(
      { error: `Saved the file, but couldn't finish organizing it: ${updateError.message}`, itemId },
      { status: 207 }
    );
  }

  return NextResponse.json({ item: updated });
}
