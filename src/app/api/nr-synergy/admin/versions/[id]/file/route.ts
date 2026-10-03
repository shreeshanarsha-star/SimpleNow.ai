import { HttpError, dbCheck, guard, ok, run, uuid } from "@/lib/nrs/invoice/kit";
import { policyDownloadName, policySignedUrl } from "../../_pdf";

export const dynamic = "force-dynamic";

// GET: 10-minute signed URL for a version's PDF (HR preview, drafts included).
// ?download=1 asks the browser to save it instead of showing it.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { id } = await params;
    const { data, error } = await g.admin
      .from("nrs_document_versions")
      .select("version, file_path, nrs_documents!inner(title)")
      .eq("id", uuid(id, "Version"))
      .eq("org_id", g.orgId)
      .maybeSingle();
    dbCheck(error, "Version");
    const row = data as { version: string; file_path: string | null; nrs_documents: { title: string } | { title: string }[] } | null;
    if (!row?.file_path) throw new HttpError("No PDF on this version", 404);
    const doc = Array.isArray(row.nrs_documents) ? row.nrs_documents[0] : row.nrs_documents;
    const download = new URL(req.url).searchParams.get("download") === "1";
    const url = await policySignedUrl(g.admin, g.orgId, row.file_path, {
      download: download ? policyDownloadName(doc?.title ?? "Policy", row.version) : undefined,
    });
    return ok({ url });
  });
}
