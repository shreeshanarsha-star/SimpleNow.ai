import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, NRS_BUCKET, contentMatchesType } from "@/lib/nrs/invoice/kit";

// Policy PDFs live in the private bucket at
//   nrs-private/{org}/policies/{documentId}/{version}.pdf
// The bucket only accepts PDF and images (no Word), so policies are PDF only.

export const POLICY_PDF_MAX_BYTES = 15 * 1024 * 1024;

/** Validate an uploaded policy file and return its bytes. Throws 400 with a readable message. */
export async function readPolicyPdf(file: File): Promise<Uint8Array> {
  const name = (file.name || "").toLowerCase();
  if (/\.(docx?|odt|rtf|pages)$/.test(name) || /word|officedocument|opendocument/.test(file.type)) {
    throw new HttpError("Word files can't be uploaded. Save the policy as PDF (File → Save as → PDF) and upload that.");
  }
  if (file.size === 0) throw new HttpError("The file is empty");
  if (file.size > POLICY_PDF_MAX_BYTES) throw new HttpError("The PDF is larger than 15 MB. Compress it and try again.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The client-sent MIME type isn't trusted: the content must start with %PDF-.
  if (!contentMatchesType(bytes, "application/pdf")) throw new HttpError("That file isn't a PDF. Upload as PDF.");
  return bytes;
}

/** Storage path for a version's PDF. Versions with unusual characters get a short id suffix so paths never collide. */
export function policyPdfPath(orgId: string, documentId: string, version: string, versionId: string): string {
  const safe = version.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_").slice(0, 40) || "v";
  const name = safe === version ? safe : `${safe}-${versionId.slice(0, 8)}`;
  return `${orgId}/policies/${documentId}/${name}.pdf`;
}

export const POLICY_URL_SECONDS = 600;

/** A file-name-safe "Title v1.2.pdf". */
export function policyDownloadName(title: string, version: string): string {
  const base = `${title} v${version}`.replace(/[^\p{L}\p{N} ._()&,-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${base || "policy"}.pdf`;
}

/** 10-minute signed URL for a policy PDF inside the org's folder. download=true forces a file download. */
export async function policySignedUrl(
  admin: SupabaseClient,
  orgId: string,
  path: string,
  opts: { download?: string } = {}
): Promise<string> {
  if (!path.startsWith(`${orgId}/policies/`) || path.includes("..")) throw new HttpError("File not found", 404);
  const { data, error } = await admin.storage
    .from(NRS_BUCKET)
    .createSignedUrl(path, POLICY_URL_SECONDS, opts.download ? { download: opts.download } : undefined);
  if (error || !data) throw new HttpError(error?.message ?? "Could not open the file", 500);
  return data.signedUrl;
}

export async function uploadPolicyPdf(admin: SupabaseClient, path: string, bytes: Uint8Array): Promise<void> {
  const { error } = await admin.storage.from(NRS_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new HttpError(`Upload failed: ${error.message}`, 500);
}
