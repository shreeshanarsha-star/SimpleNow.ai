import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, run, uploadPrivate, uuid } from "@/lib/nrs/invoice/kit";
import { CONTRACT_COLUMNS, runExtraction, toContractDto, type ContractRow } from "@/lib/nrs/invoice/contractServer";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

// GET: every contract in the org (HR only).
export async function GET() {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const { data, error } = await g.admin
      .from("nrs_contracts")
      .select(CONTRACT_COLUMNS)
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(300);
    dbCheck(error, "Contracts");
    const rows = (data ?? []) as ContractRow[];
    const ids = Array.from(new Set(rows.map((r) => r.member_id)));
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: ms } = await g.admin.from("nrs_members").select("id, full_name").in("id", ids);
      for (const m of (ms ?? []) as { id: string; full_name: string }[]) names.set(m.id, m.full_name);
    }
    return ok({ contracts: rows.map((r) => toContractDto(r, names.get(r.member_id) ?? "")) });
  });
}

// POST (multipart: member_id, file) -> store the PDF and run AI extraction.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError("Expected a form upload");
    }
    const memberId = uuid(form.get("member_id"), "Member");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new HttpError("Choose a contract PDF");
    if (file.type !== "application/pdf") throw new HttpError("The contract must be a PDF");
    if (file.size > MAX_BYTES) throw new HttpError("The PDF must be 15 MB or smaller");

    const { data: m, error: mErr } = await g.admin
      .from("nrs_members")
      .select("id, full_name")
      .eq("id", memberId)
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(mErr, "Member");
    if (!m) throw new HttpError("Member not found", 404);
    const member = m as { id: string; full_name: string };

    const { data: eng } = await g.admin
      .from("nrs_engagements")
      .select("id")
      .eq("member_id", memberId)
      .is("deleted_at", null)
      .order("starts_on", { ascending: false })
      .limit(1)
      .maybeSingle();

    const id = crypto.randomUUID();
    const path = `${g.orgId}/contracts/${memberId}/${id}.pdf`;
    await uploadPrivate(g.admin, path, file, "application/pdf");
    const { data, error } = await g.admin
      .from("nrs_contracts")
      .insert({
        id,
        org_id: g.orgId,
        member_id: memberId,
        engagement_id: (eng as { id: string } | null)?.id ?? null,
        file_path: path,
        file_name: file.name.slice(0, 200),
        status: "uploaded",
        uploaded_by: g.user.id,
      })
      .select(CONTRACT_COLUMNS)
      .single();
    if (error) await g.admin.storage.from("nrs-private").remove([path]);
    dbCheck(error, "Saving contract");
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_contracts",
      entityId: id,
      action: "upload",
      after: { member_id: memberId, file_name: file.name, size: file.size },
    });
    const extracted = await runExtraction(g.admin, data as ContractRow, g.user.id);
    return ok({ contract: toContractDto(extracted, member.full_name) }, 201);
  });
}
